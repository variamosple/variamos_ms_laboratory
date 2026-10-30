import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";

/** LAB-COL-03: what a comment is about. */
export type CommentTargetType = "experiment" | "scenario" | "run" | "scenario_run";

export interface CommentAttributes {
  id: string;
  experimentId: string;
  targetType: CommentTargetType;
  targetId: string;
  /** An annotation on one metric of a scenario run result. */
  metricId?: string | null;
  targetLabel: string;
  body: string;
  author: string;
  createdAt?: Date;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

export class OrmComment extends Model<CommentAttributes> implements CommentAttributes {
  declare id: string;
  declare experimentId: string;
  declare targetType: CommentTargetType;
  declare targetId: string;
  declare metricId?: string | null;
  declare targetLabel: string;
  declare body: string;
  declare author: string;
  declare createdAt?: Date;
  declare editedAt?: Date | null;
  declare deletedAt?: Date | null;
  declare deletedBy?: string | null;
}

OrmComment.init(
  {
    id: { type: Sequelize.UUID, primaryKey: true },
    experimentId: { type: Sequelize.UUID, allowNull: false, field: "experiment_id" },
    targetType: { type: Sequelize.TEXT, allowNull: false, field: "target_type" },
    targetId: { type: Sequelize.TEXT, allowNull: false, field: "target_id" },
    metricId: { type: Sequelize.UUID, field: "metric_id" },
    targetLabel: { type: Sequelize.TEXT, allowNull: false, field: "target_label" },
    body: { type: Sequelize.TEXT, allowNull: false },
    author: { type: Sequelize.TEXT, allowNull: false },
    createdAt: { type: Sequelize.DATE, field: "created_at" },
    editedAt: { type: Sequelize.DATE, field: "edited_at" },
    deletedAt: { type: Sequelize.DATE, field: "deleted_at" },
    deletedBy: { type: Sequelize.TEXT, field: "deleted_by" },
  },
  {
    sequelize,
    tableName: "comment",
    freezeTableName: true,
    schema: Config.DB.SCHEMA,
    timestamps: false,
  }
);

/** A comment as the API returns it; a deleted comment keeps its place, without its text. */
export interface CommentView {
  id: string;
  targetType: CommentTargetType;
  targetId: string;
  metricId: string | null;
  targetLabel: string;
  body: string | null;
  author: string;
  authorName: string | null;
  createdAt: Date | null;
  editedAt: Date | null;
  deleted: boolean;
}
