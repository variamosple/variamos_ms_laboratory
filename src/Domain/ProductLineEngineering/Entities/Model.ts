import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { Element } from "./Element";
import { Relationship } from "./Relationship";

export interface ModelAttributes {
  id: string;
  projectId: string;
  productLineId: string;
  engineeringType: string;

  name: string;
  type?: string;
  languageId: number;

  description?: string;
  author?: string;
  source?: string;

  model: any;
}

export class OrmModel
  extends Model<ModelAttributes>
  implements ModelAttributes
{
  declare id: string;
  declare projectId: string;
  declare productLineId: string;
  declare engineeringType: string;
  declare name: string;
  declare type?: string;
  declare languageId: number;
  declare description?: string;
  declare author?: string;
  declare source?: string;
  declare model: any;
}

OrmModel.init(
  {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      allowNull: false,
    },
    projectId: {
      type: Sequelize.UUID,
      allowNull: false,
      field: "project_id",
    },
    productLineId: {
      type: Sequelize.TEXT,
      allowNull: false,
      field: "product_line_id",
    },
    engineeringType: {
      type: Sequelize.TEXT,
      allowNull: false,
      field: "engineering_type",
    },
    name: {
      type: Sequelize.TEXT,
    },
    type: {
      type: Sequelize.TEXT,
    },
    languageId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: "language_id",
    },
    description: {
      type: Sequelize.TEXT,
    },
    author: {
      type: Sequelize.TEXT,
    },
    source: {
      type: Sequelize.TEXT,
    },
    model: {
      type: Sequelize.JSONB,
      allowNull: false,
    },
  },
  {
    sequelize,
    schema: "variamos",
    tableName: "model",
    freezeTableName: true,
    timestamps: false,
  }
);

export class ModelEntity {
  id!: string;
  projectId!: string;
  productLineId!: string;
  engineeringType!: string;

  name!: string;
  type?: string;
  languageId!: number;

  description?: string;
  author?: string;
  source?: string;

  inconsistent = false;
  consistencyError?: string;

  elements: Element[] = [];
  relationships: Relationship[] = [];

  constraints?: string;
  sourceModelIds: string[] = [];

  constructor(init?: Partial<ModelEntity>) {
    Object.assign(this, init);
  }
    static fromOrm(ormModel: OrmModel): ModelEntity {
    return new ModelEntity({
      id: ormModel.id,
      projectId: ormModel.projectId,
      productLineId: ormModel.productLineId,
      engineeringType: ormModel.engineeringType,

      name: ormModel.name,
      type: ormModel.type,
      languageId: ormModel.languageId,

      description: ormModel.description,
      author: ormModel.author,
      source: ormModel.source,

      elements: ormModel.model.elements ?? [],
      relationships: ormModel.model.relationships ?? [],

      constraints: ormModel.model.constraints,
      sourceModelIds: ormModel.model.sourceModelIds ?? [],
    });
  }
}

export function SearchModelById(id: string) {
  const query =
    "select * from variamos.sp_view_model('" + id + "')";
  return sequelize.query(query);
}