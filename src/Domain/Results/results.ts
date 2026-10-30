import { RunView } from "../Laboratory/Entities/Run";
import { MetricDefinition } from "../Metrics/computeMetrics";
import { Cell, buildXlsx } from "./xlsxWriter";

/** LAB-MT-04, LAB-VIS-02: one metric of one scenario run, flattened for tables and charts. */
export interface ResultRow {
  runId: string;
  runNumber: number;
  runStatus: string;
  experimentVersion: number;
  scenarioRunId: string;
  scenarioId: string;
  scenarioName: string | null;
  solverId: string;
  solverVersion: string;
  scenarioRunStatus: string;
  metricId: string;
  metricCode: string | null;
  metricName: string;
  unit: string | null;
  value: number | null;
  reason: string | null;
  simulated: boolean;
}

/** The metrics of the runs, each once, as defined in the latest run that uses it. */
export function metricsOf(runs: RunView[]): MetricDefinition[] {
  const byId = new Map<string, MetricDefinition>();
  [...runs].sort((a, b) => a.number - b.number).forEach((run) => (run.provenance.metrics ?? []).forEach((m) => byId.set(m.id, m)));
  return [...byId.values()];
}

export function resultRows(runs: RunView[]): ResultRow[] {
  return [...runs]
    .sort((a, b) => a.number - b.number)
    .flatMap((run) =>
      run.scenarioRuns.flatMap((scenarioRun) =>
        scenarioRun.metrics.map((metric) => {
          const definition = (run.provenance.metrics ?? []).find((m) => m.id === metric.metricId);
          return {
            runId: run.id,
            runNumber: run.number,
            runStatus: run.status,
            experimentVersion: run.experimentVersion,
            scenarioRunId: scenarioRun.id,
            scenarioId: scenarioRun.scenarioId,
            scenarioName: scenarioRun.scenarioName,
            solverId: scenarioRun.solverId,
            solverVersion: scenarioRun.solverVersion,
            scenarioRunStatus: scenarioRun.status,
            metricId: metric.metricId,
            metricCode: definition?.code ?? null,
            metricName: definition?.name ?? metric.metricId,
            unit: definition?.unit ?? null,
            value: metric.value,
            reason: metric.reason,
            simulated: metric.simulated,
          };
        })
      )
    );
}

/** Time the solver took, from the execution log: the attempt that completed. */
export function responseTimeMs(scenarioRun: RunView["scenarioRuns"][number]): number | null {
  const completed = scenarioRun.attemptLog.find((attempt) => attempt.outcome === "completed");
  if (!completed) return null;
  return new Date(completed.finishedAt).getTime() - new Date(completed.startedAt).getTime();
}

// LAB-MT-05 export

const METRIC_COLUMNS: (keyof ResultRow)[] = [
  "runNumber", "runId", "runStatus", "experimentVersion", "scenarioName", "solverId", "solverVersion",
  "scenarioRunStatus", "metricCode", "metricName", "unit", "value", "reason", "simulated",
];

const metricTable = (runs: RunView[]): Cell[][] => [
  METRIC_COLUMNS.map(String),
  ...resultRows(runs).map((row) => METRIC_COLUMNS.map((column) => cell(row[column]))),
];

const scenarioRunTable = (runs: RunView[]): Cell[][] => [
  ["runNumber", "runId", "scenarioName", "solverId", "solverVersion", "status", "attempts", "responseTimeMs", "jobId", "error", "result"],
  ...[...runs].sort((a, b) => a.number - b.number).flatMap((run) =>
    run.scenarioRuns.map((s) => [
      run.number, run.id, s.scenarioName, s.solverId, s.solverVersion, s.status, s.attempts,
      responseTimeMs(s), s.jobId, s.error, s.result === null ? null : JSON.stringify(s.result),
    ])
  ),
];

const runTable = (runs: RunView[]): Cell[][] => [
  ["runNumber", "runId", "status", "experimentVersion", "startedBy", "startedAt", "finishedAt", "failureReason", "cancelledBy", "cancelledAt"],
  ...[...runs].sort((a, b) => a.number - b.number).map((run) => [
    run.number, run.id, run.status, run.experimentVersion, run.startedByName ?? run.startedBy, iso(run.startedAt), iso(run.finishedAt),
    run.failureReason, run.cancelledByName ?? run.cancelledBy, iso(run.cancelledAt),
  ]),
];

function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value as Cell;
}

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** RFC 4180: comma separated, quoted when needed, CRLF line ends. */
export function toCsv(rows: Cell[][]): string {
  const field = (value: Cell) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

export interface ExperimentSummary {
  id: string;
  name: string;
  version: number;
  description?: string;
  hypothesis?: string;
  projectId?: string | null;
}

export type ExportFormat = "csv" | "json" | "xlsx";

export function exportResults(experiment: ExperimentSummary, runs: RunView[], format: ExportFormat): { body: Buffer; contentType: string; extension: string } {
  switch (format) {
    case "json":
      return {
        body: Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), experiment, metrics: metricsOf(runs), runs }, null, 2)),
        contentType: "application/json",
        extension: "json",
      };
    case "csv":
      // One table: every metric of every scenario run, with its run and scenario
      return { body: Buffer.from(toCsv(metricTable(runs))), contentType: "text/csv; charset=utf-8", extension: "csv" };
    case "xlsx":
      return {
        body: Buffer.from(buildXlsx([
          { name: "Metrics", rows: metricTable(runs) },
          { name: "Scenario runs", rows: scenarioRunTable(runs) },
          { name: "Runs", rows: runTable(runs) },
        ])),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
      };
  }
}

// LAB-MT-06 solver benchmarking

export interface SolverBenchmark {
  solverId: string;
  versions: string[];
  scenarioRuns: number;
  completed: number;
  failed: number;
  cancelled: number;
  /** completed / (completed + failed); cancelled runs are left out. */
  successRate: number | null;
  /** From the attempt that completed (execution log). */
  responseTimeMs: { mean: number; median: number; min: number; max: number } | null;
  retries: number;
  /**
   * Solution quality: share of answers equal to the majority answer of the
   * solvers on the same scenario of the same run. Null without a second solver.
   */
  agreementRate: number | null;
  compared: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const answerOf = (result: unknown) => {
  const r = result as any;
  return r && typeof r === "object" ? JSON.stringify({ satisfiable: r.satisfiable, configurations: r.configurations }) : null;
};

export function benchmark(runs: RunView[]): SolverBenchmark[] {
  const scenarioRuns = runs.flatMap((run) => run.scenarioRuns.map((s) => ({ run, s })));

  // Majority answer per (run, scenario), over the solvers that completed it
  const majority = new Map<string, { answer: string; solvers: number }>();
  const groups = new Map<string, string[]>();
  scenarioRuns
    .filter(({ s }) => s.status === "completed" && answerOf(s.result) !== null)
    .forEach(({ run, s }) => {
      const key = `${run.id}/${s.scenarioId}`;
      groups.set(key, [...(groups.get(key) ?? []), answerOf(s.result)!]);
    });
  groups.forEach((answers, key) => {
    const counts = new Map<string, number>();
    answers.forEach((answer) => counts.set(answer, (counts.get(answer) ?? 0) + 1));
    const [answer] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    majority.set(key, { answer, solvers: answers.length });
  });

  const solverIds = [...new Set(scenarioRuns.map(({ s }) => s.solverId))].sort();
  return solverIds.map((solverId) => {
    const mine = scenarioRuns.filter(({ s }) => s.solverId === solverId);
    const completed = mine.filter(({ s }) => s.status === "completed");
    const failed = mine.filter(({ s }) => s.status === "failed").length;
    const times = completed.map(({ s }) => responseTimeMs(s)).filter((t): t is number => t !== null);
    const comparable = completed.filter(({ run, s }) => (majority.get(`${run.id}/${s.scenarioId}`)?.solvers ?? 0) >= 2);
    const agreeing = comparable.filter(({ run, s }) => majority.get(`${run.id}/${s.scenarioId}`)!.answer === answerOf(s.result));

    return {
      solverId,
      versions: [...new Set(mine.map(({ s }) => s.solverVersion))].sort(),
      scenarioRuns: mine.length,
      completed: completed.length,
      failed,
      cancelled: mine.filter(({ s }) => s.status === "cancelled").length,
      successRate: completed.length + failed > 0 ? completed.length / (completed.length + failed) : null,
      responseTimeMs: times.length
        ? { mean: times.reduce((a, b) => a + b, 0) / times.length, median: median(times), min: Math.min(...times), max: Math.max(...times) }
        : null,
      retries: mine.reduce((total, { s }) => total + s.attemptLog.filter((a) => a.outcome === "transient_error").length, 0),
      agreementRate: comparable.length ? agreeing.length / comparable.length : null,
      compared: comparable.length,
    };
  });
}
