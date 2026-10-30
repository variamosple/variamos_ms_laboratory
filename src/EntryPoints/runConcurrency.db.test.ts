import request from "supertest";

// The signed-in user is given by the x-test-user header (the real middleware is tested in authentication.db.test.ts).
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: any, res: any, next: any) => {
    const id = req.header("x-test-user");
    if (!id) return res.status(401).json({ errorCode: 401, message: "Please log in." });
    req.user = { id };
    next();
  },
}));

import fs from "fs";
import path from "path";
import { app } from "../app";
import sequelize from "../DataProviders/dataBase/VariamosORM";
import { migrate } from "../DataProviders/dataBase/migrate";
import { Config } from "../Config";
import MockReasoningGateway from "../DataProviders/reasoning/MockReasoningGateway";
import MockNotificationGateway from "../DataProviders/notifications/MockNotificationGateway";
import { ReasoningGateway, setReasoningGateway } from "../Domain/Reasoning/ReasoningGateway";
import { ReasoningJobRequest, ReasoningJobStatus, TransientReasoningError } from "../Domain/Reasoning/Entities/ReasoningJob";
import { setNotificationGateway } from "../Domain/Notifications/NotificationGateway";
import { RunExecutor, setRunExecutor } from "../DataProviders/execution/RunExecutor";
import RunRepository from "../DataProviders/repository/Laboratory/RunRepository";
import RunUseCase from "../Domain/Laboratory/RunUseCase";
import { OrmScenarioRun } from "../Domain/Laboratory/Entities/Run";

/**
 * Concurrency of runs, checked as hypotheses rather than examples. A scripted
 * Reasoning gateway lets a cancellation arrive at every point where the
 * executor waits for the Reasoning module (before and after each call), and
 * at chosen points inside the database work; after each schedule the same
 * hypotheses are checked:
 *
 * H1 LAB-RUN-03  the run ends in a final state: never left pending or running.
 * H2 LAB-RUN-04  a cancellation is answered 200 (run cancelled, with who) or 409 (run already finished); never an error.
 * H3 LAB-EX-07   the experiment shows the state of its run.
 * H4 LAB-MT-03   every scenario run has exactly one result per metric of the run.
 * H5 LAB-RUN-04  every job given to the Reasoning module ends: it finished, or it was cancelled.
 * H6 LAB-R-01    exactly one final event is recorded per run.
 * H7 LAB-RUN-03  a completed run has only completed scenario runs; a final run has no active scenario run.
 */

const SCHEMA = Config.DB.SCHEMA;
const ALICE = "user-alice";
const PROJECT = "project-alice";
const MODEL_ID = "model-car";
const minizinc = { version: "2.8.5", timeOut: 60, randomSeed: 42, mode: "satisfiability", variableSelection: "default", valueSelection: "default" };
const z3 = { version: "4.13.0", timeOut: 30, randomSeed: 7, mode: "enumeration" };

type CallKind = "submit" | "status";
type Fault = "submit-transient" | "status-transient" | "status-error";

/** What the Reasoning module does, call by call; the test may act before or after each call. */
class ScriptedGateway implements ReasoningGateway {
  readonly name = "scripted";
  private readonly catalog = new MockReasoningGateway();
  private calls = 0;
  private submits = 0;
  private statusCalls = 0;
  private readonly polls = new Map<string, number>();
  readonly submitted: string[] = [];
  readonly ended = new Set<string>();
  readonly cancelled = new Set<string>();

  constructor(
    private readonly faults: Fault[] = [],
    private readonly hook: (call: number, kind: CallKind, phase: "before" | "after") => void = () => undefined,
    /** Holds a call until the test lets it answer. */
    private readonly gate: (call: number) => Promise<void> = async () => undefined
  ) {}

  listSolvers() {
    return this.catalog.listSolvers();
  }

  private async around<T>(kind: CallKind, body: () => T): Promise<T> {
    const call = ++this.calls;
    this.hook(call, kind, "before");
    // Let the other side (a cancellation request) move on while the Reasoning module answers
    await new Promise((resolve) => setImmediate(resolve));
    await this.gate(call);
    try {
      return body();
    } finally {
      this.hook(call, kind, "after");
    }
  }

  async submit(_request: ReasoningJobRequest) {
    return this.around("submit", () => {
      this.submits++;
      if (this.submits === 1 && this.faults.includes("submit-transient")) throw new TransientReasoningError("Solver busy (scripted).");
      const jobId = `job-${this.submits}`;
      this.submitted.push(jobId);
      return { jobId };
    });
  }

  async status(jobId: string): Promise<ReasoningJobStatus> {
    return this.around("status", () => {
      this.statusCalls++;
      if (this.statusCalls === 1 && this.faults.includes("status-transient")) throw new TransientReasoningError("No answer in time (scripted).");
      if (this.statusCalls === 1 && this.faults.includes("status-error")) throw new Error("Unexpected answer from the Reasoning module (scripted).");
      const poll = (this.polls.get(jobId) ?? 0) + 1;
      this.polls.set(jobId, poll);
      if (poll === 1) return { jobId, state: "RUNNING" as const, progress: 0.5 };
      this.ended.add(jobId);
      return { jobId, state: "COMPLETED" as const, progress: 1, result: { satisfiable: true, products: 4 } };
    });
  }

  async cancel(jobId: string) {
    this.cancelled.add(jobId);
  }

  get callCount() {
    return this.calls;
  }
}

let executor: RunExecutor;
let metricIds: string[];

async function readyExperiment(name: string) {
  setReasoningGateway(new MockReasoningGateway());
  const created = await request(app).post("/experiments").set("x-test-user", ALICE).send({
    name,
    projectId: PROJECT,
    metrics: metricIds,
    scenarios: [
      { name: "MiniZinc", modelIds: [MODEL_ID], solverConfigs: { minizinc } },
      { name: "Z3", modelIds: [MODEL_ID], solverConfigs: { z3 } },
    ],
  });
  expect(created.status).toBe(201);
  expect((await request(app).put(`/experiments/${created.body.id}/ready`).set("x-test-user", ALICE)).status).toBe(200);
  return created.body.id as string;
}

interface Schedule {
  label: string;
  faults?: Fault[];
  /** Cancel when this gateway call happens, before or after it answers; none: no cancellation. */
  cancelAt?: { call: number; phase: "before" | "after" };
}

interface Outcome {
  schedule: string;
  violations: string[];
  cancelStatus: number | null;
  runStatus: string;
}

async function play(
  schedule: Schedule,
  setup?: (runId: string) => void,
  gate?: (call: number) => Promise<void>
): Promise<Outcome & { gateway: ScriptedGateway }> {
  const experimentId = await readyExperiment(schedule.label);
  let cancel = null as Promise<request.Response> | null;
  let runId = "";
  const gateway = new ScriptedGateway(schedule.faults, (call, _kind, phase) => {
    if (!cancel && schedule.cancelAt && schedule.cancelAt.call === call && schedule.cancelAt.phase === phase) {
      cancel = request(app).post(`/experiments/${experimentId}/runs/${runId}/cancel`).set("x-test-user", ALICE).then((r) => r);
    }
  }, gate);
  setReasoningGateway(gateway);

  // Started without the executor, so the test knows the run before its first call
  runId = (await new RunRepository().startRun(experimentId, ALICE)).id;
  setup?.(runId);
  executor.enqueue(runId);
  await executor.whenIdle();
  const cancelled: request.Response | null = cancel ? await cancel : null;
  await executor.whenIdle();

  return { ...(await check(schedule.label, experimentId, runId, cancelled, gateway)), gateway };
}

async function check(label: string, experimentId: string, runId: string, cancelled: request.Response | null, gateway: ScriptedGateway): Promise<Outcome> {
  const violations: string[] = [];
  const [[run]] = (await sequelize.query(`SELECT status, cancelled_by FROM ${SCHEMA}.run WHERE id = '${runId}'`)) as any;
  const [[experiment]] = (await sequelize.query(`SELECT status FROM ${SCHEMA}.experiment WHERE id = '${experimentId}'`)) as any;
  const [scenarioRuns] = (await sequelize.query(`SELECT id, status FROM ${SCHEMA}.scenario_run WHERE run_id = '${runId}'`)) as any;
  const [metrics] = (await sequelize.query(`SELECT scenario_run_id, count(*)::int AS n FROM ${SCHEMA}.metric_result WHERE run_id = '${runId}' GROUP BY scenario_run_id`)) as any;
  const [[events]] = (await sequelize.query(
    `SELECT count(*)::int AS n FROM ${SCHEMA}.experiment_history
     WHERE event_type IN ('run_completed', 'run_failed', 'run_cancelled') AND new_value->>'runId' = '${runId}'`
  )) as any;

  const final = ["completed", "failed", "cancelled"];
  if (!final.includes(run.status)) violations.push(`H1 the run is left '${run.status}'`);
  if (cancelled) {
    if (cancelled.status === 200 && !(run.status === "cancelled" && run.cancelled_by === ALICE)) violations.push(`H2 cancel answered 200 but the run is '${run.status}'`);
    if (cancelled.status === 409 && !["completed", "failed"].includes(run.status)) violations.push(`H2 cancel answered 409 but the run is '${run.status}'`);
    if (![200, 409].includes(cancelled.status)) violations.push(`H2 cancel answered ${cancelled.status}: ${cancelled.body?.message ?? ""}`);
  }
  if (experiment.status !== run.status) violations.push(`H3 the experiment is '${experiment.status}', its run '${run.status}'`);
  for (const scenarioRun of scenarioRuns) {
    const n = metrics.find((m: any) => m.scenario_run_id === scenarioRun.id)?.n ?? 0;
    if (final.includes(scenarioRun.status) && n !== metricIds.length) violations.push(`H4 a ${scenarioRun.status} scenario run has ${n} metric results, not ${metricIds.length}`);
  }
  const leaked = gateway.submitted.filter((job) => !gateway.ended.has(job) && !gateway.cancelled.has(job));
  if (leaked.length) violations.push(`H5 jobs neither finished nor cancelled: ${leaked.join(", ")}`);
  if (final.includes(run.status) && events.n !== 1) violations.push(`H6 ${events.n} final events for the run`);
  if (run.status === "completed" && scenarioRuns.some((s: any) => s.status !== "completed")) violations.push("H7 a completed run has a scenario run that did not complete");
  if (final.includes(run.status) && scenarioRuns.some((s: any) => !final.includes(s.status))) violations.push("H7 a final run still has an active scenario run");

  return { schedule: label, violations, cancelStatus: cancelled?.status ?? null, runStatus: run.status };
}

const strip = ({ schedule, violations, cancelStatus, runStatus }: Outcome): Outcome => ({ schedule, violations, cancelStatus, runStatus });

/** Every schedule played, with what it broke: the report of the verification. */
const report: Outcome[] = [];
const REPORT = process.env.RUN_CONCURRENCY_REPORT;

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8"));
  await sequelize.query(`INSERT INTO variamos."user" (id, "user", name, email) VALUES ('${ALICE}', 'alice', 'Alice', 'alice@example.org')`);
  await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name) VALUES ('${PROJECT}', '${ALICE}', 'Alice project')`);
  await sequelize.query(`INSERT INTO variamos.language (id, name, semantics) VALUES (1, 'Feature model', '{"elementTypes": ["Feature"]}')`);
  await sequelize.query(
    `INSERT INTO variamos.model (id, project_id, product_line_id, engineering_type, name, language_id, model)
     VALUES ('${MODEL_ID}', '${PROJECT}', 'pl-1', 'domain', 'Car', 1,
             '{"elements": [{"id": "car", "name": "Car"}, {"id": "gps", "name": "GPS"}], "relationships": [{"id": "r1", "sourceId": "car", "targetId": "gps"}]}')`
  );
  await migrate();
  const catalog = (await request(app).get("/metrics/public").set("x-test-user", ALICE)).body;
  metricIds = catalog.slice(0, 2).map((metric: any) => metric.id);
});

beforeEach(() => {
  executor = new RunExecutor({ concurrency: 2, maxRetries: 2, retryDelayMs: 5, pollIntervalMs: 5, maxRuntimeSeconds: 30 });
  setRunExecutor(executor);
  setNotificationGateway(new MockNotificationGateway());
  // RUN_CONCURRENCY_LOG=1 shows the errors the service logs during the schedules
  if (!process.env.RUN_CONCURRENCY_LOG) jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  await sequelize.close();
});

describe("a cancellation at every point where the run waits for the Reasoning module", () => {
  test.each<[string, Fault[]]>([
    ["no fault", []],
    ["a transient submit failure, then a retry", ["submit-transient"]],
    ["a status request that times out, then a retry", ["status-transient"]],
  ])("%s: H1 to H7 hold for every schedule", async (label, faults) => {
    // Without cancellation, to count the calls of a whole run
    const baseline = await play({ label: `${label}, not cancelled`, faults });
    report.push(strip(baseline));
    expect(baseline.runStatus).toBe("completed");
    const calls = baseline.gateway.callCount;

    const outcomes: Outcome[] = [baseline];
    for (let call = 1; call <= calls; call++) {
      for (const phase of ["before", "after"] as const) {
        const outcome = await play({ label: `${label}, cancelled ${phase} call ${call}`, faults, cancelAt: { call, phase } });
        report.push(strip(outcome));
        outcomes.push(outcome);
      }
    }
    expect(outcomes.length).toBe(1 + 2 * calls);
    expect(outcomes.filter((o) => o.violations.length).map(({ schedule, violations }) => ({ schedule, violations }))).toEqual([]);
  });
});

describe("a cancellation inside the database work of the executor", () => {
  test("cancel reads the active scenario runs, then the executor completes one, then cancel goes on", async () => {
    // Forced order: (1) the cancellation lists the scenario runs still active; (2) only then does the Reasoning
    // module answer that the last job completed, and the executor records it; (3) the cancellation goes on.
    let cancelRead: () => void = () => undefined;
    const cancelHasRead = new Promise<void>((resolve) => (cancelRead = resolve));
    let executorFinished: () => void = () => undefined;
    const executorHasFinished = new Promise<void>((resolve) => (executorFinished = resolve));
    let probing = false;

    const original = RunRepository.prototype.finishScenarioRun;
    jest.spyOn(RunRepository.prototype, "finishScenarioRun").mockImplementation(async function (this: RunRepository, ...args) {
      await original.apply(this, args);
      if (probing) executorFinished();
    });
    OrmScenarioRun.addHook("afterFind", "concurrencyProbe", async (found: any, options: any) => {
      if (!probing || !options?.transaction || !Array.isArray(found) || found.length === 0) return;
      cancelRead();
      // 2 s at most, so that a code that serialises the two sides does not hang the test
      await Promise.race([executorHasFinished, new Promise((resolve) => setTimeout(resolve, 2000))]);
    });
    try {
      // Call 6 is the status request that reports the last job completed; the cancellation arrives just before it
      const outcome = await play(
        { label: "cancel lists the active scenario runs, then the last job completes", cancelAt: { call: 6, phase: "before" } },
        () => undefined,
        async (call) => {
          if (call !== 6) return;
          probing = true;
          await Promise.race([cancelHasRead, new Promise((resolve) => setTimeout(resolve, 2000))]);
        }
      );
      report.push(strip(outcome));
      expect(outcome.violations).toEqual([]);
    } finally {
      OrmScenarioRun.removeHook("afterFind", "concurrencyProbe");
    }
  });
});

describe("jobs left to the Reasoning module", () => {
  test("a status request that fails without saying why: the job is stopped, not abandoned", async () => {
    const outcome = await play({ label: "status answered with an unexpected error", faults: ["status-error"] });
    report.push(strip(outcome));
    expect(outcome.violations).toEqual([]);
  });

  test("a restart: the jobs of the interrupted runs are stopped at start-up", async () => {
    const experimentId = await readyExperiment("interrupted by a restart");
    const gateway = new ScriptedGateway();
    setReasoningGateway(gateway);
    const runId = (await new RunRepository().startRun(experimentId, ALICE)).id;
    // The service stops while the first job runs: its id is recorded, nothing else happens
    const [[scenarioRun]] = (await sequelize.query(`SELECT id FROM ${SCHEMA}.scenario_run WHERE run_id = '${runId}' ORDER BY position LIMIT 1`)) as any;
    await sequelize.query(`UPDATE ${SCHEMA}.run SET status = 'running' WHERE id = '${runId}'`);
    await sequelize.query(`UPDATE ${SCHEMA}.scenario_run SET status = 'running', job_id = 'job-before-restart' WHERE id = '${scenarioRun.id}'`);
    gateway.submitted.push("job-before-restart");

    expect(await new RunUseCase().failInterruptedRuns()).toBe(1);

    const outcome = await check("restart during a job", experimentId, runId, null, gateway);
    report.push(strip(outcome));
    expect(outcome.violations).toEqual([]);
  });
});
