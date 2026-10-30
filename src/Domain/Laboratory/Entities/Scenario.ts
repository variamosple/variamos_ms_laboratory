import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { ModelEntity } from "../../ProductLineEngineering/Entities/Model";
import { SolverSettings } from "../../Reasoning/Entities/SolverDescriptor";
import { OrmScenarioModel } from "./ScenarioModel";

/** Settings of each selected solver, keyed by solver id ("minizinc", "swi-prolog", "z3"). */
export type SolverConfigs = Record<string, SolverSettings>;

/** LAB-CF-04: features forced on or off, and extra constraints, for one scenario. */
export interface OperationalContext {
  activeFeatures: string[];
  inactiveFeatures: string[];
  extraConstraints: string;
}

export interface ScenarioAttributes {
  id?: string;
  experimentId: string;
  name?: string | null;
  position?: number;
  solverConfigs?: SolverConfigs | null;
  operationalContext?: OperationalContext | null;
}

export class OrmScenario extends Model<ScenarioAttributes> implements ScenarioAttributes
{
  declare id: string;
  declare experimentId: string;
  declare name?: string | null;
  declare position?: number;
  declare solverConfigs?: SolverConfigs | null;
  declare operationalContext?: OperationalContext | null;
  declare models?: OrmScenarioModel[];
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
    name: {
      type: Sequelize.TEXT,
    },
    position: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    solverConfigs: {
      type: Sequelize.JSONB,
      allowNull: true,
      field: "solver_configs",
    },
    operationalContext: {
      type: Sequelize.JSONB,
      allowNull: true,
      field: "operational_context",
    },
  },
  {
    sequelize,
    schema: Config.DB.SCHEMA,
    tableName: "scenario",
    freezeTableName: true,
    createdAt: false,
    updatedAt: false,
  }
);

/**
 * LAB-CF-01 / LAB-R-03: the copy of a model taken when the experiment became
 * Ready. Runs use this copy, never the live model.
 */
export interface PinnedModel {
  languageId: number | null;
  hash: string;
  pinnedAt: Date;
  /** LAB-RP-01: the semantics of the language, pinned with the model. */
  semanticsHash: string | null;
}

/** One input model of a scenario. */
export interface ScenarioModelRef {
  modelId: string;
  model?: ModelEntity;
  pinned?: PinnedModel;
}

export class Scenario {
  id: string;
  experimentId: string;
  name?: string;
  models: ScenarioModelRef[];
  solverConfigs: SolverConfigs;
  operationalContext?: OperationalContext;

  constructor(
    id: string,
    experimentId: string,
    models: ScenarioModelRef[] = [],
    solverConfigs?: SolverConfigs,
    name?: string,
    operationalContext?: OperationalContext,
  ) {
    this.id = id;
    this.experimentId = experimentId;
    this.models = models;
    this.solverConfigs = solverConfigs ?? {};
    this.name = name;
    this.operationalContext = operationalContext;
  }

  static fromOrm(scenario: OrmScenario): Scenario {
    const models = [...(scenario.models ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((row): ScenarioModelRef => ({
        modelId: row.modelId,
        model: row.model ? ModelEntity.fromOrm(row.model) : undefined,
        pinned:
          row.modelSnapshotHash && row.modelPinnedAt
            ? { languageId: row.modelLanguageId ?? null, hash: row.modelSnapshotHash, pinnedAt: row.modelPinnedAt, semanticsHash: row.semanticsHash ?? null }
            : undefined,
      }));

    return new Scenario(
      scenario.id,
      scenario.experimentId,
      models,
      scenario.solverConfigs ?? {},
      scenario.name ?? undefined,
      scenario.operationalContext ?? undefined
    );
  }
}
