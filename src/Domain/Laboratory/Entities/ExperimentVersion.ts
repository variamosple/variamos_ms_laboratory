import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OperationalContext, SolverConfigs } from "./Scenario";

/** LAB-EX-04: what a version freezes. Restoring a version reapplies it. */
export interface ExperimentConfigSnapshot {
  name: string;
  description?: string;
  hypothesis?: string;
  /** Absent in snapshots saved before experiments had a project. */
  projectId?: string | null;
  labels: string[];
  metricIds: string[];
  scenarios: {
    id: string;
    name?: string;
    modelIds: string[];
    /** In snapshots saved before scenarios had several models. */
    modelId?: string;
    solverConfigs: SolverConfigs;
    operationalContext?: OperationalContext;
  }[];
}

export interface ExperimentVersionAttributes {
  experimentId: string;
  version: number;
  userId?: string;
  config: ExperimentConfigSnapshot;
  createdAt?: Date;
}

export class OrmExperimentVersion
  extends Model<ExperimentVersionAttributes>
  implements ExperimentVersionAttributes
{
  declare experimentId: string;
  declare version: number;
  declare userId?: string;
  declare config: ExperimentConfigSnapshot;
  declare createdAt?: Date;
}

OrmExperimentVersion.init(
  {
    experimentId: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      field: "experiment_id",
    },
    version: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    userId: {
      type: Sequelize.TEXT,
      field: "user_id",
    },
    config: {
      type: Sequelize.JSONB,
      allowNull: false,
    },
    createdAt: {
      type: Sequelize.DATE,
      field: "created_at",
    },
  },
  {
    sequelize,
    schema: Config.DB.SCHEMA,
    tableName: "experiment_version",
    freezeTableName: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);
