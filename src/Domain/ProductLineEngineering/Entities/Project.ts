import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";

/** The VariaMos projects, owned by vms_projects: the Laboratory only reads them (LAB-EX-01). */
export interface ProjectAttributes {
  id: string;
  ownerId: string;
  name?: string;
  isDeleted?: boolean | null;
}

export class OrmProject extends Model<ProjectAttributes> implements ProjectAttributes {
  declare id: string;
  declare ownerId: string;
  declare name?: string;
  declare isDeleted?: boolean | null;
}

OrmProject.init(
  {
    id: {
      type: Sequelize.TEXT,
      primaryKey: true,
      allowNull: false,
    },
    ownerId: {
      type: Sequelize.TEXT,
      allowNull: false,
      field: "owner_id",
    },
    name: {
      type: Sequelize.TEXT,
    },
    isDeleted: {
      type: Sequelize.BOOLEAN,
      field: "is_deleted",
    },
  },
  {
    sequelize,
    schema: "variamos",
    tableName: "project",
    freezeTableName: true,
    timestamps: false,
  }
);

/** Users a project is shared with, in vms_projects. */
export interface UserProjectAttributes {
  userId: string;
  projectId: string;
  role?: string | null;
}

export class OrmUserProject extends Model<UserProjectAttributes> implements UserProjectAttributes {
  declare userId: string;
  declare projectId: string;
  declare role?: string | null;
}

OrmUserProject.init(
  {
    userId: {
      type: Sequelize.TEXT,
      primaryKey: true,
      field: "user_id",
    },
    projectId: {
      type: Sequelize.TEXT,
      primaryKey: true,
      field: "project_id",
    },
    role: {
      type: Sequelize.TEXT,
    },
  },
  {
    sequelize,
    schema: "variamos",
    tableName: "user_project",
    freezeTableName: true,
    timestamps: false,
  }
);
