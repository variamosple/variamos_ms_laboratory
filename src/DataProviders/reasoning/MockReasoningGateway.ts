import { randomUUID } from "crypto";
import { ReasoningGateway } from "../../Domain/Reasoning/ReasoningGateway";
import { ReasoningJobRequest, ReasoningJobStatus, TransientReasoningError } from "../../Domain/Reasoning/Entities/ReasoningJob";
import { SolverDescriptor, SolverParameter } from "../../Domain/Reasoning/Entities/SolverDescriptor";

const TIMEOUT: SolverParameter = {
  name: "timeOut",
  label: "Time out (seconds)",
  type: "integer",
  default: 60,
  min: 1,
  max: 3600,
};

const RANDOM_SEED: SolverParameter = {
  name: "randomSeed",
  label: "Random seed",
  type: "integer",
  default: 42,
  min: 0,
};

/** LAB-CF-02 names the mode as a solver parameter. */
const MODE: SolverParameter = {
  name: "mode",
  label: "Mode",
  type: "enum",
  default: "satisfiability",
  options: [
    { value: "satisfiability", label: "Satisfiability", description: "Is there at least one valid configuration?" },
    { value: "enumeration", label: "Enumeration", description: "List the valid configurations." },
    { value: "optimization", label: "Optimization", description: "Find the best configuration for an objective." },
  ],
};

/**
 * The three solvers the first version of the interface offered, with the
 * options it showed, until the Reasoning module serves its own catalog.
 */
const SOLVERS: SolverDescriptor[] = [
  {
    id: "minizinc",
    name: "MiniZinc (Gecode)",
    versions: ["2.8.5"],
    parameters: [
      TIMEOUT,
      RANDOM_SEED,
      MODE,
      {
        name: "variableSelection",
        label: "Variable selection",
        type: "enum",
        default: "default",
        options: [
          { value: "default", label: "Default", description: "Let the solver choose the search strategy." },
          { value: "first_fail", label: "First Fail", description: "Selects the variable with the smallest domain first. Often reduces search time." },
          { value: "most_constrained", label: "Most Constrained", description: "Prioritizes variables involved in the largest number of constraints." },
        ],
      },
      {
        name: "valueSelection",
        label: "Value selection",
        type: "enum",
        default: "default",
        options: [
          { value: "default", label: "Default", description: "Let the solver choose how values are explored." },
          { value: "min_first", label: "Min First", description: "Tests the smallest values first." },
          { value: "max_first", label: "Max First", description: "Tests the largest values first." },
          { value: "split_domain", label: "Split Domain", description: "Splits the domain into ranges instead of testing values one by one." },
        ],
      },
    ],
  },
  {
    id: "swi-prolog",
    name: "SWI-Prolog CLP(FD)",
    versions: ["9.2.7"],
    parameters: [
      TIMEOUT,
      RANDOM_SEED,
      MODE,
      {
        name: "variableSelection",
        label: "Variable selection",
        type: "enum",
        default: "default",
        options: [
          { value: "default", label: "Default", description: "Let the solver choose the search strategy." },
          { value: "ff", label: "First Fail (ff)", description: "Selects the variable with the smallest domain." },
          { value: "ffc", label: "First Fail + Constraints", description: "Uses domain size and constraint information." },
        ],
      },
      {
        name: "valueSelection",
        label: "Value selection",
        type: "enum",
        default: "default",
        options: [
          { value: "default", label: "Default", description: "Let the solver choose how values are explored." },
          { value: "up", label: "Ascending (up)", description: "Tests smaller values first." },
          { value: "down", label: "Descending (down)", description: "Tests larger values first." },
          { value: "bisect", label: "Bisect", description: "Splits the domain into two ranges." },
        ],
      },
    ],
  },
  {
    id: "z3",
    name: "Microsoft Z3",
    versions: ["4.13.0"],
    parameters: [TIMEOUT, RANDOM_SEED, MODE],
  },
];

export interface MockReasoningOptions {
  /** How long a job takes; the first tenth of it is PENDING. */
  durationMs?: number;
  /** The next submissions that fail with a transient error (LAB-RUN-06 tests). */
  transientFailures?: number;
  /** Jobs whose solver has this id fail without retry (LAB-EX-07 error states). */
  failingSolverId?: string;
  /** The next status requests that fail with a transient error, as a network timeout would. */
  transientStatusFailures?: number;
}

interface MockJob {
  request: ReasoningJobRequest;
  submittedAt: number;
}

/**
 * Stands in for the Reasoning module until its public API exists (roadmap Q5).
 * It runs nothing: a job only waits `durationMs`, then returns a result
 * computed from what it received, marked as simulated. The result reflects the
 * models, parameters and operational context sent, so tests can check that a
 * run uses exactly the pinned configuration (LAB-CF-01, LAB-CF-02, LAB-CF-04).
 */
export default class MockReasoningGateway implements ReasoningGateway {
  readonly name = "mock";
  private readonly jobs = new Map<string, MockJob>();
  private readonly durationMs: number;
  private transientFailures: number;
  private readonly failingSolverId?: string;
  private transientStatusFailures: number;
  /** Every request received, in order (tests). */
  readonly received: ReasoningJobRequest[] = [];

  constructor(options: MockReasoningOptions = {}) {
    this.durationMs = options.durationMs ?? Number(process.env.MOCK_REASONING_DURATION_MS ?? 2000);
    this.transientFailures = options.transientFailures ?? 0;
    this.failingSolverId = options.failingSolverId;
    this.transientStatusFailures = options.transientStatusFailures ?? 0;
  }

  async listSolvers(): Promise<SolverDescriptor[]> {
    // A copy, so callers cannot change the catalog (structuredClone is missing on Node 16, used by the Dockerfile)
    return JSON.parse(JSON.stringify(SOLVERS));
  }

  async submit(request: ReasoningJobRequest): Promise<{ jobId: string }> {
    this.received.push(JSON.parse(JSON.stringify(request)));
    if (this.transientFailures > 0) {
      this.transientFailures -= 1;
      throw new TransientReasoningError("Solver temporarily unavailable (simulated).");
    }
    const jobId = `mock-${randomUUID()}`;
    this.jobs.set(jobId, { request, submittedAt: Date.now() });
    return { jobId };
  }

  async status(jobId: string): Promise<ReasoningJobStatus> {
    if (this.transientStatusFailures > 0) {
      this.transientStatusFailures -= 1;
      throw new TransientReasoningError("Reasoning module did not answer in time (simulated).");
    }
    const job = this.jobs.get(jobId);
    if (!job) {
      return { jobId, state: "FAILED", error: { message: "Unknown or cancelled job.", transient: false } };
    }

    const elapsed = Date.now() - job.submittedAt;
    if (elapsed < this.durationMs) {
      const progress = Math.min(elapsed / this.durationMs, 0.99);
      return { jobId, state: progress < 0.1 ? "PENDING" : "RUNNING", progress };
    }

    this.jobs.delete(jobId);
    if (job.request.solver.id === this.failingSolverId) {
      return { jobId, state: "FAILED", error: { message: "The solver could not handle the model (simulated).", transient: false } };
    }
    return { jobId, state: "COMPLETED", progress: 1, result: simulatedResult(job.request, elapsed) };
  }

  async cancel(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }

  /** Jobs holding solver resources (LAB-RUN-04 tests). */
  activeJobs(): number {
    return this.jobs.size;
  }
}

/**
 * A plausible answer, not a reasoning one: the features of the models, those
 * the operational context forces, and 2^(free features) configurations.
 */
function simulatedResult(request: ReasoningJobRequest, elapsedMs: number) {
  const features = new Set(
    request.models.flatMap((model) =>
      (((model.snapshot as any)?.elements ?? []) as { name?: string; id?: string }[]).map((element) => element.name ?? element.id ?? "")
    ).filter(Boolean)
  );
  const active = request.operationalContext?.activeFeatures ?? [];
  const inactive = request.operationalContext?.inactiveFeatures ?? [];
  const free = Math.max(0, features.size - active.length - inactive.length);

  return {
    simulated: true,
    solver: { id: request.solver.id, version: request.solver.version },
    parameters: request.solver.parameters,
    modelHashes: request.models.map((model) => model.hash),
    satisfiable: true,
    features: features.size,
    forcedActive: active.length,
    forcedInactive: inactive.length,
    // Without and with the operational context
    products: 2 ** features.size,
    configurations: 2 ** free,
    // A stand-in: the root is the only feature every product has
    coreFeatures: Math.min(1, features.size),
    reasoningTimeMs: elapsedMs,
  };
}
