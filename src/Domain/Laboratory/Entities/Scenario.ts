import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { ModelEntity, OrmModel } from "../../ProductLineEngineering/Entities/Model";

export interface ScenarioAttributes {
  id?: string;
  experimentId: string;
  modelId?: string;
  model?: OrmModel;
  solverConfig?: any;
}

export class OrmScenario extends Model<ScenarioAttributes> implements ScenarioAttributes
{
  declare id: string;
  declare experimentId: string;
  declare modelId?: string;
  declare model?: OrmModel;
  declare solverConfig?: any;
}

OrmScenario.init(
  {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
    },
    experimentId: {
      type: Sequelize.UUID,
      allowNull: false,
      field: "experiment_id",
    },
    modelId: {
      type: Sequelize.UUID,
      allowNull: true,
      field: "model_id",
    },
    solverConfig: {
      type: Sequelize.JSONB,
      allowNull: true,
      field: "solver_config",
    },
  },
  {
    sequelize,
    schema: "variamos_laboratory_test",
    tableName: "scenario",
    freezeTableName: true,
    createdAt: false,
    updatedAt: false,
  }
);

export class Scenario {
  id: string;
  experimentId: string;
  modelId?: string;
  model?: ModelEntity;
  solverConfig?: any;

  constructor(
    id: string,
    experimentId: string,
    modelId?: string,
    model?: ModelEntity,
    solverConfig?: any,
  ) {
    this.id = id;
    this.experimentId = experimentId;
    this.modelId = modelId;
    this.model = model;
    this.solverConfig = solverConfig;
  }
}

