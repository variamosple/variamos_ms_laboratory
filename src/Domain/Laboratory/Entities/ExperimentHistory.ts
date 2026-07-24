import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { Optional } from "sequelize";
import { OrmUser } from "../../User/Entities/User";

export type ExperimentHistoryEventType =
    | "experiment_created"
    | "name_updated"
    | "description_updated"
    | "hypothesis_updated"
    | "labels_updated"
    | "metrics_updated"
    | "scenario_added"
    | "scenario_removed"
    | "scenario_model_updated"
    | "scenario_solver_config_updated"
    | "experiment_copied";

export interface ExperimentHistoryAttributes {
    id?: string;
    experimentId: string;
    scenarioId?: string;
    userId?: string;

    experimentVersion: number;

    eventType: ExperimentHistoryEventType;

    oldValue?: any;
    newValue?: any;

    createdAt?: Date;
}

export type ExperimentHistoryCreationAttributes = Optional<
  ExperimentHistoryAttributes,
  "id" | "scenarioId" | "userId" | "oldValue" | "newValue" | "createdAt"
>;

export class OrmExperimentHistory extends Model<
  ExperimentHistoryAttributes,
  ExperimentHistoryCreationAttributes
> implements ExperimentHistoryAttributes {

    declare id: string;
    declare experimentId: string;
    declare scenarioId?: string;
    declare userId?: string;
    declare user?: OrmUser;
    declare experimentVersion: number;
    declare eventType: ExperimentHistoryEventType;

    declare oldValue?: any;
    declare newValue?: any;

    declare createdAt?: Date;
}

OrmExperimentHistory.init(
    {
        id: {
            type: Sequelize.UUID,
            primaryKey: true,
            defaultValue: Sequelize.UUIDV4,
        },
        experimentId: {
            type: Sequelize.UUID,
            allowNull: false,
            field: "experiment_id",
        },
        scenarioId: {
            type: Sequelize.UUID,
            allowNull: true,
            field: "scenario_id",
        },
        userId: {
            type: Sequelize.UUID,
            allowNull: true,
            field: "user_id",
        },
        experimentVersion: {
            type: Sequelize.INTEGER,
            allowNull: false,
            field: "experiment_version",
        },
        eventType: {
            type: Sequelize.TEXT,
            allowNull: false,
            field: "event_type",
        },
        oldValue: {
            type: Sequelize.JSONB,
            field: "old_value",
        },
        newValue: {
            type: Sequelize.JSONB,
            field: "new_value",
        },
        createdAt: {
            type: Sequelize.DATE,
            field: "created_at",
        },
    },
    {
        sequelize,
        schema: "variamos_laboratory_test",
        tableName: "experiment_history",
        freezeTableName: true,
        updatedAt: false,
        createdAt: "created_at",
    }
);

export type ExperimentHistory = {
    id: string;
    experimentId: string;
    scenarioId?: string;
    userName: string;

    experimentVersion: number;

    eventType: ExperimentHistoryEventType;

    oldValue?: any;
    newValue?: any;

    createdAt?: Date;
}