import { Config } from "../../../Config";
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
  userId?: string | null;
  code?: string | null;
  category?: string | null;
  source?: string | null;
  formulaOrigin?: "spec" | "proposed" | null;
  requires?: string | null;
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
  declare userId?: string | null;
  declare code?: string | null;
  declare category?: string | null;
  declare source?: string | null;
  declare formulaOrigin?: "spec" | "proposed" | null;
  declare requires?: string | null;
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
      // variamos.user.id is a string
      type: Sequelize.TEXT,
      allowNull: true,
      field: "user_id",
    },
    // LAB-MT-01 catalog: REQ code, family, origin of the definition, data the models need
    code: {
      type: Sequelize.TEXT,
    },
    category: {
      type: Sequelize.TEXT,
    },
    source: {
      type: Sequelize.TEXT,
    },
    formulaOrigin: {
      type: Sequelize.TEXT,
      field: "formula_origin",
    },
    requires: {
      type: Sequelize.TEXT,
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
    schema: Config.DB.SCHEMA,
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
  userId?: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(
    id: string,
    name: string,
    formula: string,
    unit: string,
    script: string,
    createdAt: Date,
    updatedAt: Date,
    description?: string,
    userId?: string | null,
  ) {
    this.id = id;
    this.name = name;
    this.formula = formula;
    this.unit = unit;
    this.script = script;
    this.description = description;
    this.userId = userId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
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

