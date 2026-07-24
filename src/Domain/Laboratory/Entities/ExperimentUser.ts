import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmUser } from "../../User/Entities/User";

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
  createdAt?: Date;
}

export class OrmExperimentUser
  extends Model<ExperimentUserAttributes>
  implements ExperimentUserAttributes
{
  declare experimentId?: string;
  declare userId?: string;
  declare role?: ExperimentRoleEnum;
  declare createdAt?: Date;

  declare user?: OrmUser;
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
    createdAt: {
      type: Sequelize.DATE,
      field: "created_at",
    },
  },
  {
    tableName: "experiment_user",
    sequelize,
    freezeTableName: true,
    schema: "variamos_laboratory_test",

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
};
