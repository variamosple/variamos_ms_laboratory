import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmExperimentUser } from "./ExperimentUser";
import { OrmScenario, Scenario } from "./Scenario";
import { Metric, OrmMetric } from "./Metric";

/** LAB-EX-07 states, plus 'request_changes' from LAB-EX-03. */
export type ExperimentStatus =
  | "draft"
  | "request_changes"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived"
  | "deleted";

export const EXPERIMENT_STATUSES: ExperimentStatus[] = [
  "draft",
  "request_changes",
  "ready",
  "running",
  "completed",
  "failed",
  "cancelled",
  "archived",
  "deleted",
];

export interface ExperimentAttributes {
  id?: string;
  name: string;
  description?: string;
  hypothesis?: string;
  projectId?: string | null;
  version: number;
  labels?: string[];
  status: ExperimentStatus;
  isTemplate: boolean;
  isBenchmark: boolean;
  deletedAt?: Date | null;
  statusBeforeArchive?: ExperimentStatus | null;
  clonedFromExperimentId?: string | null;
  clonedFromVersion?: number | null;
  /** LAB-RP-01: persistent id of the run whose package rebuilt this experiment. */
  reproducedFrom?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class OrmExperiment extends Model<ExperimentAttributes> implements ExperimentAttributes
{
  declare id: string;
  declare name: string;
  declare description?: string;
  declare hypothesis?: string;
  declare projectId?: string | null;
  declare version: number;
  declare labels?: string[];
  declare status: ExperimentStatus;
  declare isTemplate: boolean;
  declare isBenchmark: boolean;
  declare deletedAt?: Date | null;
  declare statusBeforeArchive?: ExperimentStatus | null;
  declare clonedFromExperimentId?: string | null;
  declare clonedFromVersion?: number | null;
  declare reproducedFrom?: string | null;
  declare createdAt?: Date;
  declare updatedAt?: Date;
  declare users?: OrmExperimentUser[];
  declare scenarios?: OrmScenario[];
  declare metrics?: OrmMetric[];
}

OrmExperiment.init(
  {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    description: {
      type: Sequelize.TEXT,
    },
    hypothesis: {
      type: Sequelize.TEXT,
    },
    projectId: {
      type: Sequelize.TEXT,
      field: "project_id",
    },
    version: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    labels: {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    status: {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: "draft",
    },
    createdAt: {
      type: Sequelize.DATE,
      field: "created_at",
    },
    updatedAt: {
      type: Sequelize.DATE,
      field: "updated_at",
    },
    isTemplate: {
      type: Sequelize.BOOLEAN,
      field: "is_template",
      allowNull: false,
      defaultValue: false,
    },
    isBenchmark: {
      type: Sequelize.BOOLEAN,
      field: "is_benchmark",
      allowNull: false,
      defaultValue: false,
    },
    deletedAt: {
      type: Sequelize.DATE,
      field: "deleted_at",
    },
    statusBeforeArchive: {
      type: Sequelize.TEXT,
      field: "status_before_archive",
    },
    clonedFromExperimentId: {
      type: Sequelize.UUID,
      field: "cloned_from_experiment_id",
    },
    clonedFromVersion: {
      type: Sequelize.INTEGER,
      field: "cloned_from_version",
    },
    reproducedFrom: {
      type: Sequelize.TEXT,
      field: "reproduced_from",
    },
  },
  {
    tableName: "experiment",
    sequelize,
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export class Experiment {
  id: string;
  name: string;
  version: number;
  labels: string[];
  status: ExperimentStatus;
  userRole: string;
  isTemplate: boolean;
  isBenchmark: boolean;
  description?: string;
  hypothesis?: string;
  /** LAB-EX-01: the VariaMos project; null for experiments created before projects were recorded. */
  projectId?: string | null;
  /** LAB-EX-02: the experiment and version this one was cloned from; the name when the user can read it. */
  clonedFrom?: { experimentId: string; version: number | null; name?: string | null };
  /** LAB-RP-01: the run, by persistent id, whose package rebuilt this experiment. */
  reproducedFrom?: string | null;
  /** LAB-COL-01: what the user asking may do. */
  permissions?: { read: boolean; write: boolean; execute: boolean; manage: boolean };
  /** LAB-COL-04: the researcher who created it. */
  ownerName?: string | null;

  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    id: string,
    name: string,
    version: number,
    labels: string[] = [],
    status: ExperimentStatus,
    userRole: string,
    isTemplate: boolean,
    isBenchmark: boolean,
    description?: string,
    hypothesis?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.hypothesis = hypothesis;
    this.version = version;
    this.labels = labels;
    this.status = status;
    this.userRole = userRole;
    this.isTemplate = isTemplate;
    this.isBenchmark = isBenchmark;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class ExperimentDetailed extends Experiment {
  scenarios: Scenario[] = [];
  metrics: Metric[] = [];
  author: string = "";
}

export const ExperimentSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    description: { type: "string" },
    hypothesis: { type: "string" },
    version: { type: "integer" },
    status: {
      type: "string",
      enum: EXPERIMENT_STATUSES,
    },
    isTemplate: { type: "boolean" },
    isBenchmark: { type: "boolean" },
  },
  required: ["name"],
  additionalProperties: false,
};

