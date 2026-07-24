import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";

export interface UserAttributes {
  id: string;
  user: string;
  name: string;
  email: string;
  countryCode?: string;
  isEnabled: boolean;
  isDeleted: boolean;
  createdAt: Date;
  lastLogin?: Date;
  password?: string;
}

export class OrmUser extends Model<UserAttributes> implements UserAttributes {
  declare id: string;
  declare user: string;
  declare name: string;
  declare email: string;
  declare countryCode?: string;
  declare isEnabled: boolean;
  declare isDeleted: boolean;
  declare createdAt: Date;
  declare lastLogin?: Date;
  declare password?: string;
}

OrmUser.init(
  {
    id: {
      type: Sequelize.TEXT,
      primaryKey: true,
      allowNull: false,
    },
    user: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    name: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    email: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    countryCode: {
      type: Sequelize.STRING(10),
      allowNull: true,
      field: "country_code",
    },
    isEnabled: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_enabled",
    },
    isDeleted: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_deleted",
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      field: "created_at",
    },
    lastLogin: {
      type: Sequelize.DATE,
      allowNull: true,
      field: "last_login",
    },
    password: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    schema: "variamos",
    tableName: "user",
    freezeTableName: true,
    timestamps: false,
  }
);