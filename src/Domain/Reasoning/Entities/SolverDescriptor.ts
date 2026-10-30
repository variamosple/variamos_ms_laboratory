/**
 * A solver as the Reasoning module describes it (MR-SO-02, MR-SO-03): its
 * versions and the parameters an experiment may set (LAB-CF-02).
 */
export interface SolverParameter {
  name: string;
  label: string;
  type: "integer" | "enum";
  default: number | string;
  description?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string; description?: string }[];
}

export interface SolverDescriptor {
  id: string;
  name: string;
  /** Available versions, newest first. An experiment always pins one (LAB-R-03). */
  versions: string[];
  parameters: SolverParameter[];
}

/** Settings of one solver in a scenario: the pinned version and the parameter values. */
export type SolverSettings = { version?: string } & Record<string, unknown>;
