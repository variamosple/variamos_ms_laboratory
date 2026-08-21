import { ExperimentMetricAttributes } from "./ExperimentMetric";

test("represents an experiment-metric association", () => {
  const association: ExperimentMetricAttributes = {
    experimentId: "experiment-1",
    metricId: "metric-1",
  };

  expect(association).toEqual({
    experimentId: "experiment-1",
    metricId: "metric-1",
  });
});