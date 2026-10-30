import { OrmExperiment } from "./Experiment";
import { OrmExperimentUser } from "./ExperimentUser";
import { OrmScenario } from "./Scenario";
import { OrmMetric } from "./Metric";
import { OrmExperimentMetric } from "./ExperimentMetric";
import { OrmModel } from "../../ProductLineEngineering/Entities/Model";
import { OrmScenarioModel } from "./ScenarioModel";
import { OrmUser } from "../../Session/Entities/User";
import { OrmExperimentHistory } from "./ExperimentHistory";
import { OrmMetricResult, OrmRun, OrmRunAttempt, OrmScenarioRun } from "./Run";

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

OrmScenario.hasMany(OrmScenarioModel, {
  foreignKey: "scenarioId",
  as: "models",
});

OrmScenarioModel.belongsTo(OrmModel, {
  foreignKey: "modelId",
  targetKey: "id",
  as: "model",
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

// P2: a run, its scenario runs and their attempts
OrmExperiment.hasMany(OrmRun, {
  foreignKey: "experimentId",
  as: "runs",
});

OrmRun.hasMany(OrmScenarioRun, {
  foreignKey: "runId",
  as: "scenarioRuns",
});

OrmScenarioRun.hasMany(OrmRunAttempt, {
  foreignKey: "scenarioRunId",
  as: "attemptLog",
});

OrmScenarioRun.hasMany(OrmMetricResult, {
  foreignKey: "scenarioRunId",
  as: "metricResults",
});
