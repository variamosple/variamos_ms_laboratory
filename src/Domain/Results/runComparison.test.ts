import { compareRuns, differingPaths } from "./runComparison";
import { RunView } from "../Laboratory/Entities/Run";

describe("differences between runs (LAB-RP-04)", () => {
  test("leaf paths whose value is not the same in every run, absent counts as different", () => {
    expect(
      differingPaths([
        { a: { x: 1, y: [1, 2] }, b: "same" },
        { a: { x: 2, y: [1, 2] }, b: "same", c: true },
      ])
    ).toEqual(["a/x", "c"]);
  });

  test("identical runs have no difference; arrays are compared whole", () => {
    expect(differingPaths([{ m: [1, 2] }, { m: [1, 2] }])).toEqual([]);
    expect(differingPaths([{ m: [1, 2] }, { m: [2, 1] }])).toEqual(["m"]);
  });
});

describe("comparison of two runs (LAB-RP-04, LAB-NF-03)", () => {
  const runOf = (changes: { semanticsHash?: string; gateway?: string; result?: Record<string, unknown> } = {}): RunView => ({
    id: "run",
    experimentId: "experiment",
    number: 1,
    experimentVersion: 1,
    status: "completed",
    persistentId: null,
    startedBy: "alice",
    startedByName: null,
    failureReason: null,
    cancelledBy: null,
    cancelledByName: null,
    cancelledAt: null,
    createdAt: null,
    startedAt: null,
    finishedAt: null,
    provenance: {
      experiment: { id: "experiment", name: "Car", version: 1, projectId: null },
      startedBy: "alice",
      laboratoryVersion: "1.0.0",
      reasoning: { gateway: changes.gateway ?? "semantic_translator" },
      metrics: [],
      scenarios: [{
        scenarioId: "s1",
        name: "Car",
        models: [{ modelId: "fm-1", languageId: 1, hash: "model-hash", pinnedAt: null, semanticsHash: changes.semanticsHash ?? "semantics-hash" }],
        operationalContext: null,
        solvers: [{ id: "z3", version: "unpinned", parameters: { timeOut: 5 } }],
      }],
    },
    scenarioRuns: [{
      id: "sr1",
      position: 0,
      scenarioId: "s1",
      scenarioName: "Car",
      solverId: "z3",
      solverVersion: "unpinned",
      status: "completed",
      jobId: null,
      attempts: 1,
      progress: 1,
      result: { satisfiable: true, products: 4, reasoningTimeMs: 120, statistics: [{ total_time: 100 }], ...changes.result },
      error: null,
      startedAt: null,
      finishedAt: null,
      metrics: [],
      attemptLog: [],
    }],
  });
  const compare = (a: RunView, b: RunView) =>
    compareRuns([a, b].map((run) => ({ run, persistentId: null, experiment: { id: "experiment", name: "Car" } })));

  test("the timings the semantic translator reports do not make two runs different", () => {
    const comparison = compare(runOf(), runOf({ result: { reasoningTimeMs: 300, statistics: [{ total_time: 280 }] } }));

    expect(comparison.equivalent).toBe(true);
    // Still shown side by side
    expect(comparison.differences.results).toEqual(["Car/z3/result/reasoningTimeMs", "Car/z3/result/statistics"]);
  });

  test("a different result does", () => {
    expect(compare(runOf(), runOf({ result: { products: 5 } })).equivalent).toBe(false);
  });

  test("other semantics or another gateway is a difference of configuration", () => {
    expect(compare(runOf(), runOf({ semanticsHash: "other-semantics" })).differences.configuration).toEqual(["scenarios/Car/semantics"]);
    expect(compare(runOf(), runOf({ gateway: "mock" })).differences.configuration).toEqual(["reasoning"]);
  });
});
