import { OperationalContext } from "../../Laboratory/Entities/Scenario";

/**
 * One reasoning job: one solver on the pinned models of a scenario, with its
 * operational context (LAB-CF-01, LAB-CF-02, LAB-CF-04). The Laboratory sends
 * the copies frozen at Ready, never the live models, with the semantics of their
 * language frozen with them (LAB-RP-01; null for runs started before it was kept).
 */
export interface ReasoningJobRequest {
  solver: { id: string; version: string; parameters: Record<string, unknown> };
  models: { modelId: string; languageId: number | null; hash: string; snapshot: unknown; semantics: unknown }[];
  operationalContext: OperationalContext | null;
}

/** MR-RZ-05 job states, as LAB-RUN-03 names them. */
export type ReasoningJobState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface ReasoningJobStatus {
  jobId: string;
  state: ReasoningJobState;
  /** 0 to 1, when the Reasoning module reports it. */
  progress?: number;
  result?: unknown;
  error?: { message: string; transient: boolean };
}

/** A failure worth trying again: network timeout, solver temporarily unavailable (LAB-RUN-06). */
export class TransientReasoningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientReasoningError";
  }
}
