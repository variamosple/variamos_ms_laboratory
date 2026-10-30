import { Scenario } from "./Scenario";

test("creates a scenario with its models and solver settings", () => {
  const models = [{ modelId: "model-1" }, { modelId: "model-2" }];
  const solverConfigs = { minizinc: { version: "2.8.5", timeOut: 10 } };
  const scenario = new Scenario("scenario-1", "experiment-1", models, solverConfigs, "MiniZinc");

  expect(scenario).toEqual({
    id: "scenario-1",
    experimentId: "experiment-1",
    models,
    solverConfigs,
    name: "MiniZinc",
    operationalContext: undefined,
  });
});

test("a new scenario has no model and no solver", () => {
  const scenario = new Scenario("scenario-1", "experiment-1");
  expect(scenario.models).toEqual([]);
  expect(scenario.solverConfigs).toEqual({});
});
