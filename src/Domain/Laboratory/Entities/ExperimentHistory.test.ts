import { ExperimentHistory } from "./ExperimentHistory";

test("represents a complete experiment history event", () => {
  const createdAt = new Date("2026-01-03");
  const history: ExperimentHistory = {
    id: "history-1",
    experimentId: "experiment-1",
    scenarioId: "scenario-1",
    userName: "Alice",
    experimentVersion: 2,
    eventType: "scenario_added",
    oldValue: undefined,
    newValue: { modelId: "model-1" },
    createdAt,
  };

  expect(history.eventType).toBe("scenario_added");
  expect(history.experimentVersion).toBe(2);
  expect(history.newValue).toEqual({ modelId: "model-1" });
  expect(history.createdAt).toBe(createdAt);
});