import {
  cloneOf,
  canArchive,
  canMarkReady,
  canRun,
  runRejection,
  deleteOutcome,
  editOutcome,
  validateForReady,
} from "./ExperimentLifecycle";

describe("editing (LAB-EX-03)", () => {
  test.each([
    ["draft", "in-place"],
    ["request_changes", "in-place"],
    ["ready", "new-draft"],
    ["completed", "new-draft"],
    ["failed", "new-draft"],
    ["cancelled", "new-draft"],
    ["running", "rejected"],
    ["archived", "rejected"],
    ["deleted", "rejected"],
  ] as const)("%s -> %s", (status, outcome) => {
    expect(editOutcome(status)).toBe(outcome);
  });
});

describe("transitions (LAB-EX-05, LAB-EX-06, LAB-EX-07)", () => {
  test("only a Draft or Request Changes experiment can be marked Ready", () => {
    expect(canMarkReady("draft")).toBe(true);
    expect(canMarkReady("request_changes")).toBe(true);
    expect(canMarkReady("ready")).toBe(false);
    expect(canMarkReady("running")).toBe(false);
  });

  test("running, archived and deleted experiments cannot be archived", () => {
    expect(canArchive("completed")).toBe(true);
    expect(canArchive("draft")).toBe(true);
    expect(canArchive("running")).toBe(false);
    expect(canArchive("archived")).toBe(false);
  });

  test("an experiment with completed executions is archived instead of deleted", () => {
    expect(deleteOutcome("draft", false)).toBe("delete");
    expect(deleteOutcome("failed", true)).toBe("archive");
    expect(deleteOutcome("completed", false)).toBe("archive");
    expect(deleteOutcome("running", false)).toBe("rejected");
  });
});

describe("validation before Ready (LAB-RUN-01, LAB-CF-01..04, LAB-R-03)", () => {
  const z3 = { version: "4.13.0", timeOut: 30, randomSeed: 1, mode: "satisfiability" };
  const catalog = {
    models: new Map([
      ["model-1", new Set(["Car", "Engine", "GPS"])],
      ["model-2", new Set(["Radio"])],
    ]),
    solvers: [
      {
        id: "z3",
        name: "Microsoft Z3",
        versions: ["4.13.0"],
        parameters: [
          { name: "timeOut", label: "Time out (seconds)", type: "integer" as const, default: 60, min: 1, max: 3600 },
          { name: "randomSeed", label: "Random seed", type: "integer" as const, default: 42, min: 0 },
          {
            name: "mode",
            label: "Mode",
            type: "enum" as const,
            default: "satisfiability",
            options: [{ value: "satisfiability", label: "Satisfiability" }],
          },
        ],
      },
    ],
  };
  const complete = {
    name: "Experiment",
    metricIds: ["metric-1"],
    scenarios: [
      {
        name: "S1",
        modelIds: ["model-1", "model-2"],
        solverConfigs: { z3 },
        operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"] },
      },
    ],
  };

  test("a complete configuration has no problem", () => {
    expect(validateForReady(complete, catalog)).toEqual([]);
  });

  test("lists every problem, scenario by scenario", () => {
    const problems = validateForReady(
      {
        name: " ",
        metricIds: [],
        scenarios: [
          { name: "S1", modelIds: ["gone"], solverConfigs: { z3: { ...z3, timeOut: 0 } } },
          {
            modelIds: ["model-1"],
            solverConfigs: { z3 },
            operationalContext: { activeFeatures: ["GPS", "Wings"], inactiveFeatures: ["GPS"] },
          },
          { name: "Empty" },
        ],
      },
      catalog
    );

    expect(problems).toEqual([
      "The experiment needs a name.",
      "Select at least one metric.",
      "S1: the model gone no longer exists.",
      "S1: time out (seconds) for Microsoft Z3 must be a whole number between 1 and 3600.",
      "Scenario 2: features both active and inactive (GPS).",
      "Scenario 2: features not found in the input models (Wings).",
      "Empty: select at least one input model.",
      "Empty: add at least one solver.",
    ]);
  });

  test("an experiment without scenario cannot be Ready", () => {
    expect(validateForReady({ ...complete, scenarios: [] }, catalog)).toContain("Add at least one scenario.");
  });
});

describe("running (LAB-RUN-01)", () => {
  test.each([
    ["ready", true],
    ["completed", true],
    ["failed", true],
    ["cancelled", true],
    ["draft", false],
    ["request_changes", false],
    ["running", false],
    ["archived", false],
  ] as const)("an experiment in state %s can run: %s", (status, expected) => {
    expect(canRun(status)).toBe(expected);
  });

  test("the refusal says what to do", () => {
    expect(runRejection("draft")).toMatch(/Mark the experiment Ready/);
    expect(runRejection("running")).toBe("The experiment is already running.");
  });
});

describe("deleting an archived experiment (LAB-EX-05, LAB-EX-06)", () => {
  test("with completed runs it stays archived; without, it is deleted", () => {
    expect(deleteOutcome("archived", true)).toBe("rejected");
    expect(deleteOutcome("archived", false)).toBe("delete");
  });
});

describe("cloning (LAB-EX-02)", () => {
  const source = {
    id: "original",
    version: 3,
    name: "Solver comparison",
    description: "MiniZinc against Z3",
    hypothesis: "Z3 is faster",
    labels: ["fm", "solvers"],
    scenarios: [
      {
        id: "s1",
        name: "Both",
        modelIds: ["m1", "m2"],
        solverConfigs: { z3: { version: "4.13.0", timeOut: 30 } },
        operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "GPS => Radio" },
      },
    ],
    metrics: [
      { id: "public", userId: null },
      { id: "mine", userId: "bob" },
      { id: "alices", userId: "alice" },
    ],
  };
  let next = 0;
  const clone = cloneOf(source, "bob", () => `new-${++next}`);

  test("the clone is a Draft that records its origin", () => {
    expect(clone).toMatchObject({
      name: "Solver comparison (copy)",
      status: "draft",
      isTemplate: false,
      isBenchmark: false,
      clonedFrom: { experimentId: "original", version: 3 },
    });
  });

  test("the configuration is kept whole, with new scenario ids", () => {
    expect(clone.description).toBe(source.description);
    expect(clone.hypothesis).toBe(source.hypothesis);
    expect(clone.labels).toEqual(source.labels);
    expect(clone.scenarios).toEqual([{ ...source.scenarios[0], id: "new-1" }]);
  });

  test("the clone shares nothing with the original", () => {
    clone.scenarios[0].modelIds!.push("m3");
    clone.labels.push("changed");
    expect(source.scenarios[0].modelIds).toEqual(["m1", "m2"]);
    expect(source.labels).toEqual(["fm", "solvers"]);
  });

  test("another user's private metric is left out (LAB-MT-02)", () => {
    expect(clone.metricIds).toEqual(["public", "mine"]);
  });
});
