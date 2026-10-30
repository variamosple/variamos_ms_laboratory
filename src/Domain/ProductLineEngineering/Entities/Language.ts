import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";

/**
 * The VariaMos languages, owned by the Languages module: the Laboratory only
 * reads the semantics of the language of each input model (LAB-RP-01).
 */
export interface LanguageAttributes {
  id: number;
  name?: string | null;
  semantics?: unknown;
}

export class OrmLanguage extends Model<LanguageAttributes> implements LanguageAttributes {
  declare id: number;
  declare name?: string | null;
  declare semantics?: unknown;
}

OrmLanguage.init(
  {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: Sequelize.TEXT,
    },
    semantics: {
      type: Sequelize.JSONB,
    },
  },
  {
    sequelize,
    schema: "variamos",
    tableName: "language",
    freezeTableName: true,
    timestamps: false,
  }
);
