import { Experiment, ExperimentDetailed } from "./Experiment";

test("creates an experiment with its metadata", () => {
  const createdAt = new Date("2026-01-01");
  const updatedAt = new Date("2026-01-02");
  const experiment = new Experiment(
    "experiment-1",
    "Trial",
    3,
    ["demo", "public"],
    "ready",
    "owner",
    false,
    false,
    "Description",
    "Hypothesis",
    createdAt,
    updatedAt
  );

  expect(experiment).toEqual({
    id: "experiment-1",
    name: "Trial",
    version: 3,
    labels: ["demo", "public"],
    status: "ready",
    userRole: "owner",
    isTemplate: false,
    isBenchmark: false,
    description: "Description",
    hypothesis: "Hypothesis",
    createdAt,
    updatedAt,
  });
});

test("creates a detailed experiment with scenarios and metrics", () => {
  const experiment = new ExperimentDetailed(
    "experiment-1",
    "Benchmark",
    1,
    ["benchmark"],
    "draft",
    "director",
    false,
    true,
    "Description",
    "Hypothesis"
  );
  experiment.scenarios = [{ id: "scenario-1" } as any];
  experiment.metrics = [{ id: "metric-1" } as any];
  experiment.author = "Alice";

  expect(experiment).toMatchObject({
    id: "experiment-1",
    name: "Benchmark",
    version: 1,
    isBenchmark: true,
    scenarios: [{ id: "scenario-1" }],
    metrics: [{ id: "metric-1" }],
    author: "Alice",
  });
});