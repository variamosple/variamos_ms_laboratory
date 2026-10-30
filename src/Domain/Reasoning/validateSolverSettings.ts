import { SolverDescriptor, SolverSettings } from "./Entities/SolverDescriptor";

const FLOATING_VERSIONS = ["", "latest", "*"];

export const isFloatingVersion = (version: unknown) =>
  typeof version !== "string" || FLOATING_VERSIONS.includes(version.trim().toLowerCase());

/**
 * LAB-CF-02 / LAB-R-03: a solver of a scenario must be offered by the
 * Reasoning module, pinned to one of its versions, and every parameter must
 * be set to a valid value. Returns the problems, prefixed with `label`.
 */
export function solverProblems(
  label: string,
  solverId: string,
  settings: SolverSettings | null | undefined,
  catalog: SolverDescriptor[]
): string[] {
  const solver = catalog.find((descriptor) => descriptor.id === solverId);
  if (!solver) {
    return [`${label}: the solver ${solverId} is not offered by the Reasoning module.`];
  }

  const problems: string[] = [];
  const values = settings ?? {};

  if (isFloatingVersion(values.version)) {
    problems.push(`${label}: ${solver.name} must be pinned to a version (no "latest").`);
  } else if (!solver.versions.includes(values.version as string)) {
    problems.push(
      `${label}: version ${values.version} of ${solver.name} is not available (available: ${solver.versions.join(", ")}).`
    );
  }

  for (const key of Object.keys(values)) {
    if (key !== "version" && !solver.parameters.some((parameter) => parameter.name === key)) {
      problems.push(`${label}: ${solver.name} has no parameter "${key}".`);
    }
  }

  for (const parameter of solver.parameters) {
    const value = values[parameter.name];

    if (value === undefined || value === null || value === "") {
      problems.push(`${label}: set ${parameter.label.toLowerCase()} for ${solver.name}.`);
      continue;
    }

    if (parameter.type === "integer") {
      const tooLow = parameter.min !== undefined && (value as number) < parameter.min;
      const tooHigh = parameter.max !== undefined && (value as number) > parameter.max;
      if (!Number.isInteger(value) || tooLow || tooHigh) {
        const range =
          parameter.max !== undefined
            ? ` between ${parameter.min ?? 0} and ${parameter.max}`
            : parameter.min !== undefined
              ? ` of at least ${parameter.min}`
              : "";
        problems.push(`${label}: ${parameter.label.toLowerCase()} for ${solver.name} must be a whole number${range}.`);
      }
    }

    if (parameter.type === "enum" && !parameter.options?.some((option) => option.value === value)) {
      problems.push(`${label}: "${value}" is not a valid ${parameter.label.toLowerCase()} for ${solver.name}.`);
    }
  }

  return problems;
}
