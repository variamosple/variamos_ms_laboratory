import { Config } from "../../../Config";
import Sequelize, { Model } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";

export interface ExperimentMetricAttributes {
  experimentId: string;
  metricId: string;
}

export class OrmExperimentMetric
  extends Model<ExperimentMetricAttributes>
  implements ExperimentMetricAttributes
{
  declare experimentId: string;
  declare metricId: string;
}

OrmExperimentMetric.init(
  {
    experimentId: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      field: "experiment_id",
    },
    metricId: {
      type: Sequelize.UUID,
      allowNull: false,
      primaryKey: true,
      field: "metric_id",
    },
  },
  {
    sequelize,
    schema: Config.DB.SCHEMA,
    tableName: "experiment_metric",
    freezeTableName: true,
    createdAt: false,
    updatedAt: false,
  }
);