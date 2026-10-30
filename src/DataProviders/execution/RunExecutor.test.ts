import { jobRequestOf } from "./RunExecutor";
import { RunProvenance } from "../../Domain/Laboratory/Entities/Run";

const provenance: RunProvenance = {
  experiment: { id: "e1", name: "Experiment", version: 2, projectId: "p1" },
  startedBy: "alice",
  laboratoryVersion: "1.0.0",
  reasoning: { gateway: "mock" },
  metrics: [],
  scenarios: [
    {
      scenarioId: "s1",
      name: "Context",
      models: [{ modelId: "m1", languageId: 1, hash: "hash-1", pinnedAt: "2026-10-23T10:00:00.000Z", semanticsHash: "sem-1" }],
      operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "GPS => Car" },
      solvers: [
        { id: "minizinc", version: "2.8.5", parameters: { timeOut: 60, randomSeed: 42 } },
        { id: "z3", version: "4.13.0", parameters: { timeOut: 30 } },
      ],
    },
  ],
};

describe("job sent to the Reasoning module (LAB-CF-01, LAB-CF-02, LAB-CF-04)", () => {
  const snapshots = new Map<string, unknown>([["hash-1", { elements: [{ name: "Car" }] }]]);
  const semantics = new Map<string, unknown>([["sem-1", { elementTypes: ["Feature"] }]]);

  test("exactly the pinned solver version, parameters, model copy, semantics and context", () => {
    expect(jobRequestOf(provenance, "s1", "z3", snapshots, semantics)).toEqual({
      solver: { id: "z3", version: "4.13.0", parameters: { timeOut: 30 } },
      models: [
        {
          modelId: "m1",
          languageId: 1,
          hash: "hash-1",
          pinnedAt: "2026-10-23T10:00:00.000Z",
          semanticsHash: "sem-1",
          snapshot: { elements: [{ name: "Car" }] },
          semantics: { elementTypes: ["Feature"] },
        },
      ],
      operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "GPS => Car" },
    });
  });

  test("the parameters sent are a copy: the provenance cannot be changed through them", () => {
    const request = jobRequestOf(provenance, "s1", "minizinc", snapshots, semantics);
    request.solver.parameters.timeOut = 1;
    expect(provenance.scenarios[0].solvers[0].parameters.timeOut).toBe(60);
  });

  test("a missing pinned copy stops the job instead of sending something else", () => {
    expect(() => jobRequestOf(provenance, "s1", "z3", new Map(), semantics)).toThrow(/pinned copy hash-1/);
  });

  test("a missing pinned semantics stops the job too (LAB-RP-01)", () => {
    expect(() => jobRequestOf(provenance, "s1", "z3", snapshots, new Map())).toThrow(/pinned semantics sem-1/);
  });

  test("a run started before the semantics was kept sends none", () => {
    const { semanticsHash, ...old } = provenance.scenarios[0].models[0];
    const before = { ...provenance, scenarios: [{ ...provenance.scenarios[0], models: [old] }] };
    expect(jobRequestOf(before, "s1", "z3", snapshots).models[0].semantics).toBeNull();
  });

  test("a solver not in the provenance is refused", () => {
    expect(() => jobRequestOf(provenance, "s1", "clingo", snapshots, semantics)).toThrow(/not in the provenance/);
  });
});
