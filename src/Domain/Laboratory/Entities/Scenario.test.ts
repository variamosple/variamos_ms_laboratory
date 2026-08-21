import { Scenario } from "./Scenario";

test("creates a scenario with optional model and solver configuration", () => {
  const model = { id: "model-1" } as any;
  const solverConfig = { timeout: 10 };
  const scenario = new Scenario("scenario-1", "experiment-1", "model-1", model, solverConfig);

  expect(scenario).toEqual({
    id: "scenario-1",
    experimentId: "experiment-1",
    modelId: "model-1",
    model,
    solverConfig,
  });
});