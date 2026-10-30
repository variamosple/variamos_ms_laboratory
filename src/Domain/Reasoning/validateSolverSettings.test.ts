import { solverProblems } from "./validateSolverSettings";
import MockReasoningGateway from "../../DataProviders/reasoning/MockReasoningGateway";

describe("solver settings (LAB-CF-02, LAB-R-03)", () => {
  let catalog: Awaited<ReturnType<MockReasoningGateway["listSolvers"]>>;
  const valid = {
    version: "2.8.5",
    timeOut: 60,
    randomSeed: 42,
    mode: "enumeration",
    variableSelection: "first_fail",
    valueSelection: "default",
  };

  beforeAll(async () => {
    catalog = await new MockReasoningGateway().listSolvers();
  });

  test("the mock catalog offers the three solvers with pinned versions", () => {
    expect(catalog.map((solver) => solver.id)).toEqual(["minizinc", "swi-prolog", "z3"]);
    catalog.forEach((solver) => expect(solver.versions.length).toBeGreaterThan(0));
  });

  test("valid settings have no problem", () => {
    expect(solverProblems("S1", "minizinc", valid, catalog)).toEqual([]);
  });

  test.each([undefined, "", "latest", "*"])("a floating version (%p) is refused", (version) => {
    expect(solverProblems("S1", "minizinc", { ...valid, version }, catalog)).toEqual([
      'S1: MiniZinc (Gecode) must be pinned to a version (no "latest").',
    ]);
  });

  test("an unknown version, solver, parameter or option is refused", () => {
    expect(solverProblems("S1", "minizinc", { ...valid, version: "1.0" }, catalog)).toEqual([
      "S1: version 1.0 of MiniZinc (Gecode) is not available (available: 2.8.5).",
    ]);
    expect(solverProblems("S1", "gurobi", valid, catalog)).toEqual([
      "S1: the solver gurobi is not offered by the Reasoning module.",
    ]);
    expect(solverProblems("S1", "minizinc", { ...valid, threads: 4 }, catalog)).toEqual([
      'S1: MiniZinc (Gecode) has no parameter "threads".',
    ]);
    expect(solverProblems("S1", "minizinc", { ...valid, valueSelection: "random" }, catalog)).toEqual([
      'S1: "random" is not a valid value selection for MiniZinc (Gecode).',
    ]);
  });

  test("missing and out-of-range values are refused", () => {
    const { mode, ...withoutMode } = valid;
    expect(solverProblems("S1", "minizinc", { ...withoutMode, randomSeed: -1 }, catalog)).toEqual([
      "S1: random seed for MiniZinc (Gecode) must be a whole number of at least 0.",
      "S1: set mode for MiniZinc (Gecode).",
    ]);
  });
});
