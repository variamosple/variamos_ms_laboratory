import { Config } from "../../../Config";
import Sequelize, { Model, Optional } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OperationalContext } from "./Scenario";
import { MetricDefinition } from "../../Metrics/computeMetrics";

/** LAB-RUN-03 states of a run and of each scenario run. */
export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export const ACTIVE_RUN_STATUSES: RunStatus[] = ["pending", "running"];
export const FINISHED_RUN_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];

export type AttemptOutcome = "completed" | "failed" | "transient_error" | "cancelled" | "resource_limit";

/** LAB-RP-02: what was executed, frozen when the run starts. */
export interface RunProvenance {
  experiment: { id: string; name: string; version: number; projectId: string | null };
  startedBy: string;
  laboratoryVersion: string;
  reasoning: { gateway: string };
  /** LAB-MT-03: the metrics to compute, as defined when the run started. */
  metrics: MetricDefinition[];
  scenarios: {
    scenarioId: string;
    name: string;
    /** semanticsHash: LAB-RP-01, absent from the runs started before it was recorded. */
    models: { modelId: string; languageId: number | null; hash: string; pinnedAt: string | null; semanticsHash?: string | null }[];
    operationalContext: OperationalContext | null;
    solvers: { id: string; version: string; parameters: Record<string, unknown> }[];
  }[];
}

export interface RunAttributes {
  id: string;
  experimentId: string;
  number: number;
  experimentVersion: number;
  status: RunStatus;
  startedBy: string;
  provenance: RunProvenance;
  /** LAB-RP-03 */
  persistentId?: string | null;
  failureReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: Date | null;
  createdAt?: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export class OrmRun extends Model<RunAttributes, Optional<RunAttributes, "createdAt">> implements RunAttributes {
  declare id: string;
  declare experimentId: string;
  declare number: number;
  declare experimentVersion: number;
  declare status: RunStatus;
  declare startedBy: string;
  declare provenance: RunProvenance;
  declare persistentId?: string | null;
  declare failureReason?: string | null;
  declare cancelledBy?: string | null;
  declare cancelledAt?: Date | null;
  declare createdAt?: Date;
  declare startedAt?: Date | null;
  declare finishedAt?: Date | null;
  declare scenarioRuns?: OrmScenarioRun[];
}

OrmRun.init(
  {
    id: { type: Sequelize.UUID, primaryKey: true },
    experimentId: { type: Sequelize.UUID, allowNull: false, field: "experiment_id" },
    number: { type: Sequelize.INTEGER, allowNull: false },
    experimentVersion: { type: Sequelize.INTEGER, allowNull: false, field: "experiment_version" },
    status: { type: Sequelize.TEXT, allowNull: false },
    startedBy: { type: Sequelize.TEXT, allowNull: false, field: "started_by" },
    provenance: { type: Sequelize.JSONB, allowNull: false },
    persistentId: { type: Sequelize.TEXT, field: "persistent_id" },
    failureReason: { type: Sequelize.TEXT, field: "failure_reason" },
    cancelledBy: { type: Sequelize.TEXT, field: "cancelled_by" },
    cancelledAt: { type: Sequelize.DATE, field: "cancelled_at" },
    createdAt: { type: Sequelize.DATE, field: "created_at" },
    startedAt: { type: Sequelize.DATE, field: "started_at" },
    finishedAt: { type: Sequelize.DATE, field: "finished_at" },
  },
  {
    sequelize,
    tableName: "run",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

export interface ScenarioRunAttributes {
  id: string;
  runId: string;
  position: number;
  scenarioId: string;
  scenarioName?: string | null;
  solverId: string;
  solverVersion: string;
  status: RunStatus;
  jobId?: string | null;
  attempts: number;
  progress?: number | null;
  result?: unknown;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

export class OrmScenarioRun extends Model<ScenarioRunAttributes> implements ScenarioRunAttributes {
  declare id: string;
  declare runId: string;
  declare position: number;
  declare scenarioId: string;
  declare scenarioName?: string | null;
  declare solverId: string;
  declare solverVersion: string;
  declare status: RunStatus;
  declare jobId?: string | null;
  declare attempts: number;
  declare progress?: number | null;
  declare result?: unknown;
  declare error?: string | null;
  declare startedAt?: Date | null;
  declare finishedAt?: Date | null;
  declare attemptLog?: OrmRunAttempt[];
}

OrmScenarioRun.init(
  {
    id: { type: Sequelize.UUID, primaryKey: true },
    runId: { type: Sequelize.UUID, allowNull: false, field: "run_id" },
    position: { type: Sequelize.INTEGER, allowNull: false },
    scenarioId: { type: Sequelize.UUID, allowNull: false, field: "scenario_id" },
    scenarioName: { type: Sequelize.TEXT, field: "scenario_name" },
    solverId: { type: Sequelize.TEXT, allowNull: false, field: "solver_id" },
    solverVersion: { type: Sequelize.TEXT, allowNull: false, field: "solver_version" },
    status: { type: Sequelize.TEXT, allowNull: false },
    jobId: { type: Sequelize.TEXT, field: "job_id" },
    attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    progress: { type: Sequelize.REAL },
    result: { type: Sequelize.JSONB },
    error: { type: Sequelize.TEXT },
    startedAt: { type: Sequelize.DATE, field: "started_at" },
    finishedAt: { type: Sequelize.DATE, field: "finished_at" },
  },
  {
    sequelize,
    tableName: "scenario_run",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

export interface RunAttemptAttributes {
  scenarioRunId: string;
  attempt: number;
  jobId?: string | null;
  outcome: AttemptOutcome;
  error?: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export class OrmRunAttempt extends Model<RunAttemptAttributes> implements RunAttemptAttributes {
  declare scenarioRunId: string;
  declare attempt: number;
  declare jobId?: string | null;
  declare outcome: AttemptOutcome;
  declare error?: string | null;
  declare startedAt: Date;
  declare finishedAt: Date;
}

OrmRunAttempt.init(
  {
    scenarioRunId: { type: Sequelize.UUID, primaryKey: true, field: "scenario_run_id" },
    attempt: { type: Sequelize.INTEGER, primaryKey: true },
    jobId: { type: Sequelize.TEXT, field: "job_id" },
    outcome: { type: Sequelize.TEXT, allowNull: false },
    error: { type: Sequelize.TEXT },
    startedAt: { type: Sequelize.DATE, allowNull: false, field: "started_at" },
    finishedAt: { type: Sequelize.DATE, allowNull: false, field: "finished_at" },
  },
  {
    sequelize,
    tableName: "run_attempt",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

/** A run as the API returns it. */
export interface RunView {
  id: string;
  experimentId: string;
  number: number;
  experimentVersion: number;
  status: RunStatus;
  /** LAB-RP-03: set when the run completes. */
  persistentId: string | null;
  startedBy: string;
  /** LAB-RUN-04: names, not only user ids. */
  startedByName: string | null;
  failureReason: string | null;
  cancelledBy: string | null;
  cancelledByName: string | null;
  cancelledAt: Date | null;
  createdAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  provenance: RunProvenance;
  scenarioRuns: {
    id: string;
    position: number;
    scenarioId: string;
    scenarioName: string | null;
    solverId: string;
    solverVersion: string;
    status: RunStatus;
    jobId: string | null;
    attempts: number;
    /** LAB-VIS-01: 0 to 1 while running, as the Reasoning module reports it. */
    progress: number | null;
    result: unknown;
    error: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    /** LAB-MT-03: one entry per metric of the run once the scenario run ended. */
    metrics: { metricId: string; value: number | null; reason: string | null; inputs: Record<string, number>; simulated: boolean }[];
    attemptLog: { attempt: number; jobId: string | null; outcome: AttemptOutcome; error: string | null; startedAt: Date; finishedAt: Date }[];
  }[];
}

/** A pinned model copy, stored once per hash (LAB-CF-01, LAB-RP-02). */
export interface ModelSnapshotAttributes {
  hash: string;
  modelId: string;
  languageId?: number | null;
  snapshot: unknown;
  createdAt?: Date;
}

export class OrmModelSnapshot extends Model<ModelSnapshotAttributes> implements ModelSnapshotAttributes {
  declare hash: string;
  declare modelId: string;
  declare languageId?: number | null;
  declare snapshot: unknown;
  declare createdAt?: Date;
}

OrmModelSnapshot.init(
  {
    hash: { type: Sequelize.TEXT, primaryKey: true },
    modelId: { type: Sequelize.TEXT, allowNull: false, field: "model_id" },
    languageId: { type: Sequelize.INTEGER, field: "language_id" },
    snapshot: { type: Sequelize.JSONB, allowNull: false },
    createdAt: { type: Sequelize.DATE, field: "created_at" },
  },
  {
    sequelize,
    tableName: "model_snapshot",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

/** The semantics of a language pinned with a model, stored once per hash (LAB-RP-01). */
export interface SemanticsSnapshotAttributes {
  hash: string;
  languageId: number;
  snapshot: unknown;
  createdAt?: Date;
}

export class OrmSemanticsSnapshot extends Model<SemanticsSnapshotAttributes> implements SemanticsSnapshotAttributes {
  declare hash: string;
  declare languageId: number;
  declare snapshot: unknown;
  declare createdAt?: Date;
}

OrmSemanticsSnapshot.init(
  {
    hash: { type: Sequelize.TEXT, primaryKey: true },
    languageId: { type: Sequelize.INTEGER, allowNull: false, field: "language_id" },
    snapshot: { type: Sequelize.JSONB, allowNull: false },
    createdAt: { type: Sequelize.DATE, field: "created_at" },
  },
  {
    sequelize,
    tableName: "semantics_snapshot",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

/** LAB-MT-03: a metric of a scenario run, kept with its result. */
export interface MetricResultAttributes {
  runId: string;
  scenarioRunId: string;
  metricId: string;
  value: number | null;
  reason: string | null;
  inputs: Record<string, number>;
  simulated: boolean;
  computedAt?: Date;
}

export class OrmMetricResult extends Model<MetricResultAttributes> implements MetricResultAttributes {
  declare runId: string;
  declare scenarioRunId: string;
  declare metricId: string;
  declare value: number | null;
  declare reason: string | null;
  declare inputs: Record<string, number>;
  declare simulated: boolean;
  declare computedAt?: Date;
}

OrmMetricResult.init(
  {
    runId: { type: Sequelize.UUID, allowNull: false, field: "run_id" },
    scenarioRunId: { type: Sequelize.UUID, primaryKey: true, field: "scenario_run_id" },
    metricId: { type: Sequelize.UUID, primaryKey: true, field: "metric_id" },
    value: { type: Sequelize.DOUBLE },
    reason: { type: Sequelize.TEXT },
    inputs: { type: Sequelize.JSONB, allowNull: false },
    simulated: { type: Sequelize.BOOLEAN, allowNull: false },
    computedAt: { type: Sequelize.DATE, field: "computed_at" },
  },
  {
    sequelize,
    tableName: "metric_result",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

/** LAB-RP-01: the reproducibility package of a completed run, generated once. */
export class OrmRunPackage extends Model<{ runId: string; file: Buffer; sha256: string; createdAt?: Date }> {
  declare runId: string;
  declare file: Buffer;
  declare sha256: string;
  declare createdAt?: Date;
}

OrmRunPackage.init(
  {
    runId: { type: Sequelize.UUID, primaryKey: true, field: "run_id" },
    file: { type: Sequelize.BLOB, allowNull: false },
    sha256: { type: Sequelize.TEXT, allowNull: false },
    createdAt: { type: Sequelize.DATE, field: "created_at" },
  },
  {
    sequelize,
    tableName: "run_package",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);
