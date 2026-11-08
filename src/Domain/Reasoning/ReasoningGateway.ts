import { SolverDescriptor } from "./Entities/SolverDescriptor";
import { ReasoningJobRequest, ReasoningJobStatus } from "./Entities/ReasoningJob";
import MockReasoningGateway from "../../DataProviders/reasoning/MockReasoningGateway";
import SemanticTranslatorReasoningGateway from "../../DataProviders/reasoning/SemanticTranslatorReasoningGateway";
import { Config } from "../../Config";

/**
 * The only way the Laboratory reaches the Reasoning module (LAB-R-02): no
 * solver code or library in this service. The mock answers by default; the
 * semantic translator of VariaMos runs real solvers (roadmap Q5).
 */
export interface ReasoningGateway {
  /** A short name recorded in the provenance of each run (LAB-RP-02). */
  readonly name: string;
  /** Solvers offered by the Reasoning module, with versions and parameters. */
  listSolvers(): Promise<SolverDescriptor[]>;
  /** Starts a job; throws TransientReasoningError when it is worth trying again (LAB-RUN-06). */
  submit(request: ReasoningJobRequest): Promise<{ jobId: string }>;
  /** Current state of a job (LAB-RUN-03). */
  status(jobId: string): Promise<ReasoningJobStatus>;
  /** Stops a job and releases its solver resources (LAB-RUN-04). */
  cancel(jobId: string): Promise<void>;
}

/** The gateway named by LAB_REASONING_GATEWAY. */
function configured(name: typeof Config.GATEWAYS.REASONING): ReasoningGateway {
  switch (name) {
    case "mock":
      return new MockReasoningGateway();
    case "semantic_translator":
      if (!Config.GATEWAYS.SEMANTIC_TRANSLATOR_URL) {
        throw new Error("LAB_REASONING_GATEWAY=semantic_translator needs LAB_SEMANTIC_TRANSLATOR_URL, the address of its /query endpoint.");
      }
      return new SemanticTranslatorReasoningGateway({ url: Config.GATEWAYS.SEMANTIC_TRANSLATOR_URL });
  }
}

let gateway: ReasoningGateway = configured(Config.GATEWAYS.REASONING);

export const getReasoningGateway = (): ReasoningGateway => gateway;

/** Replaces the gateway (tests). */
export const setReasoningGateway = (next: ReasoningGateway) => {
  gateway = next;
};
