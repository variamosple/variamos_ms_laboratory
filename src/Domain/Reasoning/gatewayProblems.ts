import type { ReasoningGateway } from "./ReasoningGateway";
import { ReasoningJobRequest } from "./Entities/ReasoningJob";
import { SolverSettings } from "./Entities/SolverDescriptor";
import { OperationalContext } from "../Laboratory/Entities/Scenario";

/** One scenario as a run would send it: its solvers, its context and its models with their semantics. */
export interface ScenarioJobs {
  label: string;
  solverConfigs: Record<string, SolverSettings> | null | undefined;
  operationalContext: Partial<OperationalContext> | null | undefined;
  models: ReasoningJobRequest["models"];
}

/**
 * LAB-RUN-01: the jobs of each scenario, built as the run builds them, checked by the gateway that will
 * run them. A configuration that is valid for the Laboratory can still be one this gateway cannot take
 * (the semantic translator reasons on one model at a time, without extra constraints). It is refused at
 * Ready and before a run, instead of failing each scenario run once the run exists. Call it once the
 * configuration itself is valid (validateForReady), so that a problem is not reported twice.
 */
export function gatewayProblems(gateway: Pick<ReasoningGateway, "unsupported">, scenarios: ScenarioJobs[]): string[] {
  const unsupported = gateway.unsupported?.bind(gateway);
  if (!unsupported) return [];
  return scenarios.flatMap((scenario) =>
    Object.entries(scenario.solverConfigs ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([id, settings]) => {
        const { version, ...parameters } = settings;
        const context = scenario.operationalContext;
        const problem = unsupported({
          solver: { id, version: String(version), parameters },
          models: scenario.models,
          operationalContext: context
            ? { activeFeatures: context.activeFeatures ?? [], inactiveFeatures: context.inactiveFeatures ?? [], extraConstraints: context.extraConstraints ?? "" }
            : null,
        });
        return problem ? [`${scenario.label} (${id}): ${problem}`] : [];
      })
  );
}
