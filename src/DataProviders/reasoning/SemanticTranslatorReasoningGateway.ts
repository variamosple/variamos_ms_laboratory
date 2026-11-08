import { randomUUID } from "crypto";
import { ReasoningGateway } from "../../Domain/Reasoning/ReasoningGateway";
import { ReasoningJobRequest, ReasoningJobState, ReasoningJobStatus, TransientReasoningError } from "../../Domain/Reasoning/Entities/ReasoningJob";
import { SolverDescriptor, SolverParameter, UNPINNED_VERSION } from "../../Domain/Reasoning/Entities/SolverDescriptor";

/** Laboratory solver ids and the targets of the semantic translator (TargetLang). */
const TARGETS: Record<string, string> = { minizinc: "minizinc", "swi-prolog": "swi", z3: "z3" };

const TIMEOUT: SolverParameter = {
  name: "timeOut",
  label: "Time out (seconds)",
  type: "integer",
  default: 60,
  min: 1,
  max: 3600,
  description: "How long the Laboratory waits for each request to the semantic translator.",
};

const MODE: SolverParameter = {
  name: "mode",
  label: "Mode",
  type: "enum",
  default: "satisfiability",
  options: [
    { value: "satisfiability", label: "Satisfiability", description: "Is there at least one valid configuration?" },
    { value: "enumeration", label: "Enumeration", description: "Count the valid configurations, up to the maximum below." },
  ],
};

const MAX_SOLUTIONS: SolverParameter = {
  name: "maxSolutions",
  label: "Maximum solutions",
  type: "integer",
  default: 1000,
  min: 1,
  max: 100000,
  description: "Products are counted exactly up to this number; beyond it, the count is only a lower bound.",
};

// The semantic translator does not report solver versions (open question to the team)
const SOLVERS: SolverDescriptor[] = [
  { id: "minizinc", name: "MiniZinc", versions: [UNPINNED_VERSION], parameters: [TIMEOUT, MODE, MAX_SOLUTIONS] },
  { id: "swi-prolog", name: "SWI-Prolog", versions: [UNPINNED_VERSION], parameters: [TIMEOUT, MODE, MAX_SOLUTIONS] },
  { id: "z3", name: "Microsoft Z3", versions: [UNPINNED_VERSION], parameters: [TIMEOUT, MODE, MAX_SOLUTIONS] },
];

type Model = { id?: string; elements?: Element[] } & Record<string, unknown>;
type Element = { id?: string; name?: string; type?: string; properties?: { name?: string; value?: unknown }[] };

/** The query object of the /query endpoint (old_request_handler/variamos/query.py). */
export interface TranslatorQuery {
  operation: "sat" | "nsolve";
  solver: string;
  operation_n?: number;
  iterate_over?: { model_object: "element"; relationship_element: null; object_type: string[]; with_value: number }[];
}

/** What one job asks, checked before anything is sent. */
export interface TranslatorPlan {
  target: string;
  mode: "satisfiability" | "enumeration";
  maxSolutions: number;
  timeoutMs: number;
  modelId: string;
  semantics: unknown;
  /** The pinned model, as it was frozen at Ready. */
  model: Model;
  /** The same model with the operational context applied, or null without a context. */
  contextModel: Model | null;
}

/** Why a job cannot be sent to the semantic translator; never worth trying again. */
export class UnsupportedJobError extends Error {
  constructor(message: string) {
    super(`semantic_translator: ${message}`);
    this.name = "UnsupportedJobError";
  }
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * The model with the operational context applied the way the VariaMos editor
 * does it: the "Selected" property of a feature set to Selected or Unselected,
 * which the semantic translator turns into the selected or deselected
 * constraint of the language (LAB-CF-04). A feature of the context is named by
 * its id or its name, as Ready accepts it (featureNames in ExperimentLifecycle).
 */
export function applyContext(model: Model, active: string[], inactive: string[]): Model {
  const result = copy(model);
  const force = (feature: string, value: "Selected" | "Unselected") => {
    const elements = (result.elements ?? []).filter((element) => element.id === feature || element.name === feature);
    if (elements.length === 0) throw new UnsupportedJobError(`the feature "${feature}" of the operational context is not in the model.`);
    elements.forEach((element) => {
      const selected = (element.properties ?? []).find((property) => property.name === "Selected");
      if (!selected) throw new UnsupportedJobError(`the feature "${feature}" has no "Selected" property, so the operational context cannot force it.`);
      selected.value = value;
    });
  };
  active.forEach((name) => force(name, "Selected"));
  inactive.forEach((name) => force(name, "Unselected"));
  return result;
}

export function planOf(request: ReasoningJobRequest): TranslatorPlan {
  const target = TARGETS[request.solver.id];
  if (!target) throw new UnsupportedJobError(`no solver "${request.solver.id}"; it offers ${Object.keys(TARGETS).join(", ")}.`);
  if (request.models.length !== 1) {
    throw new UnsupportedJobError(`it reasons on one model at a time, and this scenario has ${request.models.length}.`);
  }
  const [pinned] = request.models;
  if (pinned.semantics === null || pinned.semantics === undefined) {
    throw new UnsupportedJobError(`the model ${pinned.modelId} has no pinned semantics: the translation rules of its language are needed.`);
  }

  const parameters = request.solver.parameters;
  const mode = parameters.mode ?? MODE.default;
  if (mode !== "satisfiability" && mode !== "enumeration") throw new UnsupportedJobError(`the mode "${mode}" is not offered.`);

  const context = request.operationalContext;
  if (context?.extraConstraints?.trim()) throw new UnsupportedJobError("extra constraints of the operational context cannot be sent.");

  // The id the translator looks for in the project (modelSelectedId)
  const model = copy(pinned.snapshot ?? {}) as Model;
  model.id = model.id ?? pinned.modelId;
  const active = context?.activeFeatures ?? [];
  const inactive = context?.inactiveFeatures ?? [];

  return {
    target,
    mode,
    maxSolutions: Number(parameters.maxSolutions ?? MAX_SOLUTIONS.default),
    timeoutMs: Number(parameters.timeOut ?? TIMEOUT.default) * 1000,
    modelId: String(model.id),
    semantics: pinned.semantics,
    model,
    contextModel: active.length || inactive.length ? applyContext(model, active, inactive) : null,
  };
}

/** The body of a /query request, as the VariaMos editor builds it (VariaMosLanguages QueryUseCases.ts). */
export function bodyOf(plan: TranslatorPlan, model: Model, query: TranslatorQuery) {
  return {
    data: {
      rules: plan.semantics,
      query,
      modelSelectedId: plan.modelId,
      transactionId: randomUUID(),
      // A project with this model only: the translator reads the models of the first product line
      project: {
        id: "variamos-laboratory",
        name: "VariaMos Laboratory run",
        productLines: [
          {
            id: "variamos-laboratory-line",
            name: "VariaMos Laboratory run",
            domainEngineering: { models: [model] },
            applicationEngineering: { models: [], applications: [] },
          },
        ],
      },
    },
  };
}

/** Number of solutions in a /query answer: false, one project, or a list of projects. */
export function solutionsIn(content: unknown): number {
  if (content === false) return 0;
  if (Array.isArray(content)) return content.length;
  if (content && typeof content === "object") return 1;
  throw new Error(`semantic_translator: unexpected answer to nsolve: ${JSON.stringify(content)?.slice(0, 200)}`);
}

/**
 * Required features: those that cannot be deselected. The answer of an
 * iteration is a list of [variable, satisfiable] pairs.
 */
export function coreFeaturesIn(content: unknown): number {
  if (!Array.isArray(content) || !content.every((pair) => Array.isArray(pair) && typeof pair[1] === "boolean")) {
    throw new Error(`semantic_translator: unexpected answer to the iteration: ${JSON.stringify(content)?.slice(0, 200)}`);
  }
  return content.filter((pair) => pair[1] === false).length;
}

interface Job {
  state: ReasoningJobState;
  progress: number;
  result?: unknown;
  error?: { message: string; transient: boolean };
  controller: AbortController;
}

export interface SemanticTranslatorOptions {
  /** The /query endpoint, e.g. http://localhost:5001/query */
  url: string;
}

/**
 * Runs the jobs of the Laboratory on the semantic translator of VariaMos
 * (variamosple/semantic_translator), through its /query endpoint: it
 * translates the model and the semantics of its language into CLIF, then calls
 * the solver. The endpoint answers synchronously and has no job to follow or
 * cancel: the job lives here, and cancelling it stops the Laboratory waiting,
 * while the solver may finish its request on the translator (limit of LAB-RUN-04).
 */
export default class SemanticTranslatorReasoningGateway implements ReasoningGateway {
  readonly name = "semantic_translator";
  private readonly jobs = new Map<string, Job>();
  private readonly url: string;

  constructor(options: SemanticTranslatorOptions) {
    this.url = options.url;
  }

  async listSolvers(): Promise<SolverDescriptor[]> {
    return copy(SOLVERS);
  }

  async submit(request: ReasoningJobRequest): Promise<{ jobId: string }> {
    const plan = planOf(request);
    const jobId = `st-${randomUUID()}`;
    const job: Job = { state: "PENDING", progress: 0, controller: new AbortController() };
    this.jobs.set(jobId, job);
    void this.run(job, plan, request);
    return { jobId };
  }

  async status(jobId: string): Promise<ReasoningJobStatus> {
    const job = this.jobs.get(jobId);
    if (!job) return { jobId, state: "FAILED", error: { message: "Unknown or cancelled job.", transient: false } };
    if (job.state === "COMPLETED" || job.state === "FAILED") this.jobs.delete(jobId);
    return { jobId, state: job.state, progress: job.progress, result: job.result, error: job.error };
  }

  async cancel(jobId: string): Promise<void> {
    this.jobs.get(jobId)?.controller.abort();
    this.jobs.delete(jobId);
  }

  /** Jobs still waiting for the translator (tests). */
  activeJobs(): number {
    return this.jobs.size;
  }

  private async run(job: Job, plan: TranslatorPlan, request: ReasoningJobRequest) {
    const startedAt = Date.now();
    const statistics: unknown[] = [];
    const warnings: string[] = [];
    const enumeration = plan.mode === "enumeration";
    // sat, the counts, a sat of the model alone when only the context was checked, the iteration
    const steps = 2 + (enumeration ? (plan.contextModel ? 2 : 1) : plan.contextModel ? 1 : 0);
    let done = 0;
    const ask = async (model: Model, query: TranslatorQuery) => {
      job.state = "RUNNING";
      const answer = await this.post(bodyOf(plan, model, query), plan.timeoutMs, job.controller.signal);
      statistics.push(answer.statistics ?? null);
      done += 1;
      job.progress = Math.min(done / steps, 0.99);
      return answer.content;
    };
    const sat: TranslatorQuery = { operation: "sat", solver: plan.target };
    const nsolve: TranslatorQuery = { operation: "nsolve", solver: plan.target, operation_n: plan.maxSolutions };

    try {
      // Under the operational context when there is one (LAB-CF-04)
      const satisfiable = (await ask(plan.contextModel ?? plan.model, sat)) === true;
      let modelSatisfiable = plan.contextModel ? undefined : satisfiable;
      const result: Record<string, unknown> = {
        simulated: false,
        gateway: this.name,
        solver: { id: request.solver.id, version: request.solver.version, target: plan.target },
        parameters: request.solver.parameters,
        modelHashes: request.models.map((model) => model.hash),
        satisfiable,
      };

      if (enumeration) {
        // Products of the model as pinned, then configurations under the operational context
        const counted = (count: number, field: string) => {
          if (count < plan.maxSolutions) result[field] = count;
          else {
            result[`${field}AtLeast`] = count;
            warnings.push(`At least ${count} ${field}: only a lower bound is known; raise maxSolutions.`);
          }
        };
        const products = solutionsIn(await ask(plan.model, nsolve));
        modelSatisfiable = products > 0;
        counted(products, "products");
        if (!plan.contextModel) counted(products, "configurations");
        else if (!satisfiable) result.configurations = 0;
        else counted(solutionsIn(await ask(plan.contextModel, nsolve)), "configurations");
      }

      // Required features: those that cannot be deselected, defined only for a model with products
      const types = [...new Set((plan.model.elements ?? [])
        .filter((element) => (element.properties ?? []).some((property) => property.name === "Selected"))
        .map((element) => element.type)
        .filter((type): type is string => Boolean(type)))];
      if (types.length === 0) warnings.push("No element has a \"Selected\" property: required features were not computed.");
      else {
        if (modelSatisfiable === undefined) modelSatisfiable = (await ask(plan.model, sat)) === true;
        if (!modelSatisfiable) warnings.push("The model has no valid configuration: required features are not defined.");
        else {
          try {
            const iteration: TranslatorQuery = { ...sat, iterate_over: [{ model_object: "element", relationship_element: null, object_type: types, with_value: 0 }] };
            result.coreFeatures = coreFeaturesIn(await ask(plan.model, iteration));
          } catch (error) {
            if (job.controller.signal.aborted) throw error;
            warnings.push(`Required features were not computed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      result.reasoningTimeMs = Date.now() - startedAt;
      result.statistics = statistics;
      result.warnings = warnings;
      Object.assign(job, { state: "COMPLETED", progress: 1, result });
    } catch (error) {
      if (job.controller.signal.aborted) return; // cancelled: nobody reads this job any more
      const message = error instanceof Error ? error.message : String(error);
      Object.assign(job, { state: "FAILED", error: { message, transient: error instanceof TransientReasoningError } });
    }
  }

  /** One request to /query; the answer's data, or an error saying whether trying again may help (LAB-RUN-06). */
  private async post(body: unknown, timeoutMs: number, cancelled: AbortSignal): Promise<{ content: unknown; statistics?: unknown }> {
    // One signal for both ends of a request: the job cancelled, or no answer in time
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCancel = () => controller.abort();
    cancelled.addEventListener("abort", onCancel);

    let status: number;
    let text: string;
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      status = response.status;
      text = await response.text();
    } catch (error) {
      if (cancelled.aborted) throw new Error("Cancelled.");
      if (timedOut) throw new Error(`semantic_translator did not answer within ${timeoutMs / 1000} s (timeOut).`);
      throw new TransientReasoningError(`semantic_translator could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
      cancelled.removeEventListener("abort", onCancel);
    }

    if ([429, 502, 503, 504].includes(status)) {
      throw new TransientReasoningError(`semantic_translator is unavailable (HTTP ${status}).`);
    }
    if (status < 200 || status >= 300) throw new Error(`semantic_translator answered HTTP ${status}: ${text.slice(0, 300)}`);

    let answer: any;
    try {
      answer = JSON.parse(text);
    } catch {
      throw new Error(`semantic_translator did not answer JSON: ${text.slice(0, 300)}`);
    }
    // Errors of the translator come with HTTP 200
    if (answer?.data?.error !== undefined) throw new Error(`semantic_translator: ${answer.data.error}`);
    if (!answer?.data || !("content" in answer.data)) throw new Error(`semantic_translator: no content in the answer: ${text.slice(0, 300)}`);
    return { content: answer.data.content, statistics: answer.statistics };
  }
}
