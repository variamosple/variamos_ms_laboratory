import { OrmExperiment } from "./Experiment";
import { OrmExperimentUser } from "./ExperimentUser";
import { OrmScenario } from "./Scenario";
import { OrmMetric } from "./Metric";
import { OrmExperimentMetric } from "./ExperimentMetric";
import { OrmModel } from "../../ProductLineEngineering/Entities/Model";
import { OrmUser } from "../../Session/Entities/User";
import { OrmExperimentHistory } from "./ExperimentHistory";

OrmExperiment.hasMany(OrmExperimentUser, {
  foreignKey: "experimentId",
  as: "users",
});

OrmExperimentUser.belongsTo(OrmExperiment, {
  foreignKey: "experimentId",
});

OrmExperiment.hasMany(OrmScenario, {
  foreignKey: "experimentId",
  as: "scenarios",
});

OrmScenario.belongsTo(OrmExperiment, {
  foreignKey: "experimentId",
});

OrmExperiment.belongsToMany(OrmMetric, {
  through: OrmExperimentMetric,
  foreignKey: "experimentId",
  otherKey: "metricId",
  as: "metrics",
});

OrmMetric.belongsToMany(OrmExperiment, {
  through: OrmExperimentMetric,
  foreignKey: "metricId",
  otherKey: "experimentId",
  as: "experiments",
});

OrmScenario.belongsTo(OrmModel, {
  foreignKey: "modelId",
  targetKey: "id",
  as: "model",
});

OrmModel.hasMany(OrmScenario, {
  foreignKey: "modelId",
  as: "scenarios",
});

OrmExperimentUser.belongsTo(OrmUser, {
  foreignKey: "userId",
  targetKey: "id",
  as: "user",
});

OrmUser.hasMany(OrmExperimentUser, {
  foreignKey: "userId",
  as: "experimentUsers",
});

OrmExperimentHistory.belongsTo(OrmUser, {
  foreignKey: "userId",
  as: "user",
});