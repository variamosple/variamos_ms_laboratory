import { ExperimentStatus } from "./Entities/Experiment";
import { ExperimentRoleEnum } from "./Entities/ExperimentUser";
import { SolverDescriptor, SolverSettings } from "../Reasoning/Entities/SolverDescriptor";
import { solverProblems } from "../Reasoning/validateSolverSettings";

/**
 * Experiment state machine and access rules (LAB-EX-03, 05, 06, 07,
 * LAB-COL-01, LAB-NF-05). The repository enforces them; the interface only
 * mirrors them to show the allowed actions.
 */

const { OWNER, DIRECTOR, EDITOR, VIEWER } = ExperimentRoleEnum;

/** LAB-COL-01: read = viewer; write and execute = editor; manage = owner and director. */
export const READ_ROLES = [OWNER, DIRECTOR, EDITOR, VIEWER];
export const WRITE_ROLES = [OWNER, DIRECTOR, EDITOR];
/** LAB-EX-05, LAB-EX-06: the creator and the research director delete, archive and restore. */
export const MANAGE_ROLES = [OWNER, DIRECTOR];

/**
 * LAB-COL-01: what a user may do on an experiment. Read comes with any access;
 * write and execute are given separately when sharing; manage (delete, archive,
 * restore, share) belongs to the owner and the director.
 */
export type Permission = "read" | "write" | "execute" | "manage";

export interface Access {
  role: ExperimentRoleEnum;
  canWrite?: boolean;
  canExecute?: boolean;
}

export function permissionsOf(access: Access | null): Record<Permission, boolean> {
  if (!access) return { read: false, write: false, execute: false, manage: false };
  const full = access.role === OWNER || access.role === DIRECTOR;
  return { read: true, write: full || !!access.canWrite, execute: full || !!access.canExecute, manage: full };
}

/** The role shown for a shared user: editor when they may write. */
export const sharedRole = (canWrite: boolean) => (canWrite ? EDITOR : VIEWER);

/**
 * LAB-EX-03: what saving a change does in each state.
 * - in-place: Draft and Request Changes are edited directly;
 * - new-draft: Ready and finished experiments get a new version, back in Draft,
 *   so it is validated again before the next run (interpretation, roadmap Q1);
 * - rejected: running, archived or deleted experiments cannot be changed.
 */
export type EditOutcome = "in-place" | "new-draft" | "rejected";

export function editOutcome(status: ExperimentStatus): EditOutcome {
  switch (status) {
    case "draft":
    case "request_changes":
      return "in-place";
    case "ready":
    case "completed":
    case "failed":
    case "cancelled":
      return "new-draft";
    default:
      return "rejected";
  }
}

export function editRejection(status: ExperimentStatus): string {
  if (status === "running")
    return "A running experiment cannot be edited. Wait for the run to finish or cancel it.";
  if (status === "archived")
    return "An archived experiment cannot be edited. Restore it first.";
  return `An experiment in state '${status}' cannot be edited.`;
}

/** LAB-EX-07: Draft -> Ready. */
export const canMarkReady = (status: ExperimentStatus) =>
  status === "draft" || status === "request_changes";

/**
 * LAB-RUN-01: a run starts from Ready. A finished experiment keeps its pinned
 * configuration, so it can run again.
 */
export const canRun = (status: ExperimentStatus) =>
  ["ready", "completed", "failed", "cancelled"].includes(status);

export function runRejection(status: ExperimentStatus): string {
  if (status === "running") return "The experiment is already running.";
  if (status === "draft" || status === "request_changes")
    return "Mark the experiment Ready before running it: its configuration is checked and its models are pinned then.";
  return `An experiment in state '${status}' cannot run.`;
}

/** Names and ids of the elements of a model: what an operational context can name (LAB-CF-04). */
export const featureNames = (model: unknown): Set<string> =>
  new Set(
    (((model as any)?.elements ?? []) as { id?: string; name?: string }[]).flatMap((element) =>
      [element.id, element.name].filter((value): value is string => typeof value === "string")
    )
  );

/** LAB-EX-06: anything but a running, archived or deleted experiment can be archived. */
export const canArchive = (status: ExperimentStatus) =>
  !["running", "archived", "deleted"].includes(status);

/**
 * LAB-EX-05: logical deletion. A running experiment must be cancelled first;
 * one with completed executions is archived instead of deleted.
 */
export type DeleteOutcome = "delete" | "archive" | "rejected";

export function deleteRejection(status: ExperimentStatus): string {
  if (status === "running") return "A running experiment cannot be deleted. Cancel the run first.";
  if (status === "archived") return "This archived experiment has completed runs: it stays archived and cannot be deleted.";
  return `An experiment in state '${status}' cannot be deleted.`;
}

export function deleteOutcome(status: ExperimentStatus, hasCompletedRuns: boolean): DeleteOutcome {
  if (status === "running" || status === "deleted") return "rejected";
  // Already archived: archiving again would lose the state to restore
  if (status === "archived") return hasCompletedRuns ? "rejected" : "delete";
  if (hasCompletedRuns || status === "completed") return "archive";
  return "delete";
}

export interface ScenarioInput {
  id?: string;
  name?: string;
  modelIds?: string[];
  solverConfigs?: Record<string, SolverSettings> | null;
  operationalContext?: {
    activeFeatures?: string[];
    inactiveFeatures?: string[];
    extraConstraints?: string;
  } | null;
}

export interface ReadyCheckInput {
  name?: string;
  scenarios: ScenarioInput[];
  metricIds: string[];
}

/** What the platform says about the inputs: models found in vms_projects and the solver catalog. */
export interface ReadyCheckCatalog {
  /** Model id -> names and ids of its elements (the features an operational context can name). */
  models: Map<string, Set<string>>;
  solvers: SolverDescriptor[];
}

/**
 * Checks done before Ready (LAB-EX-01, LAB-CF-01..04, LAB-RUN-01, LAB-R-03).
 * Returns the problems; an empty list means the experiment can become Ready.
 */
export function validateForReady(input: ReadyCheckInput, catalog: ReadyCheckCatalog): string[] {
  const problems: string[] = [];

  if (!input.name?.trim()) problems.push("The experiment needs a name.");
  if (input.scenarios.length < 1) problems.push("Add at least one scenario.");
  if (input.metricIds.length < 1) problems.push("Select at least one metric.");

  input.scenarios.forEach((scenario, index) => {
    const label = scenario.name?.trim() || `Scenario ${index + 1}`;
    const modelIds = scenario.modelIds ?? [];

    if (modelIds.length < 1) problems.push(`${label}: select at least one input model.`);
    modelIds
      .filter((modelId) => !catalog.models.has(modelId))
      .forEach((modelId) => problems.push(`${label}: the model ${modelId} no longer exists.`));

    const solvers = Object.entries(scenario.solverConfigs ?? {});
    if (solvers.length < 1) problems.push(`${label}: add at least one solver.`);
    solvers.forEach(([solverId, settings]) =>
      problems.push(...solverProblems(label, solverId, settings, catalog.solvers))
    );

    const context = scenario.operationalContext;
    const active = context?.activeFeatures ?? [];
    const inactive = context?.inactiveFeatures ?? [];

    const overlap = active.filter((feature) => inactive.includes(feature));
    if (overlap.length)
      problems.push(`${label}: features both active and inactive (${overlap.join(", ")}).`);

    // The features of the context must belong to the scenario models (LAB-CF-04)
    const known = new Set(modelIds.flatMap((modelId) => [...(catalog.models.get(modelId) ?? [])]));
    const unknown = [...new Set([...active, ...inactive])].filter((feature) => !known.has(feature));
    if (unknown.length && modelIds.every((modelId) => catalog.models.has(modelId)))
      problems.push(`${label}: features not found in the input models (${unknown.join(", ")}).`);
  });

  return problems;
}

/** What a clone starts from (LAB-EX-02). */
export interface CloneSource {
  id: string;
  version: number;
  name: string;
  description?: string;
  hypothesis?: string;
  labels: string[];
  scenarios: (ScenarioInput & { id: string })[];
  metrics: { id: string; userId?: string | null }[];
}

/**
 * LAB-EX-02: a clone is a new Draft with the whole configuration of the
 * original and a record of where it comes from. Scenarios get new ids; a
 * private metric of another user is left out (LAB-MT-02).
 */
export function cloneOf(source: CloneSource, userId: string, newId: () => string) {
  return {
    name: `${source.name} (copy)`,
    description: source.description,
    hypothesis: source.hypothesis,
    labels: [...source.labels],
    status: "draft" as ExperimentStatus,
    isTemplate: false,
    isBenchmark: false,
    clonedFrom: { experimentId: source.id, version: source.version },
    scenarios: source.scenarios.map((scenario) => ({ ...JSON.parse(JSON.stringify(scenario)), id: newId() })) as (ScenarioInput & { id: string })[],
    metricIds: source.metrics
      .filter((metric) => metric.userId === null || metric.userId === undefined || metric.userId === userId)
      .map((metric) => metric.id),
  };
}
