import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmModel } from "../../ProductLineEngineering/Entities/Model";

/**
 * LAB-CF-01: one input model of a scenario, and its copy pinned at Ready with
 * the semantics of its language (LAB-RP-01).
 */
export interface ScenarioModelAttributes {
  scenarioId: string;
  position: number;
  modelId: string;
  modelLanguageId?: number | null;
  modelSnapshot?: any;
  modelSnapshotHash?: string | null;
  modelPinnedAt?: Date | null;
  semanticsSnapshot?: any;
  semanticsHash?: string | null;
}

export class OrmScenarioModel
  extends Model<ScenarioModelAttributes>
  implements ScenarioModelAttributes
{
  declare scenarioId: string;
  declare position: number;
  declare modelId: string;
  declare modelLanguageId?: number | null;
  declare modelSnapshot?: any;
  declare modelSnapshotHash?: string | null;
  declare modelPinnedAt?: Date | null;
  declare semanticsSnapshot?: any;
  declare semanticsHash?: string | null;
  declare model?: OrmModel;
}

OrmScenarioModel.init(
  {
    scenarioId: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      field: "scenario_id",
    },
    position: {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    modelId: {
      type: Sequelize.TEXT,
      allowNull: false,
      field: "model_id",
    },
    modelLanguageId: {
      type: Sequelize.INTEGER,
      field: "model_language_id",
    },
    modelSnapshot: {
      type: Sequelize.JSONB,
      field: "model_snapshot",
    },
    modelSnapshotHash: {
      type: Sequelize.TEXT,
      field: "model_snapshot_hash",
    },
    modelPinnedAt: {
      type: Sequelize.DATE,
      field: "model_pinned_at",
    },
    semanticsSnapshot: {
      type: Sequelize.JSONB,
      field: "semantics_snapshot",
    },
    semanticsHash: {
      type: Sequelize.TEXT,
      field: "semantics_hash",
    },
  },
  {
    sequelize,
    schema: Config.DB.SCHEMA,
    tableName: "scenario_model",
    freezeTableName: true,
    timestamps: false,
  }
);
