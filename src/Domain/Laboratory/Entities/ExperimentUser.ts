import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { User } from "../../Session/Entities/User";

export enum ExperimentRoleEnum {
    OWNER = "owner",
    DIRECTOR = "director",
    EDITOR = "editor",
    VIEWER = "viewer",
}

export interface ExperimentUserAttributes {
  experimentId?: string;
  userId?: string;
  role?: ExperimentRoleEnum;
  /** LAB-COL-01: given to a shared user; owners and directors may always write and execute. */
  canWrite?: boolean;
  canExecute?: boolean;
  createdAt?: Date;
}

export class OrmExperimentUser
  extends Model<ExperimentUserAttributes>
  implements ExperimentUserAttributes
{
  declare experimentId?: string;
  declare userId?: string;
  declare role?: ExperimentRoleEnum;
  declare canWrite?: boolean;
  declare canExecute?: boolean;
  declare createdAt?: Date;

  declare user?: User;
}

OrmExperimentUser.init(
  {
    experimentId: {
      type: Sequelize.UUID,
      allowNull: false,
      field: "experiment_id",
      primaryKey: true,
    },
    userId: {
      type: Sequelize.TEXT,
      allowNull: false,
      field: "user_id",
      primaryKey: true,
    },
    role: {
      type: Sequelize.ENUM(
        "owner",
        "director",
        "editor",
        "viewer"
      ),
      allowNull: false,
      defaultValue: "viewer",
    },
    canWrite: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "can_write",
    },
    canExecute: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "can_execute",
    },
    createdAt: {
      type: Sequelize.DATE,
      field: "created_at",
    },
  },
  {
    tableName: "experiment_user",
    sequelize,
    freezeTableName: true,
    schema: Config.DB.SCHEMA,

    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export class ExperimentUser {
  experimentId?: string;
  userId?: string;
  role?: ExperimentRoleEnum;

  constructor(
    experimentId?: string,
    userId?: string,
    role?: ExperimentRoleEnum
  ) {
    this.experimentId = experimentId;
    this.userId = userId;
    this.role = role;
  }
}

export const ExperimentUserSchema = {
  type: "object",
  properties: {
    experimentId: {
      type: "string",
      format: "uuid",
    },
    userId: {
      type: "string",
      format: "uuid",
    },
    role: {
      type: "string",
      enum: [
        "owner",
        "director",
        "editor",
        "viewer",
      ],
    },
  },
  required: ["experimentId", "userId", "role"],
  additionalProperties: false,
};

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  role: ExperimentRoleEnum;
  /** LAB-COL-01 */
  permissions: { read: boolean; write: boolean; execute: boolean; manage: boolean };
};
