import { RunView } from "../Laboratory/Entities/Run";

/**
 * LAB-RP-04: runs side by side, of one experiment or several, with what
 * differs in their setup and in their results. Scenarios are matched by name,
 * so a run can be compared with its reproduction (other ids, same setup).
 */

export interface ComparedRun {
  runId: string;
  persistentId: string | null;
  number: number;
  status: string;
  experiment: { id: string; name: string; version: number };
  finishedAt: Date | string | null;
  configuration: Record<string, unknown>;
  results: Record<string, unknown>;
}

export interface RunComparison {
  runs: ComparedRun[];
  /** Paths (e.g. "Free/solvers/z3/parameters/timeOut") whose value is not the same in every run. */
  differences: { configuration: string[]; results: string[] };
  /** Same results in every run, timings apart (LAB-NF-03: deterministic results). */
  equivalent: boolean;
}

/** Timings change from one execution to the next: they are compared, not required to be equal. */
const TIMING_RESULT_FIELDS = new Set(["reasoningTimeMs"]);
const TIMING_METRIC_IDS = new Set(["6c1ab000-0000-4000-8000-000000000005"]);

const scenarioKey = (name: string | null, index: number) => name || `Scenario ${index + 1}`;

export function configurationOf(run: RunView): Record<string, unknown> {
  return {
    scenarios: Object.fromEntries(
      run.provenance.scenarios.map((scenario, index) => [
        scenarioKey(scenario.name, index),
        {
          models: scenario.models.map((m) => m.hash),
          solvers: Object.fromEntries(scenario.solvers.map((s) => [s.id, { version: s.version, parameters: s.parameters }])),
          operationalContext: scenario.operationalContext ?? null,
        },
      ])
    ),
    metrics: run.provenance.metrics.map((m) => m.name).sort(),
  };
}

export function resultsOf(run: RunView, withTimings = true): Record<string, unknown> {
  return Object.fromEntries(
    run.scenarioRuns.map((s, index) => {
      const result = s.result && typeof s.result === "object"
        ? Object.fromEntries(Object.entries(s.result as Record<string, unknown>).filter(([key]) => withTimings || !TIMING_RESULT_FIELDS.has(key)))
        : s.result;
      const metrics = Object.fromEntries(
        s.metrics
          .filter((m) => withTimings || !TIMING_METRIC_IDS.has(m.metricId))
          .map((m) => [run.provenance.metrics.find((d) => d.id === m.metricId)?.name ?? m.metricId, m.value ?? m.reason])
      );
      return [`${scenarioKey(s.scenarioName, index)}/${s.solverId}`, { status: s.status, result, metrics }];
    })
  );
}

/** Every leaf path of the objects; arrays are compared whole. */
function leaves(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      leaves(child, prefix ? `${prefix}/${key}` : key).forEach((v, k) => out.set(k, v));
    }
    if (Object.keys(value as object).length === 0 && prefix) out.set(prefix, "{}");
  } else {
    out.set(prefix, JSON.stringify(value ?? null));
  }
  return out;
}

export function differingPaths(values: unknown[]): string[] {
  const all = values.map((v) => leaves(v));
  const paths = new Set(all.flatMap((m) => [...m.keys()]));
  return [...paths].filter((path) => new Set(all.map((m) => m.get(path) ?? "<absent>")).size > 1).sort();
}

export function compareRuns(runs: { run: RunView; persistentId: string | null; experiment: { id: string; name: string } }[]): RunComparison {
  const compared = runs.map(({ run, persistentId, experiment }) => ({
    runId: run.id,
    persistentId,
    number: run.number,
    status: run.status,
    experiment: { ...experiment, version: run.experimentVersion },
    finishedAt: run.finishedAt,
    configuration: configurationOf(run),
    results: resultsOf(run),
  }));
  return {
    runs: compared,
    differences: {
      configuration: differingPaths(compared.map((c) => c.configuration)),
      results: differingPaths(compared.map((c) => c.results)),
    },
    equivalent: differingPaths(runs.map(({ run }) => resultsOf(run, false))).length === 0,
  };
}
