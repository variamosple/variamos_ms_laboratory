import { randomUUID } from "crypto";
import { Op, Transaction } from "sequelize";
import sequelize from "../../dataBase/VariamosORM";
import { Config } from "../../../Config";
import { OrmExperiment, ExperimentStatus } from "../../../Domain/Laboratory/Entities/Experiment";
import { OrmScenario, OperationalContext, SolverConfigs } from "../../../Domain/Laboratory/Entities/Scenario";
import { OrmScenarioModel } from "../../../Domain/Laboratory/Entities/ScenarioModel";
import { OrmExperimentMetric } from "../../../Domain/Laboratory/Entities/ExperimentMetric";
import { OrmExperimentHistory } from "../../../Domain/Laboratory/Entities/ExperimentHistory";
import {
  ACTIVE_RUN_STATUSES,
  AttemptOutcome,
  OrmMetricResult,
  OrmModelSnapshot,
  OrmSemanticsSnapshot,
  OrmRunPackage,
  OrmRun,
  OrmRunAttempt,
  OrmScenarioRun,
  RunProvenance,
  RunStatus,
  RunView,
} from "../../../Domain/Laboratory/Entities/Run";
import { ConflictError, NotFoundError, ValidationError } from "../../../Domain/Core/Entities/Errors";
import { canRun, featureNames, runRejection, validateForReady } from "../../../Domain/Laboratory/ExperimentLifecycle";
import { getReasoningGateway } from "../../../Domain/Reasoning/ReasoningGateway";
import { getNotificationGateway } from "../../../Domain/Notifications/NotificationGateway";
import ExperimentRepository from "./ExperimentRepository";
import { OrmUser } from "../../../Domain/Session/Entities/User";
import { OrmMetric } from "../../../Domain/Laboratory/Entities/Metric";
import { MetricValue, notComputed } from "../../../Domain/Metrics/computeMetrics";
import { newPersistentId, isPersistentId } from "../../../Domain/Results/persistentId";
import { buildPackage, readPackage } from "../../../Domain/Results/reproducibility";
import { compareRuns } from "../../../Domain/Results/runComparison";
import { sha256Hex } from "../../../Domain/Core/canonicalJson";
import { OrmExperimentVersion } from "../../../Domain/Laboratory/Entities/ExperimentVersion";
import { OrmExperimentUser, ExperimentRoleEnum } from "../../../Domain/Laboratory/Entities/ExperimentUser";
import { OrmScenarioModel as OrmPinnedModel } from "../../../Domain/Laboratory/Entities/ScenarioModel";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the executor needs to run one scenario run. */
export interface ScenarioRunPlan {
  id: string;
  position: number;
  scenarioId: string;
  solverId: string;
}

/**
 * P2 execution (LAB-RUN-01, 03, 04, 06, LAB-RP-02, LAB-R-01). Runs are
 * written here; the executor (RunExecutor) drives them. Updates to a run only
 * apply while it is pending or running: the database refuses any change to a
 * finished run.
 */
export default class RunRepository {
  private readonly experiments = new ExperimentRepository();

  /** LAB-RUN-01: starts a run of a Ready experiment, after checking it again. */
  async startRun(experimentId: string, userId: string): Promise<RunView> {
    const transaction = await sequelize.transaction();
    try {
      // LAB-COL-01: execute is given separately from write
      await this.experiments.ensureExperimentPermission(experimentId, userId, "execute", transaction);
      const experiment = (await OrmExperiment.findByPk(experimentId, { transaction, lock: transaction.LOCK.UPDATE }))!;

      if (!canRun(experiment.status)) {
        throw new ConflictError(runRejection(experiment.status));
      }

      const scenarios = await OrmScenario.findAll({
        where: { experimentId },
        include: [{ model: OrmScenarioModel, as: "models" }],
        order: [["position", "ASC"], [{ model: OrmScenarioModel, as: "models" }, "position", "ASC"]],
        transaction,
      });
      const metricCount = await OrmExperimentMetric.count({ where: { experimentId }, transaction });
      const metricIds = (await OrmExperimentMetric.findAll({ where: { experimentId }, attributes: ["metricId"], transaction })).map((row: any) => row.metricId);
      const metrics = await OrmMetric.findAll({ where: { id: metricIds }, order: [["name", "ASC"]], transaction });
      const gateway = getReasoningGateway();

      const pinned = scenarios.flatMap((scenario) => ((scenario as any).models ?? []) as OrmScenarioModel[]);
      const problems = validateForReady(
        {
          name: experiment.name,
          scenarios: scenarios.map((scenario) => ({
            id: scenario.id,
            name: scenario.name ?? undefined,
            modelIds: (((scenario as any).models ?? []) as OrmScenarioModel[]).map((model) => model.modelId),
            solverConfigs: scenario.solverConfigs ?? {},
            operationalContext: scenario.operationalContext ?? undefined,
          })),
          // Only their number is checked
          metricIds: Array(metricCount).fill("metric"),
        },
        {
          // The run uses the copies pinned at Ready, not the live models
          models: new Map(pinned.filter((model) => model.modelSnapshot).map((model) => [model.modelId, featureNames(model.modelSnapshot)])),
          solvers: await gateway.listSolvers(),
        }
      );
      pinned
        .filter((model) => !model.modelSnapshot || !model.modelSnapshotHash || !model.semanticsHash)
        .forEach((model) => problems.push(`The model ${model.modelId} is not pinned: mark the experiment Ready again.`));

      if (problems.length > 0) {
        throw new ValidationError("The experiment cannot run.", [...new Set(problems)]);
      }

      for (const model of pinned) {
        await OrmModelSnapshot.findOrCreate({
          where: { hash: model.modelSnapshotHash! },
          defaults: { hash: model.modelSnapshotHash!, modelId: model.modelId, languageId: model.modelLanguageId ?? null, snapshot: model.modelSnapshot },
          transaction,
        });
        await OrmSemanticsSnapshot.findOrCreate({
          where: { hash: model.semanticsHash! },
          defaults: { hash: model.semanticsHash!, languageId: model.modelLanguageId!, snapshot: model.semanticsSnapshot },
          transaction,
        });
      }

      const provenance: RunProvenance = {
        experiment: { id: experiment.id, name: experiment.name, version: experiment.version, projectId: experiment.projectId ?? null },
        startedBy: userId,
        laboratoryVersion: Config.VERSION,
        reasoning: { gateway: gateway.name },
        metrics: metrics.map((metric) => ({
          id: metric.id,
          code: metric.code ?? null,
          name: metric.name,
          unit: metric.unit ?? null,
          formula: metric.formula ?? null,
          requires: metric.requires ?? null,
        })),
        scenarios: scenarios.map((scenario, index) => ({
          scenarioId: scenario.id,
          name: scenario.name || `Scenario ${index + 1}`,
          models: (((scenario as any).models ?? []) as OrmScenarioModel[]).map((model) => ({
            modelId: model.modelId,
            languageId: model.modelLanguageId ?? null,
            hash: model.modelSnapshotHash!,
            pinnedAt: model.modelPinnedAt ? new Date(model.modelPinnedAt).toISOString() : null,
            semanticsHash: model.semanticsHash!,
          })),
          operationalContext: (scenario.operationalContext as OperationalContext | null) ?? null,
          // By id: JSONB does not keep the order the solvers were added in
          solvers: Object.entries((scenario.solverConfigs ?? {}) as SolverConfigs).sort(([a], [b]) => a.localeCompare(b)).map(([id, settings]) => {
            const { version, ...parameters } = settings;
            return { id, version: String(version), parameters };
          }),
        })),
      };

      // max() gives NaN when the experiment has no run yet
      const number = (Number(await OrmRun.max("number", { where: { experimentId }, transaction })) || 0) + 1;
      const runId = randomUUID();

      await OrmRun.create(
        {
          id: runId,
          experimentId,
          number,
          experimentVersion: experiment.version,
          status: "pending",
          startedBy: userId,
          provenance,
        },
        { transaction }
      );

      // LAB-CF-03: each scenario, and each of its solvers, runs on its own
      let position = 0;
      await OrmScenarioRun.bulkCreate(
        provenance.scenarios.flatMap((scenario) =>
          scenario.solvers.map((solver) => ({
            id: randomUUID(),
            runId,
            position: position++,
            scenarioId: scenario.scenarioId,
            scenarioName: scenario.name,
            solverId: solver.id,
            solverVersion: solver.version,
            status: "pending" as RunStatus,
            attempts: 0,
          }))
        ),
        { transaction }
      );

      await this.changeExperimentStatus(experiment, userId, "running", transaction);
      await OrmExperimentHistory.create(
        { experimentId, experimentVersion: experiment.version, userId, eventType: "run_started", newValue: { runId, number } },
        { transaction }
      );

      await transaction.commit();
      return this.view(runId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async listRuns(experimentId: string, userId: string): Promise<RunView[]> {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "read", undefined, true);
    const runs = await OrmRun.findAll({ where: { experimentId }, attributes: ["id"], order: [["number", "DESC"]] });
    return Promise.all(runs.map((run) => this.view(run.id)));
  }

  /**
   * P3: the experiment and the runs whose results are compared, exported or
   * benchmarked; all its runs when `runIds` is empty.
   */
  async resultsOf(experimentId: string, userId: string, runIds: string[] = []) {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "read", undefined, true);
    if (runIds.some((id) => !UUID_PATTERN.test(id))) throw new NotFoundError("Run not found.");

    const rows = await OrmRun.findAll({
      where: { experimentId, ...(runIds.length ? { id: runIds } : {}) },
      attributes: ["id"],
      order: [["number", "ASC"]],
    });
    if (runIds.length && rows.length !== new Set(runIds).size) throw new NotFoundError("Run not found.");

    const experiment = (await OrmExperiment.findByPk(experimentId))!;
    return {
      experiment: {
        id: experiment.id,
        name: experiment.name,
        version: experiment.version,
        description: experiment.description,
        hypothesis: experiment.hypothesis,
        projectId: experiment.projectId ?? null,
      },
      runs: await Promise.all(rows.map((row) => this.view(row.id))),
    };
  }

  /** LAB-RP-02: a run with its provenance, scenario runs and every attempt. */
  async getRun(experimentId: string, runId: string, userId: string): Promise<RunView> {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "read", undefined, true);
    const run = UUID_PATTERN.test(runId) ? await OrmRun.findOne({ where: { id: runId, experimentId } }) : null;
    if (!run) throw new NotFoundError("Run not found.");
    return this.view(runId);
  }

  /**
   * LAB-RUN-04: stops the solver jobs first (through `releaseJobs`), then
   * records the cancellation with its time and author.
   */
  async cancelRun(
    experimentId: string,
    runId: string,
    userId: string,
    releaseJobs: (runId: string) => Promise<void>
  ): Promise<RunView> {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "execute");
    const run = UUID_PATTERN.test(runId) ? await OrmRun.findOne({ where: { id: runId, experimentId } }) : null;
    if (!run) throw new NotFoundError("Run not found.");
    if (!ACTIVE_RUN_STATUSES.includes(run.status)) {
      throw new ConflictError("Only a pending or running run can be cancelled.");
    }

    await releaseJobs(runId);

    const transaction = await sequelize.transaction();
    try {
      const now = new Date();
      await this.closeScenarioRuns(run, "cancelled", "The scenario run was cancelled.", transaction);
      const [updated] = await OrmRun.update(
        { status: "cancelled", cancelledBy: userId, cancelledAt: now, finishedAt: now },
        { where: { id: runId, status: ACTIVE_RUN_STATUSES }, transaction }
      );
      if (updated === 0) {
        throw new ConflictError("The run finished before it could be cancelled.");
      }

      const experiment = (await OrmExperiment.findByPk(experimentId, { transaction }))!;
      await this.changeExperimentStatus(experiment, userId, "cancelled", transaction);
      await OrmExperimentHistory.create(
        { experimentId, experimentVersion: experiment.version, userId, eventType: "run_cancelled", newValue: { runId, number: run.number } },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return this.view(runId);
  }

  // Used by the executor

  /** The scenario runs left to execute, in order, or null if the run is no longer pending. */
  async planOf(runId: string): Promise<{ provenance: RunProvenance; scenarioRuns: ScenarioRunPlan[] } | null> {
    const run = await OrmRun.findByPk(runId, {
      include: [{ model: OrmScenarioRun, as: "scenarioRuns" }],
      order: [[{ model: OrmScenarioRun, as: "scenarioRuns" }, "position", "ASC"]],
    });
    if (!run || run.status !== "pending") return null;
    return {
      provenance: run.provenance,
      scenarioRuns: (run.scenarioRuns ?? []).map((scenarioRun) => ({
        id: scenarioRun.id,
        position: scenarioRun.position,
        scenarioId: scenarioRun.scenarioId,
        solverId: scenarioRun.solverId,
      })),
    };
  }

  async snapshotOf(hash: string): Promise<unknown> {
    return (await OrmModelSnapshot.findByPk(hash))?.snapshot;
  }

  async semanticsOf(hash: string): Promise<unknown> {
    return (await OrmSemanticsSnapshot.findByPk(hash))?.snapshot;
  }

  /** Pending -> running. False when the run was cancelled meanwhile. */
  async markRunStarted(runId: string): Promise<boolean> {
    const [updated] = await OrmRun.update({ status: "running", startedAt: new Date() }, { where: { id: runId, status: "pending" } });
    return updated > 0;
  }

  async startAttempt(scenarioRunId: string, attempt: number, startedAt: Date): Promise<boolean> {
    const scenarioRun = await OrmScenarioRun.findByPk(scenarioRunId);
    const [updated] = await OrmScenarioRun.update(
      { status: "running", attempts: attempt, startedAt: scenarioRun?.startedAt ?? startedAt },
      { where: { id: scenarioRunId, status: ACTIVE_RUN_STATUSES } }
    );
    return updated > 0;
  }

  async setJob(scenarioRunId: string, jobId: string) {
    await OrmScenarioRun.update({ jobId }, { where: { id: scenarioRunId, status: ACTIVE_RUN_STATUSES } });
  }

  /** LAB-RUN-06: every attempt and its result. */
  async recordAttempt(
    scenarioRunId: string,
    attempt: number,
    jobId: string | null,
    outcome: AttemptOutcome,
    error: string | null,
    startedAt: Date
  ) {
    await OrmRunAttempt.create({ scenarioRunId, attempt, jobId, outcome, error, startedAt, finishedAt: new Date() });
  }

  /** LAB-VIS-01: progress of a running scenario run. */
  async setProgress(scenarioRunId: string, progress: number) {
    await OrmScenarioRun.update({ progress }, { where: { id: scenarioRunId, status: ACTIVE_RUN_STATUSES } });
  }

  /** Ends a scenario run with its result and, in the same transaction, its metrics (LAB-MT-03). */
  async finishScenarioRun(
    scenarioRunId: string,
    status: "completed" | "failed",
    result: unknown,
    error: string | null,
    metrics: MetricValue[] = []
  ) {
    const transaction = await sequelize.transaction();
    try {
      const scenarioRun = await OrmScenarioRun.findByPk(scenarioRunId, { transaction });
      const [updated] = await OrmScenarioRun.update(
        { status, result: result ?? null, error, finishedAt: new Date(), progress: status === "completed" ? 1 : scenarioRun?.progress ?? null },
        { where: { id: scenarioRunId, status: ACTIVE_RUN_STATUSES }, transaction }
      );
      // Cancelled meanwhile: nothing to record
      if (updated > 0 && metrics.length > 0) {
        await OrmMetricResult.bulkCreate(
          metrics.map((metric) => ({ ...metric, runId: scenarioRun!.runId, scenarioRunId })),
          { transaction }
        );
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Ends a run from its scenario runs, updates the experiment and notifies the
   * user who started it (LAB-RUN-03). Does nothing for a cancelled run.
   */
  async finishRun(runId: string, failureReason?: string) {
    const transaction = await sequelize.transaction();
    let notification: Parameters<ReturnType<typeof getNotificationGateway>["notifyRunFinished"]>[0] | null = null;
    try {
      const run = await OrmRun.findByPk(runId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!run || !ACTIVE_RUN_STATUSES.includes(run.status)) {
        await transaction.rollback();
        return;
      }

      if (failureReason) {
        await this.closeScenarioRuns(run, "failed", failureReason, transaction);
      }
      const scenarioRuns = await OrmScenarioRun.findAll({ where: { runId }, order: [["position", "ASC"]], transaction });
      const status: "completed" | "failed" = scenarioRuns.every((scenarioRun) => scenarioRun.status === "completed") ? "completed" : "failed";
      const reason = status === "failed"
        ? failureReason ?? scenarioRuns.find((scenarioRun) => scenarioRun.status === "failed")?.error ?? "A scenario run failed."
        : null;

      await OrmRun.update(
        {
          status,
          failureReason: reason,
          finishedAt: new Date(),
          startedAt: run.startedAt ?? new Date(),
          // LAB-RP-03: 75 random bits; the unique constraint guarantees no two runs share one
          ...(status === "completed" ? { persistentId: newPersistentId() } : {}),
        },
        { where: { id: runId, status: ACTIVE_RUN_STATUSES }, transaction }
      );

      const experiment = (await OrmExperiment.findByPk(run.experimentId, { transaction }))!;
      await this.changeExperimentStatus(experiment, run.startedBy, status, transaction);
      await OrmExperimentHistory.create(
        {
          experimentId: run.experimentId,
          experimentVersion: experiment.version,
          userId: run.startedBy,
          eventType: status === "completed" ? "run_completed" : "run_failed",
          newValue: { runId, number: run.number, ...(reason ? { reason } : {}) },
        },
        { transaction }
      );

      await transaction.commit();
      notification = {
        userId: run.startedBy,
        experimentId: run.experimentId,
        experimentName: experiment.name,
        runId,
        runNumber: run.number,
        status,
        message: status === "completed"
          ? `Run #${run.number} of "${experiment.name}" completed.`
          : `Run #${run.number} of "${experiment.name}" failed: ${reason}`,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // LAB-RP-01: the package is generated as soon as the run completes
    if (notification?.status === "completed") {
      await this.storedPackage(runId).catch((error) => console.error(`Package of run ${runId} not generated yet:`, error));
    }

    await getNotificationGateway().notifyRunFinished(notification).catch((error) =>
      console.error("Run notification failed:", error)
    );
  }

  /** LAB-RP-01: the package of a completed run, generated once and kept unchanged. */
  private async storedPackage(runId: string): Promise<{ file: Buffer; sha256: string }> {
    const stored = await OrmRunPackage.findByPk(runId);
    if (stored) return { file: stored.file, sha256: stored.sha256 };

    const run = await this.view(runId);
    if (run.status !== "completed" || !run.persistentId) throw new ConflictError("Only a completed run has a reproducibility package.");
    const experiment = (await OrmExperiment.findByPk(run.experimentId))!;
    const version = await OrmExperimentVersion.findOne({ where: { experimentId: run.experimentId, version: run.experimentVersion } });
    const hashes = run.provenance.scenarios.flatMap((s) => s.models.map((m) => m.hash));
    const snapshots = new Map(
      (await OrmModelSnapshot.findAll({ where: { hash: [...new Set(hashes)] } })).map((s) => [s.hash, s.snapshot])
    );
    const semanticsHashes = run.provenance.scenarios.flatMap((s) => s.models.map((m) => m.semanticsHash)).filter((hash): hash is string => !!hash);
    const semantics = new Map(
      (await OrmSemanticsSnapshot.findAll({ where: { hash: [...new Set(semanticsHashes)] } })).map((s) => [s.hash, s.snapshot])
    );

    const file = buildPackage({
      persistentId: run.persistentId,
      run,
      experiment: { id: experiment.id, name: experiment.name, description: experiment.description, hypothesis: experiment.hypothesis, projectId: experiment.projectId ?? null },
      configuration: version!.config,
      snapshots,
      semantics,
    });
    const sha256 = sha256Hex(file);
    // Two requests at once: the first one stored wins, both serve the same bytes
    await OrmRunPackage.findOrCreate({ where: { runId }, defaults: { runId, file, sha256 } });
    return this.storedPackage(runId);
  }

  async packageOf(experimentId: string, runId: string, userId: string) {
    const run = await this.getRun(experimentId, runId, userId);
    if (run.status !== "completed") throw new ConflictError("Only a completed run has a reproducibility package.");
    return { ...(await this.storedPackage(runId)), persistentId: run.persistentId! };
  }

  /** LAB-RP-03: where a persistent id leads, for a user who may read the run. */
  async resolve(persistentId: string, userId: string) {
    const run = isPersistentId(persistentId) ? await OrmRun.findOne({ where: { persistentId } }) : null;
    if (!run) throw new NotFoundError("No run has this identifier.");
    await this.experiments.ensureExperimentPermission(run.experimentId, userId, "read", undefined, true);
    const experiment = (await OrmExperiment.findByPk(run.experimentId))!;
    return {
      persistentId,
      runId: run.id,
      runNumber: run.number,
      status: run.status,
      finishedAt: run.finishedAt ?? null,
      experimentId: run.experimentId,
      experimentName: experiment.name,
      experimentVersion: run.experimentVersion,
    };
  }

  /** LAB-RP-04: runs given by id or persistent id, of one experiment or several. */
  async compare(references: string[], userId: string) {
    if (references.length < 2) throw new ValidationError("Choose at least two runs to compare.");
    const runs = [];
    for (const reference of references) {
      const row = isPersistentId(reference)
        ? await OrmRun.findOne({ where: { persistentId: reference } })
        : UUID_PATTERN.test(reference) ? await OrmRun.findByPk(reference) : null;
      if (!row) throw new NotFoundError(`Run ${reference} not found.`);
      await this.experiments.ensureExperimentPermission(row.experimentId, userId, "read", undefined, true);
      const experiment = (await OrmExperiment.findByPk(row.experimentId))!;
      runs.push({ run: await this.view(row.id), persistentId: row.persistentId ?? null, experiment: { id: experiment.id, name: experiment.name } });
    }
    return compareRuns(runs);
  }

  /**
   * LAB-RP-01, LAB-NF-03: rebuilds the experiment of a package, as a Ready
   * experiment with the exact models, solvers, parameters and contexts of the
   * run. Running it must give equivalent results.
   */
  async reproduce(file: Buffer, projectId: string, userId: string) {
    let pkg: ReturnType<typeof readPackage>;
    try {
      pkg = readPackage(file);
    } catch (error) {
      throw new ValidationError(`Invalid package: ${(error as Error).message}`);
    }
    const { manifest, configuration, snapshots, semantics } = pkg;
    // LAB-RP-01: without its semantics, a model would run on today's semantics of its language
    const withoutSemantics = manifest.models.filter((model) => !model.semanticsHash).map((model) => model.modelId);
    if (withoutSemantics.length > 0) {
      throw new ValidationError(
        `Invalid package: it was made before the Laboratory kept the semantics of the languages (models ${withoutSemantics.join(", ")}); it cannot be reproduced exactly.`
      );
    }
    const semanticsOfModel = new Map(manifest.models.map((model) => [model.hash, model.semanticsHash!]));

    const transaction = await sequelize.transaction();
    try {
      const project = await this.experiments.ensureProjectAccess(projectId, userId, transaction);
      // Predefined metrics exist everywhere; another user's private metric is left out
      const wanted = configuration.metrics.map((m) => m.id);
      const usable = (await OrmMetric.findAll({ where: { id: wanted }, transaction }))
        .filter((m) => m.userId === null || m.userId === undefined || m.userId === userId)
        .map((m) => m.id);
      const missing = configuration.metrics.filter((m) => !usable.includes(m.id)).map((m) => m.name);

      const id = randomUUID();
      const name = `${manifest.experiment.name} (reproduction of ${manifest.persistentId})`;
      await OrmExperiment.create(
        {
          id,
          name,
          description: configuration.configuration.description,
          hypothesis: configuration.configuration.hypothesis,
          labels: configuration.configuration.labels ?? [],
          projectId: project,
          version: 1,
          status: "ready",
          isTemplate: false,
          isBenchmark: false,
          reproducedFrom: manifest.persistentId,
        },
        { transaction }
      );
      await OrmExperimentUser.create({ experimentId: id, userId, role: ExperimentRoleEnum.OWNER }, { transaction });
      await OrmExperimentMetric.bulkCreate(usable.map((metricId) => ({ experimentId: id, metricId })), { transaction });

      const pinnedAt = new Date();
      const scenarios = configuration.scenarios.map((scenario) => ({ ...scenario, newId: randomUUID() }));
      for (const [position, scenario] of scenarios.entries()) {
        await OrmScenario.create(
          {
            id: scenario.newId,
            experimentId: id,
            name: scenario.name,
            position,
            solverConfigs: Object.fromEntries(scenario.solvers.map((s) => [s.id, { version: s.version, ...s.parameters }])) as any,
            operationalContext: (scenario.operationalContext ?? null) as any,
          },
          { transaction }
        );
        await OrmPinnedModel.bulkCreate(
          scenario.models.map((model, index) => ({
            scenarioId: scenario.newId,
            position: index,
            modelId: model.modelId,
            modelLanguageId: model.languageId,
            modelSnapshot: snapshots.get(model.hash),
            modelSnapshotHash: model.hash,
            modelPinnedAt: pinnedAt,
            semanticsSnapshot: semantics.get(semanticsOfModel.get(model.hash)!),
            semanticsHash: semanticsOfModel.get(model.hash),
          })),
          { transaction }
        );
      }

      await OrmExperimentVersion.create(
        {
          experimentId: id,
          version: 1,
          userId,
          config: {
            ...configuration.configuration,
            name,
            projectId: project,
            metricIds: [...usable].sort(),
            scenarios: scenarios.map((s) => ({
              id: s.newId,
              name: s.name,
              modelIds: s.models.map((m) => m.modelId),
              solverConfigs: Object.fromEntries(s.solvers.map((solver) => [solver.id, { version: solver.version, ...solver.parameters }])) as any,
              operationalContext: (s.operationalContext ?? undefined) as any,
            })),
          },
        },
        { transaction }
      );
      await OrmExperimentHistory.create(
        {
          experimentId: id,
          experimentVersion: 1,
          userId,
          eventType: "experiment_reproduced",
          newValue: { persistentId: manifest.persistentId, sourceExperiment: manifest.experiment.name, ...(missing.length ? { metricsLeftOut: missing } : {}) },
        },
        { transaction }
      );

      await transaction.commit();
      return { experiment: await this.experiments.loadDetailed(id, ExperimentRoleEnum.OWNER, undefined, userId), metricsLeftOut: missing };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** The Reasoning jobs that the scenario runs still active were waiting for. */
  async activeJobIds(): Promise<string[]> {
    const scenarioRuns = await OrmScenarioRun.findAll({ where: { status: ACTIVE_RUN_STATUSES, jobId: { [Op.ne]: null } }, attributes: ["jobId"] });
    return scenarioRuns.map((scenarioRun) => scenarioRun.jobId!);
  }

  /** At start-up: runs left pending or running by a stopped service cannot resume. */
  async failInterruptedRuns(): Promise<number> {
    const runs = await OrmRun.findAll({ where: { status: ACTIVE_RUN_STATUSES }, attributes: ["id"] });
    for (const run of runs) {
      await this.finishRun(run.id, "Interrupted: the Laboratory service stopped during the run.");
    }
    return runs.length;
  }

  /**
   * Ends the scenario runs still active, each with all its metrics marked not computed (LAB-MT-03).
   * Only the rows this update closes get them: the executor may complete a scenario run at the same
   * moment, and it records its own metrics (a separate read first would see it still active).
   */
  private async closeScenarioRuns(run: OrmRun, status: "cancelled" | "failed", reason: string, transaction: Transaction) {
    const [, closed] = await OrmScenarioRun.update(
      { status, finishedAt: new Date(), ...(status === "failed" ? { error: reason } : {}) },
      { where: { runId: run.id, status: ACTIVE_RUN_STATUSES }, transaction, returning: true }
    );
    const values = closed.flatMap((scenarioRun) =>
      notComputed(run.provenance.metrics ?? [], reason).map((metric) => ({ ...metric, runId: run.id, scenarioRunId: scenarioRun.id }))
    );
    if (values.length > 0) await OrmMetricResult.bulkCreate(values, { transaction });
  }

  private async changeExperimentStatus(experiment: OrmExperiment, userId: string, status: ExperimentStatus, transaction: Transaction) {
    if (experiment.status === status) return;
    await OrmExperiment.update({ status }, { where: { id: experiment.id }, transaction });
    await OrmExperimentHistory.create(
      { experimentId: experiment.id, experimentVersion: experiment.version, userId, eventType: "status_changed", oldValue: experiment.status, newValue: status },
      { transaction }
    );
    experiment.status = status;
  }

  private async view(runId: string): Promise<RunView> {
    const run = (await OrmRun.findByPk(runId, {
      include: [
        {
          model: OrmScenarioRun,
          as: "scenarioRuns",
          include: [
            { model: OrmRunAttempt, as: "attemptLog" },
            { model: OrmMetricResult, as: "metricResults" },
          ],
        },
      ],
      order: [
        [{ model: OrmScenarioRun, as: "scenarioRuns" }, "position", "ASC"],
        [{ model: OrmScenarioRun, as: "scenarioRuns" }, { model: OrmRunAttempt, as: "attemptLog" }, "attempt", "ASC"],
      ],
    }))!;

    const userIds = [run.startedBy, run.cancelledBy].filter((id): id is string => !!id);
    const names = new Map(
      (await OrmUser.findAll({ where: { id: userIds }, attributes: ["id", "name"] })).map((user: any) => [user.id, user.name as string])
    );

    return {
      id: run.id,
      experimentId: run.experimentId,
      number: run.number,
      experimentVersion: run.experimentVersion,
      status: run.status,
      persistentId: run.persistentId ?? null,
      startedBy: run.startedBy,
      startedByName: names.get(run.startedBy) ?? null,
      failureReason: run.failureReason ?? null,
      cancelledBy: run.cancelledBy ?? null,
      cancelledByName: run.cancelledBy ? names.get(run.cancelledBy) ?? null : null,
      cancelledAt: run.cancelledAt ?? null,
      createdAt: run.createdAt ?? null,
      startedAt: run.startedAt ?? null,
      finishedAt: run.finishedAt ?? null,
      provenance: run.provenance,
      scenarioRuns: (run.scenarioRuns ?? []).map((scenarioRun) => ({
        id: scenarioRun.id,
        position: scenarioRun.position,
        scenarioId: scenarioRun.scenarioId,
        scenarioName: scenarioRun.scenarioName ?? null,
        solverId: scenarioRun.solverId,
        solverVersion: scenarioRun.solverVersion,
        status: scenarioRun.status,
        jobId: scenarioRun.jobId ?? null,
        attempts: scenarioRun.attempts,
        progress: scenarioRun.progress ?? null,
        result: scenarioRun.result ?? null,
        error: scenarioRun.error ?? null,
        startedAt: scenarioRun.startedAt ?? null,
        finishedAt: scenarioRun.finishedAt ?? null,
        // In the order of the metrics in the provenance
        metrics: run.provenance.metrics
          .map((definition) => ((scenarioRun as any).metricResults ?? []).find((m: OrmMetricResult) => m.metricId === definition.id))
          .filter(Boolean)
          .map((m: OrmMetricResult) => ({ metricId: m.metricId, value: m.value, reason: m.reason, inputs: m.inputs, simulated: m.simulated })),
        attemptLog: (scenarioRun.attemptLog ?? []).map((attempt) => ({
          attempt: attempt.attempt,
          jobId: attempt.jobId ?? null,
          outcome: attempt.outcome,
          error: attempt.error ?? null,
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt,
        })),
      })),
    };
  }
}

