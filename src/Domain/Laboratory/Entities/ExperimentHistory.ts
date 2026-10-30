import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { Optional } from "sequelize";
import { User } from "../../Session/Entities/User";

export type ExperimentHistoryEventType =
    | "experiment_created"
    | "name_updated"
    | "description_updated"
    | "hypothesis_updated"
    | "project_updated"
    | "labels_updated"
    | "metrics_updated"
    | "scenario_added"
    | "scenario_removed"
    | "scenario_model_updated"
    | "scenario_solver_config_updated"
    | "scenario_updated"
    | "experiment_copied"
    // LAB-NF-06: every operation is audited, not only configuration changes
    | "status_changed"
    | "experiment_archived"
    | "experiment_restored"
    | "experiment_deleted"
    | "version_restored"
    | "published_as_template"
    | "published_as_benchmark"
    | "collaborator_shared"
    | "collaborator_removed"
    // P2: runs (LAB-RUN-01, LAB-RUN-03, LAB-RUN-04)
    | "run_started"
    | "run_completed"
    | "run_failed"
    | "run_cancelled"
    // P4: rebuilt from a reproducibility package (LAB-RP-01)
    | "experiment_reproduced";

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
    declare user?: User;
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
        schema: Config.DB.SCHEMA,
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