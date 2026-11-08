import SemanticTranslatorReasoningGateway, { UnsupportedJobError, planOf } from "./SemanticTranslatorReasoningGateway";
import { ReasoningJobRequest, ReasoningJobStatus } from "../../Domain/Reasoning/Entities/ReasoningJob";
import { computeMetrics, METRIC_IDS, MetricDefinition } from "../../Domain/Metrics/computeMetrics";
import { Body, Stub, iteration, ok, projects, selectedModel, startStub, statistics } from "../../test-support/semanticTranslatorStub";

// Contract tests against a local stand-in of /query (test-support/semanticTranslatorStub.ts): no real instance is ever called
const feature = (id: string, name: string, type = "ConcreteFeature") => ({
  id,
  name,
  type,
  properties: [{ id: `${id}-selected`, name: "Selected", type: "String", value: "Undefined", possibleValues: "Undefined,Selected,Unselected" }],
});

const SNAPSHOT = {
  id: "fm-1",
  name: "Car",
  type: "Feature model",
  elements: [feature("e-car", "Car", "RootFeature"), feature("e-gps", "GPS"), feature("e-radio", "Radio")],
  relationships: [
    { id: "r1", sourceId: "e-car", targetId: "e-gps", type: "Optional" },
    { id: "r2", sourceId: "e-car", targetId: "e-radio", type: "Optional" },
  ],
};
const SEMANTICS = { elementTypes: ["RootFeature", "ConcreteFeature"], symbolMap: {} };

const requestOf = (overrides: Partial<ReasoningJobRequest> = {}, parameters: Record<string, unknown> = {}): ReasoningJobRequest => ({
  solver: { id: "z3", version: "unpinned", parameters: { timeOut: 5, mode: "satisfiability", ...parameters } },
  models: [{ modelId: "fm-1", languageId: 1, hash: "hash-1", snapshot: SNAPSHOT, semantics: SEMANTICS }],
  operationalContext: null,
  ...overrides,
});


async function settled(gateway: SemanticTranslatorReasoningGateway, jobId: string): Promise<ReasoningJobStatus> {
  for (let i = 0; i < 500; i++) {
    const status = await gateway.status(jobId);
    if (status.state === "COMPLETED" || status.state === "FAILED") return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the job did not settle");
}

let stub: Stub | null = null;
afterEach(async () => {
  await stub?.close();
  stub = null;
});

describe("requests sent to /query (contract with semantic_translator)", () => {
  test("satisfiability: one sat, then the iteration for required features, each with the body the editor sends", async () => {
    stub = await startStub((body) => (body.data.query.iterate_over ? ok(iteration(body)) : ok(true)));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf())).jobId);

    expect(done.state).toBe("COMPLETED");
    expect(stub.received.map((body) => body.data.query)).toEqual([
      { operation: "sat", solver: "z3" },
      {
        operation: "sat",
        solver: "z3",
        iterate_over: [{ model_object: "element", relationship_element: null, object_type: ["RootFeature", "ConcreteFeature"], with_value: 0 }],
      },
    ]);
    const [first] = stub.received;
    expect(first.data.rules).toEqual(SEMANTICS);
    expect(first.data.modelSelectedId).toBe("fm-1");
    expect(selectedModel(first)).toEqual(SNAPSHOT);
    expect(typeof first.data.transactionId).toBe("string");
    expect(done.result).toMatchObject({
      simulated: false,
      gateway: "semantic_translator",
      solver: { id: "z3", version: "unpinned", target: "z3" },
      modelHashes: ["hash-1"],
      satisfiable: true,
      coreFeatures: 1,
      statistics: [statistics, statistics],
      warnings: [],
    });
    expect(done.result).not.toHaveProperty("products");
    expect(gateway.activeJobs()).toBe(0);
  });

  test("enumeration with an operational context: the context is sent as Selected and Unselected, as the editor does", async () => {
    stub = await startStub((body) => {
      const query = body.data.query;
      if (query.iterate_over) return ok(iteration(body));
      const forced = selectedModel(body).elements.some((element: any) => element.properties[0].value !== "Undefined");
      if (query.operation === "sat") return ok(true);
      // 4 products without the context; 1 configuration with GPS on and Radio off
      return forced ? ok({ id: "the-project" }) : ok(projects(4));
    });
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const request = requestOf(
      { operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "" } },
      { mode: "enumeration", maxSolutions: 100 }
    );
    const done = await settled(gateway, (await gateway.submit(request)).jobId);

    expect(done.state).toBe("COMPLETED");
    expect(stub.received.map((body) => body.data.query.operation)).toEqual(["sat", "nsolve", "nsolve", "sat"]);
    expect(stub.received[1].data.query.operation_n).toBe(100);
    const selection = (body: Body) => Object.fromEntries(selectedModel(body).elements.map((element: any) => [element.name, element.properties[0].value]));
    expect(selection(stub.received[0])).toEqual({ Car: "Undefined", GPS: "Selected", Radio: "Unselected" });
    expect(selection(stub.received[1])).toEqual({ Car: "Undefined", GPS: "Undefined", Radio: "Undefined" });
    expect(selection(stub.received[2])).toEqual({ Car: "Undefined", GPS: "Selected", Radio: "Unselected" });
    // The pinned copy itself is not changed
    expect(SNAPSHOT.elements[1].properties[0].value).toBe("Undefined");
    expect(done.result).toMatchObject({ satisfiable: true, products: 4, configurations: 1, coreFeatures: 1 });
  });

  test("a context feature named by its id is forced as one named by its name, as Ready accepts both", () => {
    const selection = (activeFeatures: string[], inactiveFeatures: string[]) => {
      const plan = planOf(requestOf({ operationalContext: { activeFeatures, inactiveFeatures, extraConstraints: "" } }));
      return Object.fromEntries((plan.contextModel!.elements ?? []).map((element) => [element.name, element.properties![0].value]));
    };

    expect(selection(["e-gps"], ["e-radio"])).toEqual({ Car: "Undefined", GPS: "Selected", Radio: "Unselected" });
    expect(selection(["e-gps"], ["e-radio"])).toEqual(selection(["GPS"], ["Radio"]));
  });

  test("the answer gives the family metrics of the run (LAB-MT-03), not marked simulated", async () => {
    stub = await startStub((body) =>
      body.data.query.iterate_over ? ok(iteration(body)) : body.data.query.operation === "nsolve" ? ok(projects(4)) : ok(true)
    );
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const request = requestOf({}, { mode: "enumeration" });
    const done = await settled(gateway, (await gateway.submit(request)).jobId);
    const metric = (id: string): MetricDefinition => ({ id, code: null, name: id, unit: null, formula: null, requires: null });
    const ids = [METRIC_IDS.numberOfProducts, METRIC_IDS.degreeOfVariability, METRIC_IDS.rateOfRequiredFeatures, METRIC_IDS.configurationSpace, METRIC_IDS.reasoningTime];
    const values = computeMetrics(ids.map(metric), { models: request.models, result: done.result });

    expect(values.map((value) => [value.value, value.simulated])).toEqual([
      [4, false],
      [0.5, false],
      [0.333333, false],
      [4, false],
      [(done.result as any).reasoningTimeMs, false],
    ]);
  });

  test("a count that reaches maxSolutions is only a lower bound, and no exact metric is built on it", async () => {
    stub = await startStub((body) =>
      body.data.query.iterate_over ? ok(iteration(body)) : body.data.query.operation === "nsolve" ? ok(projects(3)) : ok(true)
    );
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf({}, { mode: "enumeration", maxSolutions: 3 }))).jobId);

    expect(done.result).toMatchObject({ productsAtLeast: 3, configurationsAtLeast: 3 });
    expect(done.result).not.toHaveProperty("products");
    expect((done.result as any).warnings[0]).toMatch(/lower bound/);
  });

  test("nsolve answers false for a model without products, and required features are then not defined", async () => {
    stub = await startStub((body) => (body.data.query.operation === "nsolve" ? ok(false) : ok(false)));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf({}, { mode: "enumeration" }))).jobId);

    expect(stub.received.map((body) => body.data.query.operation)).toEqual(["sat", "nsolve"]);
    expect(done.result).toMatchObject({ satisfiable: false, products: 0, configurations: 0 });
    expect(done.result).not.toHaveProperty("coreFeatures");
    expect((done.result as any).warnings).toEqual(["The model has no valid configuration: required features are not defined."]);
  });

  test("with a context, satisfiability also checks the model alone before looking for required features", async () => {
    stub = await startStub((body) => {
      if (body.data.query.iterate_over) return ok(iteration(body));
      const forced = selectedModel(body).elements.some((element: any) => element.properties[0].value !== "Undefined");
      return ok(!forced);
    });
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const request = requestOf({ operationalContext: { activeFeatures: ["GPS", "Radio"], inactiveFeatures: [], extraConstraints: "" } });
    const done = await settled(gateway, (await gateway.submit(request)).jobId);

    expect(stub.received.map((body) => [body.data.query.operation, Boolean(body.data.query.iterate_over)])).toEqual([
      ["sat", false],
      ["sat", false],
      ["sat", true],
    ]);
    expect(done.result).toMatchObject({ satisfiable: false, coreFeatures: 1 });
  });

  test("a failed iteration leaves the other answers and says why", async () => {
    stub = await startStub((body) => (body.data.query.iterate_over ? { json: { data: { error: "Missing iteration value" } } } : ok(true)));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf())).jobId);

    expect(done.state).toBe("COMPLETED");
    expect(done.result).toMatchObject({ satisfiable: true });
    expect((done.result as any).warnings).toEqual(["Required features were not computed: semantic_translator: Missing iteration value"]);
  });
});

describe("failures, retries and cancellation (LAB-RUN-04, LAB-RUN-06)", () => {
  test("a solver error comes with HTTP 200: the job fails, without retry", async () => {
    stub = await startStub(() => ({ json: { data: { error: "The solver could not handle the model" }, statistics } }));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf())).jobId);

    expect(done).toMatchObject({ state: "FAILED", error: { message: "semantic_translator: The solver could not handle the model", transient: false } });
  });

  test("an unexpected exception of the translator (HTTP 500) fails without retry", async () => {
    stub = await startStub(() => ({ status: 500, text: "<h1>Internal Server Error</h1>" }));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf())).jobId);

    expect(done).toMatchObject({ state: "FAILED", error: { transient: false } });
    expect(done.error?.message).toMatch(/^semantic_translator answered HTTP 500/);
  });

  test("unavailable (HTTP 503, 429) or unreachable: the job fails as transient, so the run tries again", async () => {
    stub = await startStub(() => ({ status: 503, text: "Service Unavailable" }));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    expect(await settled(gateway, (await gateway.submit(requestOf())).jobId)).toMatchObject({
      state: "FAILED",
      error: { message: "semantic_translator is unavailable (HTTP 503).", transient: true },
    });
    await stub.close();
    stub = await startStub(() => ({ status: 429, text: "Too Many Requests" }));
    const busy = new SemanticTranslatorReasoningGateway({ url: stub.url });
    expect(await settled(busy, (await busy.submit(requestOf())).jobId)).toMatchObject({
      state: "FAILED",
      error: { message: "semantic_translator is unavailable (HTTP 429).", transient: true },
    });

    const url = stub.url;
    await stub.close();
    stub = null;
    const unreachable = new SemanticTranslatorReasoningGateway({ url });
    const done = await settled(unreachable, (await unreachable.submit(requestOf())).jobId);
    expect(done).toMatchObject({ state: "FAILED", error: { transient: true } });
    expect(done.error?.message).toMatch(/^semantic_translator could not be reached: fetch failed, ECONNREFUSED/);
  });

  // /query has no job id: when the request may have reached the translator, it may still be running it
  test.each([
    ["a proxy answers HTTP 504", { status: 504, text: "Gateway Time-out" }, /a proxy answered HTTP 504/],
    ["a proxy answers HTTP 502", { status: 502, text: "Bad Gateway" }, /a proxy answered HTTP 502/],
    ["the connection closes after the request was received", { drop: true }, /the connection failed after the request was sent/],
    ["the connection closes during the answer", { truncate: true }, /the answer was lost/],
  ])("%s: the outcome is unknown, so the job fails without retry", async (_case, answer, message) => {
    stub = await startStub(() => answer);
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf())).jobId);

    expect(done).toMatchObject({ state: "FAILED", error: { transient: false } });
    expect(done.error?.message).toMatch(message);
    expect(done.error?.message).toMatch(/it may still be running the request, so the Laboratory does not send it again\.$/);
    expect(stub.received).toHaveLength(1);
  });

  test.each([["a string", "yes"], ["null", null], ["a project", { id: "p" }]])(
    "an answer to sat that is %s is an error, not \"unsatisfiable\"",
    async (_case, content) => {
      stub = await startStub(() => ok(content));
      const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
      const done = await settled(gateway, (await gateway.submit(requestOf())).jobId);

      expect(done).toMatchObject({ state: "FAILED", error: { transient: false } });
      expect(done.error?.message).toMatch(/^semantic_translator: unexpected answer to sat: /);
    }
  );

  test("no answer within timeOut fails the job", async () => {
    stub = await startStub(() => ({ hang: true }));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const done = await settled(gateway, (await gateway.submit(requestOf({}, { timeOut: 1 }))).jobId);

    expect(done).toMatchObject({ state: "FAILED", error: { message: "semantic_translator did not answer within 1 s (timeOut).", transient: false } });
  });

  test("cancelling closes the request and forgets the job; the translator may still finish its own work", async () => {
    stub = await startStub(() => ({ hang: true }));
    const gateway = new SemanticTranslatorReasoningGateway({ url: stub.url });
    const { jobId } = await gateway.submit(requestOf());
    while (stub.received.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));

    expect((await gateway.status(jobId)).state).toBe("RUNNING");
    await gateway.cancel(jobId);
    while (stub.aborted === 0) await new Promise((resolve) => setTimeout(resolve, 5));

    expect(gateway.activeJobs()).toBe(0);
    expect(await gateway.status(jobId)).toMatchObject({ state: "FAILED", error: { message: "Unknown or cancelled job." } });
  });
});

describe("jobs the semantic translator cannot take are refused before anything is sent", () => {
  const refused = (request: ReasoningJobRequest, message: RegExp) => {
    expect(() => planOf(request)).toThrow(UnsupportedJobError);
    expect(() => planOf(request)).toThrow(message);
  };
  const model = requestOf().models[0];

  test("an unknown solver, several models, or a model without pinned semantics", () => {
    refused(requestOf({ solver: { id: "clingo", version: "1", parameters: {} } }), /no solver "clingo"; it offers minizinc, swi-prolog, z3/);
    refused(requestOf({ models: [model, { ...model, modelId: "fm-2" }] }), /one model at a time, and this scenario has 2/);
    refused(requestOf({ models: [{ ...model, semantics: null }] }), /no pinned semantics/);
  });

  test("a mode it does not offer, extra constraints, or a context feature it cannot force", () => {
    refused(requestOf({}, { mode: "optimization" }), /the mode "optimization" is not offered/);
    refused(requestOf({ operationalContext: { activeFeatures: [], inactiveFeatures: [], extraConstraints: "GPS => Radio" } }), /extra constraints/);
    refused(requestOf({ operationalContext: { activeFeatures: ["Wheels"], inactiveFeatures: [], extraConstraints: "" } }), /"Wheels" of the operational context is not in the model/);
    const bare = { ...SNAPSHOT, elements: [{ id: "e-car", name: "Car", type: "RootFeature", properties: [] }] };
    refused(requestOf({ models: [{ ...model, snapshot: bare }], operationalContext: { activeFeatures: ["Car"], inactiveFeatures: [], extraConstraints: "" } }), /no "Selected" property/);
  });

  test("submit refuses it as a permanent error, so the run fails without retry", async () => {
    const gateway = new SemanticTranslatorReasoningGateway({ url: "http://127.0.0.1:9/query" });
    await expect(gateway.submit(requestOf({}, { mode: "optimization" }))).rejects.toBeInstanceOf(UnsupportedJobError);
    expect(gateway.activeJobs()).toBe(0);
  });

  test("the catalog names the three targets, with the version left unpinned", async () => {
    const solvers = await new SemanticTranslatorReasoningGateway({ url: "http://127.0.0.1:9/query" }).listSolvers();
    expect(solvers.map((solver) => [solver.id, solver.versions])).toEqual([
      ["minizinc", ["unpinned"]],
      ["swi-prolog", ["unpinned"]],
      ["z3", ["unpinned"]],
    ]);
  });
});

describe("choice of the gateway (LAB_REASONING_GATEWAY)", () => {
  const load = () => {
    let name = "";
    jest.isolateModules(() => {
      name = require("../../Domain/Reasoning/ReasoningGateway").getReasoningGateway().name;
    });
    return name;
  };
  afterEach(() => {
    delete process.env.LAB_REASONING_GATEWAY;
    delete process.env.LAB_SEMANTIC_TRANSLATOR_URL;
  });

  test("the mock by default; the semantic translator only with its address", () => {
    expect(load()).toBe("mock");
    process.env.LAB_REASONING_GATEWAY = "semantic_translator";
    expect(load).toThrow("LAB_REASONING_GATEWAY=semantic_translator needs LAB_SEMANTIC_TRANSLATOR_URL");
    process.env.LAB_SEMANTIC_TRANSLATOR_URL = "http://127.0.0.1:9/query";
    expect(load()).toBe("semantic_translator");
  });
});
