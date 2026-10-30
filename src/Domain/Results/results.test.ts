import { benchmark, toCsv } from "./results";

describe("CSV (LAB-MT-05)", () => {
  test("RFC 4180: quotes, doubled quotes, line breaks, empty cells, CRLF", () => {
    expect(toCsv([["a", "b, c", 'say "hi"'], [1, null, "two\nlines"]])).toBe('a,"b, c","say ""hi"""\r\n1,,"two\nlines"\r\n');
  });
});

describe("benchmark (LAB-MT-06)", () => {
  const attempt = (outcome: string, ms: number) => ({
    attempt: 1, jobId: null, outcome, error: null,
    startedAt: new Date(0).toISOString(), finishedAt: new Date(ms).toISOString(),
  });
  const scenarioRun = (scenarioId: string, solverId: string, status: string, configurations: number | null, ms: number, retried = false) => ({
    id: `${scenarioId}-${solverId}`, position: 0, scenarioId, scenarioName: scenarioId, solverId, solverVersion: "1",
    status, jobId: null, attempts: 1, progress: 1,
    result: configurations === null ? null : { satisfiable: true, configurations },
    error: null, startedAt: null, finishedAt: null, metrics: [],
    attemptLog: [...(retried ? [attempt("transient_error", 5)] : []), attempt(status === "completed" ? "completed" : "failed", ms)],
  });
  const run = (id: string, scenarioRuns: any[]) => ({ id, number: 1, scenarioRuns } as any);

  test("majority answer per scenario: the solver that disagrees loses agreement", () => {
    const [a, b, c] = benchmark([
      run("r1", [scenarioRun("s1", "a", "completed", 4, 100), scenarioRun("s1", "b", "completed", 4, 300, true), scenarioRun("s1", "c", "completed", 5, 200)]),
      run("r2", [scenarioRun("s1", "a", "completed", 4, 50), scenarioRun("s1", "c", "failed", null, 10)]),
    ]);
    expect(a).toMatchObject({ completed: 2, successRate: 1, compared: 1, agreementRate: 1, responseTimeMs: { mean: 75, median: 75, min: 50, max: 100 } });
    expect(b).toMatchObject({ retries: 1, agreementRate: 1 });
    expect(c).toMatchObject({ completed: 1, failed: 1, successRate: 0.5, agreementRate: 0 });
  });

  test("cancelled scenario runs are counted but left out of the success rate", () => {
    const [only] = benchmark([run("r1", [scenarioRun("s1", "a", "completed", 4, 100), scenarioRun("s2", "a", "cancelled", null, 10)])]);
    expect(only).toMatchObject({ scenarioRuns: 2, completed: 1, cancelled: 1, failed: 0, successRate: 1 });
  });

    test("a single solver has no agreement to measure", () => {
    const [only] = benchmark([run("r1", [scenarioRun("s1", "a", "completed", 4, 100)])]);
    expect(only).toMatchObject({ compared: 0, agreementRate: null });
  });
});
