import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmExperimentUser } from "./ExperimentUser";
import { OrmScenario, Scenario } from "./Scenario";
import { Metric, OrmMetric } from "./Metric";

export type ExperimentStatus =
  | "draft"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "archived"
  | "deleted";

export interface ExperimentAttributes {
  id?: string;
  name: string;
  description?: string;
  hypothesis?: string;
  version: number;
  labels?: string[];
  status: ExperimentStatus;
  isTemplate: boolean;
  isBenchmark: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class OrmExperiment extends Model<ExperimentAttributes> implements ExperimentAttributes
{
  declare id: string;
  declare name: string;
  declare description?: string;
  declare hypothesis?: string;
  declare version: number;
  declare labels?: string[];
  declare status: ExperimentStatus;
  declare isTemplate: boolean;
  declare isBenchmark: boolean;
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
  },
  {
    tableName: "experiment",
    sequelize,
    freezeTableName: true,
    schema: "variamos_laboratory_test",
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
      enum: [
        "draft",
        "ready",
        "archived",
        "deleted",
        "running",
        "completed",
        "failed",
      ],
    },
    isTemplate: { type: "boolean" },
    isBenchmark: { type: "boolean" },
  },
  required: ["name"],
  additionalProperties: false,
};

