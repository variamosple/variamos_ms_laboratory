import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmExperiment } from "./Experiment";
import { OrmExperimentMetric } from "./ExperimentMetric";

export interface MetricAttributes {
  id: string;
  name: string;
  formula: string;
  unit: string;
  description?: string;
  script: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class OrmMetric
  extends Model<MetricAttributes>
  implements MetricAttributes
{
  declare id: string;
  declare name: string;
  declare formula: string;
  declare unit: string;
  declare description?: string;
  declare script: string;
  declare userId?: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

OrmMetric.init(
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
    formula: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    unit: {
      type: Sequelize.TEXT,
    },
    description: {
      type: Sequelize.TEXT,
    },
    script: {
      type: Sequelize.TEXT,
    },
    userId: {
      type: Sequelize.UUID,
      allowNull: true,
      field: "user_id",
    },
    createdAt: {
      type: Sequelize.DATE,
      field: "created_at",
    },
    updatedAt: {
      type: Sequelize.DATE,
      field: "updated_at",
    },
  },
  {
    tableName: "metric",
    sequelize,
    freezeTableName: true,
    schema: "variamos_laboratory_test",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export class Metric {
  id: string;
  name: string;
  formula: string;
  unit: string;
  script: string;
  description?: string;
  userId?: string;

  constructor(
    id: string,
    name: string,
    formula: string,
    unit: string,
    script: string,
    description?: string,
    userId?: string
  ) {
    this.id = id;
    this.name = name;
    this.formula = formula;
    this.unit = unit;
    this.script = script;
    this.description = description;
    this.userId = userId;
  }
}

export const MetricSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    formula: { type: "string" },
    unit: { type: "string" },
    description: { type: "string" },
    script: { type: "string" },
    userId: { type: "string", format: "uuid" },
  },
  required: ["name", "formula", "unit"],
  additionalProperties: false,
};

