import { METRIC_IDS, MetricDefinition, computeMetrics, hierarchyDepth, modelGraph, notComputed } from "./computeMetrics";

const definition = (id: string, code: string | null = null, requires: string | null = null): MetricDefinition => ({
  id, code, name: id, unit: null, formula: null, requires,
});

// Car -> GPS, Car -> Radio, Radio -> FM; Wipers alone
const car = {
  elements: [{ id: "car" }, { id: "gps" }, { id: "radio" }, { id: "fm" }, { id: "wipers" }],
  relationships: [
    { sourceId: "car", targetId: "gps" },
    { sourceId: "car", targetId: "radio" },
    { sourceId: "radio", targetId: "fm" },
  ],
};

describe("structural metrics, from the model copy (REQ-12, REQ-13, REQ-14)", () => {
  const [orphans, complexity, depth] = computeMetrics(
    [definition(METRIC_IDS.orphanRate), definition(METRIC_IDS.structuralComplexity), definition(METRIC_IDS.hierarchyDepth)],
    { models: [{ modelId: "m1", snapshot: car }], result: { simulated: true } }
  );

  test("orphan item rate: elements without any relationship / elements", () => {
    expect(orphans).toEqual({ metricId: METRIC_IDS.orphanRate, value: 0.2, reason: null, inputs: { orphans: 1, elements: 5 }, simulated: false });
  });

  test("structural complexity: E - N + 2", () => {
    expect(complexity).toMatchObject({ value: 3 - 5 + 2, inputs: { edges: 3, nodes: 5 } });
  });

  test("hierarchy depth: levels of the deepest branch", () => {
    expect(depth.value).toBe(3);
  });

  test("the direction of the links does not change the depth, and a cycle does not loop", () => {
    const reversed = modelGraph([{ modelId: "m", snapshot: { ...car, relationships: car.relationships.map((r) => ({ sourceId: r.targetId, targetId: r.sourceId })) } }]);
    expect(hierarchyDepth(reversed)).toBe(3);
    expect(hierarchyDepth({ nodes: ["a", "b"], edges: [["a", "b"], ["b", "a"]] })).toBe(2);
  });

  test("two models stay two graphs, even with the same element ids", () => {
    const graph = modelGraph([{ modelId: "m1", snapshot: car }, { modelId: "m2", snapshot: car }]);
    expect(graph.nodes).toHaveLength(10);
    expect(new Set(graph.nodes).size).toBe(10);
  });
});

describe("metrics from the answer of the Reasoning module", () => {
  const metrics = [
    definition(METRIC_IDS.numberOfProducts),
    definition(METRIC_IDS.degreeOfVariability),
    definition(METRIC_IDS.rateOfRequiredFeatures),
    definition(METRIC_IDS.configurationSpace),
    definition(METRIC_IDS.reasoningTime),
  ];

  test("computed from the figures returned, and marked simulated when the answer is", () => {
    const values = computeMetrics(metrics, {
      models: [{ modelId: "m1", snapshot: car }],
      result: { simulated: true, products: 8, coreFeatures: 2, configurations: 4, reasoningTimeMs: 120 },
    });
    expect(values.map((v) => v.value)).toEqual([8, 8 / 32, 0.4, 4, 120]);
    expect(values.every((v) => v.simulated)).toBe(true);
    expect(values[1].inputs).toEqual({ products: 8, features: 5 });
  });

  test("a real answer is not marked simulated", () => {
    const [products] = computeMetrics(metrics, { models: [{ modelId: "m1", snapshot: car }], result: { products: 8 } });
    expect(products.simulated).toBe(false);
  });

  test("a missing figure gives a reason, not a guess", () => {
    const values = computeMetrics(metrics, { models: [{ modelId: "m1", snapshot: car }], result: { products: "eight" } });
    expect(values.map((v) => v.value)).toEqual([null, null, null, null, null]);
    expect(values[0].reason).toBe("The Reasoning module did not return 'products' for this scenario.");
  });
});

describe("metrics that cannot be computed", () => {
  test("REQ metrics needing other models, domain coverage and custom metrics say why", () => {
    const [req01, coverage, custom] = computeMetrics(
      [definition("req-01", "REQ-01", "Architecture model with component dependencies"), definition(METRIC_IDS.domainCoverage), definition("custom")],
      { models: [{ modelId: "m1", snapshot: car }], result: {} }
    );
    expect(req01.reason).toBe("Needs: Architecture model with component dependencies. Not available for these models (languages targeted by REQ-01 to REQ-14: decision Q7).");
    expect(coverage.reason).toMatch(/application model linked to its domain model/);
    expect(custom.reason).toBe("Custom metrics are not computed yet (LAB-MT-02).");
  });

  test("a scenario run that did not complete lists every metric with the reason", () => {
    expect(notComputed([definition("a"), definition("b")], "cancelled")).toEqual([
      { metricId: "a", value: null, reason: "cancelled", inputs: {}, simulated: false },
      { metricId: "b", value: null, reason: "cancelled", inputs: {}, simulated: false },
    ]);
  });
});
