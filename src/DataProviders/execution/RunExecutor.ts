import { Config } from "../../Config";
import { getReasoningGateway } from "../../Domain/Reasoning/ReasoningGateway";
import { ReasoningJobRequest, ReasoningJobStatus, TransientReasoningError } from "../../Domain/Reasoning/Entities/ReasoningJob";
import { RunProvenance } from "../../Domain/Laboratory/Entities/Run";
import RunRepository, { ScenarioRunPlan } from "../repository/Laboratory/RunRepository";
import { computeMetrics, notComputed } from "../../Domain/Metrics/computeMetrics";

export interface RunExecutorOptions {
  /** Runs executed at the same time (job queue). */
  concurrency: number;
  /** LAB-RUN-06: retries after a transient failure. */
  maxRetries: number;
  retryDelayMs: number;
  pollIntervalMs: number;
  /** LAB-R-05: a scenario run taking longer fails with 'resource limit'. */
  maxRuntimeSeconds: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** LAB-RUN-04 asks for a cancellation in under 5 s: the Reasoning module gets 3 s to stop a job. */
const CANCEL_TIMEOUT_MS = 3000;

/**
 * Asks the Reasoning module to stop a job, without waiting more than
 * CANCEL_TIMEOUT_MS and without failing: the run is cancelled in any case.
 */
export async function releaseJob(jobId: string) {
  try {
    await Promise.race([
      getReasoningGateway().cancel(jobId),
      sleep(CANCEL_TIMEOUT_MS).then(() => {
        throw new Error(`no answer in ${CANCEL_TIMEOUT_MS} ms`);
      }),
    ]);
  } catch (error) {
    console.error(`The Reasoning module did not confirm the cancellation of job ${jobId}:`, error);
  }
}

/**
 * The job queue of the Laboratory (LAB-RUN-03): runs execute in the
 * background, one scenario run after the other, each through the Reasoning
 * gateway. The queue lives in this process; a run interrupted by a restart is
 * marked failed at start-up (RunRepository.failInterruptedRuns).
 */
export class RunExecutor {
  private readonly queue: string[] = [];
  private readonly running = new Set<Promise<void>>();
  private readonly cancelled = new Set<string>();
  /** Reasoning job in progress for each run. */
  private readonly currentJob = new Map<string, string>();

  constructor(
    private readonly options: RunExecutorOptions,
    private readonly runs = new RunRepository()
  ) {}

  enqueue(runId: string) {
    this.queue.push(runId);
    this.pump();
  }

  /** LAB-RUN-04: stops the run and releases the solver job it holds. */
  async cancel(runId: string) {
    this.cancelled.add(runId);
    const index = this.queue.indexOf(runId);
    if (index >= 0) this.queue.splice(index, 1);

    const jobId = this.currentJob.get(runId);
    if (jobId) {
      this.currentJob.delete(runId);
      await releaseJob(jobId);
    }
  }

  /** Resolves when no run is queued or executing (tests, shutdown). */
  async whenIdle() {
    while (this.running.size > 0 || this.queue.length > 0) {
      await Promise.all([...this.running]);
    }
  }

  private pump() {
    while (this.running.size < this.options.concurrency && this.queue.length > 0) {
      const runId = this.queue.shift()!;
      const task: Promise<void> = this.execute(runId)
        .catch(async (error) => {
          console.error(`Run ${runId} stopped on an error:`, error);
          await this.runs.finishRun(runId, "Internal error of the Laboratory during the run.").catch(() => undefined);
        })
        .finally(() => {
          this.running.delete(task);
          this.cancelled.delete(runId);
          this.currentJob.delete(runId);
          this.pump();
        });
      this.running.add(task);
    }
  }

  private async execute(runId: string) {
    const plan = await this.runs.planOf(runId);
    if (!plan || this.cancelled.has(runId)) return;
    if (!(await this.runs.markRunStarted(runId))) return;

    for (const scenarioRun of plan.scenarioRuns) {
      if (this.cancelled.has(runId)) return;
      await this.executeScenarioRun(runId, scenarioRun, plan.provenance);
    }

    if (!this.cancelled.has(runId)) {
      await this.runs.finishRun(runId);
    }
  }

  private async requestOf(scenarioRun: ScenarioRunPlan, provenance: RunProvenance): Promise<ReasoningJobRequest> {
    const snapshots = new Map<string, unknown>();
    const semantics = new Map<string, unknown>();
    for (const scenario of provenance.scenarios) {
      for (const model of scenario.models) {
        snapshots.set(model.hash, await this.runs.snapshotOf(model.hash));
        if (model.semanticsHash) semantics.set(model.semanticsHash, await this.runs.semanticsOf(model.semanticsHash));
      }
    }
    return jobRequestOf(provenance, scenarioRun.scenarioId, scenarioRun.solverId, snapshots, semantics);
  }

  private async executeScenarioRun(runId: string, scenarioRun: ScenarioRunPlan, provenance: RunProvenance) {
    const gateway = getReasoningGateway();
    const request = await this.requestOf(scenarioRun, provenance);
    const { maxRetries, retryDelayMs, pollIntervalMs, maxRuntimeSeconds } = this.options;
    // LAB-MT-03: every metric of the run gets a value or a reason, even when the scenario run fails
    const failed = (id: string, error: string, result: unknown = null) =>
      this.runs.finishScenarioRun(id, "failed", result, error, notComputed(provenance.metrics, `The scenario run failed: ${error}`));

    for (let attempt = 1; ; attempt++) {
      if (this.cancelled.has(runId)) return;
      const startedAt = new Date();
      if (!(await this.runs.startAttempt(scenarioRun.id, attempt, startedAt))) return;

      const retryable = attempt <= maxRetries;
      const transientFailure = async (message: string, jobId: string | null) => {
        await this.runs.recordAttempt(scenarioRun.id, attempt, jobId, "transient_error", message, startedAt);
        if (retryable) {
          await sleep(retryDelayMs);
          return true;
        }
        await failed(scenarioRun.id, `${message} (gave up after ${attempt} attempts)`);
        return false;
      };

      let jobId: string;
      try {
        jobId = (await gateway.submit(request)).jobId;
      } catch (error) {
        if (error instanceof TransientReasoningError) {
          if (await transientFailure(error.message, null)) continue;
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        await this.runs.recordAttempt(scenarioRun.id, attempt, null, "failed", message, startedAt);
        await failed(scenarioRun.id, message);
        return;
      }

      if (this.cancelled.has(runId)) {
        await releaseJob(jobId);
        await this.runs.recordAttempt(scenarioRun.id, attempt, jobId, "cancelled", null, startedAt);
        return;
      }
      this.currentJob.set(runId, jobId);
      await this.runs.setJob(scenarioRun.id, jobId);

      while (true) {
        if (this.cancelled.has(runId)) {
          await this.runs.recordAttempt(scenarioRun.id, attempt, jobId, "cancelled", null, startedAt);
          return;
        }

        if (Date.now() - startedAt.getTime() > maxRuntimeSeconds * 1000) {
          await releaseJob(jobId);
          this.currentJob.delete(runId);
          const message = `Failed (resource limit): the solver ran longer than ${maxRuntimeSeconds} s.`;
          await this.runs.recordAttempt(scenarioRun.id, attempt, jobId, "resource_limit", message, startedAt);
          await failed(scenarioRun.id, message);
          return;
        }

        let status: ReasoningJobStatus;
        try {
          status = await gateway.status(jobId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const transient = error instanceof TransientReasoningError;
          // No answer: the job may still hold a solver. A transient error stops it before the retry, below
          if (!transient) await releaseJob(jobId);
          status = { jobId, state: "FAILED", error: { message, transient } };
        }

        if (status.state === "COMPLETED") {
          this.currentJob.delete(runId);
          await this.runs.recordAttempt(scenarioRun.id, attempt, jobId, "completed", null, startedAt);
          const metrics = computeMetrics(provenance.metrics, { models: request.models, result: status.result });
          await this.runs.finishScenarioRun(scenarioRun.id, "completed", status.result, null, metrics);
          return;
        }

        if (status.state === "FAILED") {
          this.currentJob.delete(runId);
          const message = status.error?.message ?? "The Reasoning module reported a failure.";
          if (status.error?.transient) {
            // The job may still hold a solver (e.g. the status request timed out): stop it before trying again
            await releaseJob(jobId);
            if (await transientFailure(message, jobId)) break;
            return;
          }
          await this.runs.recordAttempt(scenarioRun.id, attempt, jobId, "failed", message, startedAt);
          await failed(scenarioRun.id, message);
          return;
        }

        if (status.progress !== undefined) await this.runs.setProgress(scenarioRun.id, status.progress);
        await sleep(pollIntervalMs);
      }
    }
  }
}

/**
 * The job sent for one scenario and solver: exactly the configuration frozen in
 * the provenance (LAB-CF-02, LAB-CF-04) and the model copies pinned at Ready,
 * with the semantics of their language, found by their hash (LAB-CF-01, LAB-RP-01).
 */
export function jobRequestOf(
  provenance: RunProvenance,
  scenarioId: string,
  solverId: string,
  snapshots: Map<string, unknown>,
  semantics: Map<string, unknown> = new Map()
): ReasoningJobRequest {
  const scenario = provenance.scenarios.find((s) => s.scenarioId === scenarioId);
  const solver = scenario?.solvers.find((s) => s.id === solverId);
  if (!scenario || !solver) {
    throw new Error(`Scenario ${scenarioId} with solver ${solverId} is not in the provenance of the run.`);
  }
  return {
    solver: { id: solver.id, version: solver.version, parameters: { ...solver.parameters } },
    models: scenario.models.map((model) => {
      if (!snapshots.has(model.hash) || snapshots.get(model.hash) === undefined) {
        throw new Error(`The pinned copy ${model.hash} of model ${model.modelId} is missing.`);
      }
      if (model.semanticsHash && semantics.get(model.semanticsHash) === undefined) {
        throw new Error(`The pinned semantics ${model.semanticsHash} of model ${model.modelId} is missing.`);
      }
      return { ...model, snapshot: snapshots.get(model.hash), semantics: model.semanticsHash ? semantics.get(model.semanticsHash) : null };
    }),
    operationalContext: scenario.operationalContext,
  };
}

let executor: RunExecutor | null = null;

export const getRunExecutor = (): RunExecutor => {
  if (!executor) {
    executor = new RunExecutor({
      concurrency: Config.RUNS.CONCURRENCY,
      maxRetries: Config.RUNS.MAX_RETRIES,
      retryDelayMs: Config.RUNS.RETRY_DELAY_MS,
      pollIntervalMs: Config.RUNS.POLL_INTERVAL_MS,
      maxRuntimeSeconds: Config.RUNS.MAX_RUNTIME_SECONDS,
    });
  }
  return executor;
};

/** Replaces the executor, for tests. */
export const setRunExecutor = (next: RunExecutor) => {
  executor = next;
};
