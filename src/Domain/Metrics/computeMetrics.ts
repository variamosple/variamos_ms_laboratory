/**
 * LAB-MT-03: the metrics of a scenario run, computed by the Laboratory when the
 * run of the scenario ends. Every selected metric gets a value or the reason it
 * cannot be computed. Two kinds of inputs:
 * - the pinned model copies, read by the Laboratory itself (REQ-12 to REQ-14, |F|);
 * - the answer of the Reasoning module (products, configurations, required
 *   features, reasoning time). With the mock gateway that answer is simulated,
 *   and the values built on it are marked `simulated`.
 */

/** A metric as frozen in the provenance of the run. */
export interface MetricDefinition {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
  formula: string | null;
  requires: string | null;
}

export interface MetricInputs {
  models: { modelId: string; snapshot: unknown }[];
  /** The answer of the Reasoning module for this scenario run. */
  result: unknown;
}

export interface MetricValue {
  metricId: string;
  value: number | null;
  reason: string | null;
  inputs: Record<string, number>;
  simulated: boolean;
}

/** Ids of the predefined metrics (migration 004). */
export const METRIC_IDS = {
  numberOfProducts: "6c1ab000-0000-4000-8000-000000000001",
  degreeOfVariability: "6c1ab000-0000-4000-8000-000000000002",
  rateOfRequiredFeatures: "6c1ab000-0000-4000-8000-000000000003",
  configurationSpace: "6c1ab000-0000-4000-8000-000000000004",
  reasoningTime: "6c1ab000-0000-4000-8000-000000000005",
  domainCoverage: "6c1ab000-0000-4000-8000-000000000006",
  orphanRate: "6c1ab000-0000-4000-8000-000000000018",
  structuralComplexity: "6c1ab000-0000-4000-8000-000000000019",
  hierarchyDepth: "6c1ab000-0000-4000-8000-000000000020",
};

interface Graph {
  nodes: string[];
  edges: [string, string][];
}

/** The elements and relationships of the input models, as one graph. */
export function modelGraph(models: MetricInputs["models"]): Graph {
  const nodes: string[] = [];
  const edges: [string, string][] = [];
  for (const { modelId, snapshot } of models) {
    const elements = ((snapshot as any)?.elements ?? []) as { id?: string }[];
    const relationships = ((snapshot as any)?.relationships ?? []) as { sourceId?: string; targetId?: string }[];
    // Model ids keep elements of two models apart
    elements.forEach((element, index) => nodes.push(`${modelId}/${element.id ?? index}`));
    relationships
      .filter((r) => r.sourceId && r.targetId)
      .forEach((r) => edges.push([`${modelId}/${r.sourceId}`, `${modelId}/${r.targetId}`]));
  }
  return { nodes, edges };
}

/** Levels of the deepest decomposition branch; the direction of the links does not matter for a tree. */
export function hierarchyDepth({ nodes, edges }: Graph): number {
  if (nodes.length === 0) return 0;
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  edges.forEach(([from, to]) => {
    children.set(from, [...(children.get(from) ?? []), to]);
    hasParent.add(to);
  });
  const memo = new Map<string, number>();
  const depth = (node: string, path: Set<string>): number => {
    if (memo.has(node)) return memo.get(node)!;
    if (path.has(node)) return 0; // a cycle is not a level
    path.add(node);
    const value = 1 + Math.max(0, ...(children.get(node) ?? []).map((child) => depth(child, path)));
    path.delete(node);
    memo.set(node, value);
    return value;
  };
  const roots = nodes.filter((node) => !hasParent.has(node));
  return Math.max(...(roots.length ? roots : nodes).map((root) => depth(root, new Set())));
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

const numberFrom = (result: unknown, field: string): number | undefined => {
  const value = (result as any)?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

export function computeMetrics(metrics: MetricDefinition[], inputs: MetricInputs): MetricValue[] {
  const graph = modelGraph(inputs.models);
  const features = graph.nodes.length;
  const simulatedAnswer = (inputs.result as any)?.simulated === true;

  const value = (metricId: string, v: number, used: Record<string, number>, fromReasoning: boolean): MetricValue => ({
    metricId,
    value: round(v),
    reason: null,
    inputs: used,
    simulated: fromReasoning && simulatedAnswer,
  });
  const none = (metricId: string, reason: string): MetricValue => ({ metricId, value: null, reason, inputs: {}, simulated: false });
  const missing = (metricId: string, field: string) =>
    none(metricId, `The Reasoning module did not return '${field}' for this scenario.`);

  return metrics.map((metric) => {
    const id = metric.id;
    const reasoning = (field: string) => numberFrom(inputs.result, field);

    switch (id) {
      case METRIC_IDS.numberOfProducts: {
        const products = reasoning("products");
        return products === undefined ? missing(id, "products") : value(id, products, { products }, true);
      }
      case METRIC_IDS.degreeOfVariability: {
        const products = reasoning("products");
        if (products === undefined) return missing(id, "products");
        if (features === 0) return none(id, "The input models have no element.");
        return value(id, products / 2 ** features, { products, features }, true);
      }
      case METRIC_IDS.rateOfRequiredFeatures: {
        const core = reasoning("coreFeatures");
        if (core === undefined) return missing(id, "coreFeatures");
        if (features === 0) return none(id, "The input models have no element.");
        return value(id, core / features, { coreFeatures: core, features }, true);
      }
      case METRIC_IDS.configurationSpace: {
        const configurations = reasoning("configurations");
        return configurations === undefined ? missing(id, "configurations") : value(id, configurations, { configurations }, true);
      }
      case METRIC_IDS.reasoningTime: {
        const time = reasoning("reasoningTimeMs");
        return time === undefined ? missing(id, "reasoningTimeMs") : value(id, time, { reasoningTimeMs: time }, true);
      }
      case METRIC_IDS.orphanRate: {
        if (features === 0) return none(id, "The input models have no element.");
        const connected = new Set(graph.edges.flat());
        const orphans = graph.nodes.filter((node) => !connected.has(node)).length;
        return value(id, orphans / features, { orphans, elements: features }, false);
      }
      case METRIC_IDS.structuralComplexity:
        return value(id, graph.edges.length - graph.nodes.length + 2, { edges: graph.edges.length, nodes: graph.nodes.length }, false);
      case METRIC_IDS.hierarchyDepth:
        return value(id, hierarchyDepth(graph), { elements: features }, false);
      case METRIC_IDS.domainCoverage:
        return none(id, "Needs an application model linked to its domain model; the Laboratory does not receive that link yet.");
      default:
        if (metric.code?.startsWith("REQ-")) {
          return none(id, `Needs: ${metric.requires ?? "a specific model"}. Not available for these models (languages targeted by REQ-01 to REQ-14: decision Q7).`);
        }
        return none(id, "Custom metrics are not computed yet (LAB-MT-02).");
    }
  });
}

/** Every metric of a scenario run that did not complete. */
export const notComputed = (metrics: MetricDefinition[], reason: string): MetricValue[] =>
  metrics.map((metric) => ({ metricId: metric.id, value: null, reason, inputs: {}, simulated: false }));
