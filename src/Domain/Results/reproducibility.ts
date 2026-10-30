import { RunView } from "../Laboratory/Entities/Run";
import { ExperimentConfigSnapshot } from "../Laboratory/Entities/ExperimentVersion";
import { canonicalJson, modelHash, sha256Hex } from "../Core/canonicalJson";
import { resultRows, toCsv } from "./results";
import { unzip, zip } from "./zip";

/**
 * LAB-RP-01: the reproducibility package of a completed run, a ZIP file with
 * - manifest.json: identifiers, versions, and the SHA-256 of every other file;
 * - configuration.json: the complete setup of the experiment version that ran;
 * - models/<hash>.json: the model copies pinned at Ready, exactly as executed;
 * - semantics/<hash>.json: the semantics of their languages, pinned with them;
 * - results/run.json and results/metrics.csv: results, metrics, attempts;
 * - README.md: how to run it again.
 * Built only from data that never changes after the run, so the same run
 * always gives the same bytes.
 */

export const PACKAGE_FORMAT = "variamos-laboratory-package/1";

export interface PackageInput {
  persistentId: string;
  run: RunView;
  experiment: { id: string; name: string; description?: string; hypothesis?: string; projectId: string | null };
  configuration: ExperimentConfigSnapshot;
  /** Pinned model copies, by hash. */
  snapshots: Map<string, unknown>;
  /** Pinned semantics of the languages, by hash. */
  semantics: Map<string, unknown>;
}

export interface PackageManifest {
  format: string;
  persistentId: string;
  laboratoryVersion: string;
  experiment: PackageInput["experiment"] & { version: number };
  run: { id: string; number: number; status: string; startedBy: string; startedAt: string | null; finishedAt: string | null };
  reasoning: { gateway: string; simulated: boolean };
  /** semanticsHash and semanticsFile are null for a run started before the semantics was kept. */
  models: { modelId: string; languageId: number | null; hash: string; file: string; semanticsHash: string | null; semanticsFile: string | null }[];
  solvers: { id: string; version: string }[];
  /** What the platform cannot give yet: said, not hidden. */
  limitations: string[];
  files: { path: string; sha256: string }[];
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

export function buildPackage(input: PackageInput): Buffer {
  const { run, persistentId } = input;
  const models = new Map<string, PackageManifest["models"][number]>();
  run.provenance.scenarios.forEach((scenario) =>
    scenario.models.forEach((model) =>
      models.set(model.hash, {
        modelId: model.modelId,
        languageId: model.languageId,
        hash: model.hash,
        file: `models/${model.hash}.json`,
        semanticsHash: model.semanticsHash ?? null,
        semanticsFile: model.semanticsHash ? `semantics/${model.semanticsHash}.json` : null,
      })
    )
  );
  const solvers = new Map<string, { id: string; version: string }>();
  run.provenance.scenarios.forEach((scenario) => scenario.solvers.forEach((s) => solvers.set(`${s.id}@${s.version}`, { id: s.id, version: s.version })));
  const simulated = run.scenarioRuns.some((s) => (s.result as any)?.simulated === true);

  const files: { path: string; text: string }[] = [
    {
      path: "configuration.json",
      text: JSON.stringify({ experimentVersion: run.experimentVersion, configuration: input.configuration, scenarios: run.provenance.scenarios, metrics: run.provenance.metrics }, null, 2),
    },
    ...[...models.values()].map((model) => {
      if (!input.snapshots.has(model.hash)) throw new Error(`The pinned copy ${model.hash} of model ${model.modelId} is missing.`);
      return { path: model.file, text: canonicalJson(input.snapshots.get(model.hash)) };
    }),
    ...[...new Set([...models.values()].map((model) => model.semanticsHash).filter((hash): hash is string => !!hash))].map((hash) => {
      if (!input.semantics.has(hash)) throw new Error(`The pinned semantics ${hash} is missing.`);
      return { path: `semantics/${hash}.json`, text: canonicalJson(input.semantics.get(hash)) };
    }),
    { path: "results/run.json", text: JSON.stringify(run, null, 2) },
    { path: "results/metrics.csv", text: toCsv(metricCsv(run)) },
    { path: "README.md", text: readme(input, simulated) },
  ];

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    persistentId,
    laboratoryVersion: run.provenance.laboratoryVersion,
    experiment: { ...input.experiment, version: run.experimentVersion },
    run: { id: run.id, number: run.number, status: run.status, startedBy: run.startedByName ?? run.startedBy, startedAt: iso(run.startedAt), finishedAt: iso(run.finishedAt) },
    reasoning: { gateway: run.provenance.reasoning.gateway, simulated },
    models: [...models.values()],
    solvers: [...solvers.values()],
    limitations: [
      ...([...models.values()].some((model) => !model.semanticsHash)
        ? ["Semantics: this run started before the Laboratory kept the semantics of the languages; the package records only the language id of its models."]
        : []),
      ...(simulated ? ["Results: the Reasoning module was simulated (mock gateway); the results show what the Laboratory sent, not real reasoning."] : []),
    ],
    files: files.map((file) => ({ path: file.path, sha256: sha256Hex(file.text) })),
  };

  const encoder = new TextEncoder();
  return Buffer.from(
    zip([{ path: "manifest.json", text: JSON.stringify(manifest, null, 2) }, ...files].map((file) => ({ path: file.path, data: encoder.encode(file.text) })))
  );
}

function metricCsv(run: RunView) {
  const rows = resultRows([run]);
  return [
    ["scenario", "solver", "solverVersion", "status", "metricCode", "metric", "unit", "value", "reason", "simulated"],
    ...rows.map((r) => [r.scenarioName, r.solverId, r.solverVersion, r.scenarioRunStatus, r.metricCode, r.metricName, r.unit, r.value, r.reason, r.simulated ? "yes" : "no"]),
  ];
}

function readme(input: PackageInput, simulated: boolean): string {
  const { run, persistentId, experiment } = input;
  return `# Reproducibility package ${persistentId}

Experiment "${experiment.name}", version ${run.experimentVersion}, run #${run.number}, ${run.status} on ${iso(run.finishedAt)}.
Produced by the VariaMos Laboratory ${run.provenance.laboratoryVersion}.

## Contents

- \`manifest.json\`: identifiers, versions, and the SHA-256 of every file.
- \`configuration.json\`: the complete setup: scenarios, input models (by hash), solvers with their exact versions and parameters, operational contexts, metrics.
- \`models/\`: the input models exactly as executed. The file name is the SHA-256 of the model in canonical JSON (keys sorted).
- \`semantics/\`: the semantics of the language of each model, as it was when the experiment became Ready. The platform does not
  number the versions of a semantics: its SHA-256, the file name, identifies it.
- \`results/run.json\`: the results of each scenario run, every attempt, and every metric with the figures it was computed from.
- \`results/metrics.csv\`: the metrics, one line per scenario run and metric.

## Running it again

In the VariaMos Laboratory: **Reproduce from a package**, choose this file and a project. The Laboratory checks every hash,
rebuilds the experiment as a Ready experiment with these exact models, solvers and parameters, and you run it. Compare the two
runs side by side: the results must be equivalent (timings apart).

Without the Laboratory: for each scenario and solver in \`configuration.json\`, send the models of \`models/\` and their semantics with the solver
version, parameters and operational context to the Reasoning module, and compare with \`results/run.json\`.
${simulated ? "\n**Note**: these results come from the simulated Reasoning module (mock gateway) used while its public API is agreed.\n" : ""}`;
}

/** What a package gives to rebuild the experiment (LAB-RP-01, LAB-NF-03). */
export interface ReadPackage {
  manifest: PackageManifest;
  configuration: { experimentVersion: number; configuration: ExperimentConfigSnapshot; scenarios: RunView["provenance"]["scenarios"]; metrics: RunView["provenance"]["metrics"] };
  snapshots: Map<string, unknown>;
  semantics: Map<string, unknown>;
}

/** Opens a package and checks it: format, every file hash, every model and semantics hash. Throws with the reason. */
export function readPackage(file: Buffer): ReadPackage {
  let entries: Map<string, string>;
  try {
    entries = unzip(file);
  } catch {
    throw new Error("The file is not a ZIP reproducibility package.");
  }

  const manifestText = entries.get("manifest.json");
  if (!manifestText) throw new Error("The package has no manifest.json.");
  const manifest = JSON.parse(manifestText) as PackageManifest;
  if (manifest.format !== PACKAGE_FORMAT) throw new Error(`Unknown package format '${manifest.format}'.`);

  for (const { path, sha256 } of manifest.files) {
    const text = entries.get(path);
    if (text === undefined) throw new Error(`The package lacks ${path}.`);
    if (sha256Hex(text) !== sha256) throw new Error(`${path} was changed: its SHA-256 does not match the manifest.`);
  }

  const snapshots = new Map<string, unknown>();
  for (const model of manifest.models) {
    const snapshot = JSON.parse(entries.get(model.file) ?? "null");
    if (modelHash(snapshot) !== model.hash) throw new Error(`The model ${model.modelId} does not match its hash ${model.hash}.`);
    snapshots.set(model.hash, snapshot);
  }

  const semantics = new Map<string, unknown>();
  for (const model of manifest.models) {
    if (!model.semanticsHash || !model.semanticsFile || semantics.has(model.semanticsHash)) continue;
    const snapshot = JSON.parse(entries.get(model.semanticsFile) ?? "null");
    if (modelHash(snapshot) !== model.semanticsHash) throw new Error(`The semantics of the model ${model.modelId} does not match its hash ${model.semanticsHash}.`);
    semantics.set(model.semanticsHash, snapshot);
  }

  return { manifest, configuration: JSON.parse(entries.get("configuration.json")!), snapshots, semantics };
}
