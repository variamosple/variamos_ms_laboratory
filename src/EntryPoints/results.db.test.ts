import fs from "fs";
import path from "path";
import request from "supertest";

// The signed-in user is given by the x-test-user header (the real middleware is tested in authentication.db.test.ts).
jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    const id = req.header("x-test-user");
    if (!id) return res.status(401).json({ errorCode: 401, message: "Please log in." });
    req.user = { id };
    next();
  },
}));

import { app } from "../app";
import sequelize from "../DataProviders/dataBase/VariamosORM";
import { migrate } from "../DataProviders/dataBase/migrate";
import { Config } from "../Config";
import { checkContract } from "../test-support/contract";
import { unzip } from "../test-support/unzip";
import MockReasoningGateway, { MockReasoningOptions } from "../DataProviders/reasoning/MockReasoningGateway";
import { setReasoningGateway } from "../Domain/Reasoning/ReasoningGateway";
import { RunExecutor, setRunExecutor } from "../DataProviders/execution/RunExecutor";
import { METRIC_IDS } from "../Domain/Metrics/computeMetrics";

const SCHEMA = Config.DB.SCHEMA;
const ALICE = "user-alice";
const BOB = "user-bob";
const PROJECT = "project-alice";
const MODEL_ID = "model-car";
const REQ_01 = "6c1ab000-0000-4000-8000-000000000007";

const as = (user: string) => {
  const send = async (method: "get" | "post" | "put" | "delete", url: string, body?: object) => {
    const response = await request(app)[method](url).set("x-test-user", user).send(body);
    checkContract(method, url, response.status, response.body);
    return response;
  };
  return {
    get: (url: string) => send("get", url),
    post: (url: string, body?: object) => send("post", url, body),
    put: (url: string, body?: object) => send("put", url, body),
  };
};

const minizinc = { version: "2.8.5", timeOut: 60, randomSeed: 42, mode: "satisfiability", variableSelection: "default", valueSelection: "default" };
const z3 = { version: "4.13.0", timeOut: 30, randomSeed: 7, mode: "enumeration" };

let gateway: MockReasoningGateway;
let executor: RunExecutor;
let customMetric: string;

function useGateway(options: MockReasoningOptions = {}) {
  gateway = new MockReasoningGateway({ durationMs: 50, ...options });
  setReasoningGateway(gateway);
}

const ALL_KINDS = () => [
  METRIC_IDS.numberOfProducts, METRIC_IDS.degreeOfVariability, METRIC_IDS.rateOfRequiredFeatures,
  METRIC_IDS.configurationSpace, METRIC_IDS.reasoningTime, METRIC_IDS.domainCoverage,
  REQ_01, METRIC_IDS.orphanRate, METRIC_IDS.structuralComplexity, METRIC_IDS.hierarchyDepth, customMetric,
];

async function readyExperiment(overrides: object = {}) {
  const created = await as(ALICE).post("/experiments", {
    name: "Car metrics",
    projectId: PROJECT,
    metrics: ALL_KINDS(),
    scenarios: [{ name: "Free", modelIds: [MODEL_ID], solverConfigs: { minizinc } }],
    ...overrides,
  });
  expect(created.status).toBe(201);
  const ready = await as(ALICE).put(`/experiments/${created.body.id}/ready`);
  expect(ready.status).toBe(200);
  return ready.body;
}

async function runToEnd(experimentId: string) {
  const started = await as(ALICE).post(`/experiments/${experimentId}/runs`);
  expect(started.status).toBe(202);
  await executor.whenIdle();
  return (await as(ALICE).get(`/experiments/${experimentId}/runs/${started.body.id}`)).body;
}

const valueOf = (scenarioRun: any, metricId: string) => scenarioRun.metrics.find((m: any) => m.metricId === metricId);

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8"));
  await sequelize.query(
    `INSERT INTO variamos."user" (id, "user", name, email) VALUES ('${ALICE}', 'alice', 'Alice', 'alice@example.org'), ('${BOB}', 'bob', 'Bob', 'bob@example.org')`
  );
  await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name) VALUES ('${PROJECT}', '${ALICE}', 'Cars')`);
  // Car decomposes into GPS and Radio: 3 elements, 2 relationships, 2 levels, no orphan
  // LAB-RP-01: the languages of the models, whose semantics is pinned at Ready
  await sequelize.query(
    `INSERT INTO variamos.language (id, name, semantics) VALUES
     (1, 'Feature model', '{"elementTypes": ["Feature", "Bundle"], "relationTypes": ["Mandatory", "Optional"]}'),
     (2, 'Phone model', '{"elementTypes": ["Feature"]}')
     ON CONFLICT (id) DO NOTHING`
  );
  await sequelize.query(
    `INSERT INTO variamos.model (id, project_id, product_line_id, engineering_type, name, language_id, model)
     VALUES ('${MODEL_ID}', '${PROJECT}', 'pl-1', 'domain', 'Car feature model', 1,
             '{"elements": [{"id": "car", "name": "Car"}, {"id": "gps", "name": "GPS"}, {"id": "radio", "name": "Radio"}],
               "relationships": [{"id": "r1", "sourceId": "car", "targetId": "gps"}, {"id": "r2", "sourceId": "car", "targetId": "radio"}]}')`
  );
  await migrate();
  customMetric = (await as(ALICE).post("/metrics", { name: "Alice's custom metric", formula: "products * 2", unit: "products" })).body.id;
});

beforeEach(() => {
  useGateway();
  executor = new RunExecutor({ concurrency: 2, maxRetries: 2, retryDelayMs: 10, pollIntervalMs: 10, maxRuntimeSeconds: 30 });
  setRunExecutor(executor);
});

afterAll(async () => {
  await executor.whenIdle();
  await sequelize.close();
});

describe("LAB-MT-03 metrics computed when a scenario run ends", () => {
  test("every selected metric gets a value consistent with its inputs, or the reason it has none", async () => {
    const experiment = await readyExperiment({
      scenarios: [{
        name: "GPS on",
        modelIds: [MODEL_ID],
        solverConfigs: { minizinc },
        operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "" },
      }],
    });

    const run = await runToEnd(experiment.id);
    const scenarioRun = run.scenarioRuns[0];
    const result = scenarioRun.result;

    // Every metric of the run, in the order of the provenance
    expect(scenarioRun.metrics.map((m: any) => m.metricId)).toEqual(run.provenance.metrics.map((m: any) => m.id));
    expect(scenarioRun.metrics).toHaveLength(11);

    // From the model copy, computed by the Laboratory: not simulated
    expect(valueOf(scenarioRun, METRIC_IDS.orphanRate)).toEqual({ metricId: METRIC_IDS.orphanRate, value: 0, reason: null, inputs: { orphans: 0, elements: 3 }, simulated: false });
    expect(valueOf(scenarioRun, METRIC_IDS.structuralComplexity)).toMatchObject({ value: 1, inputs: { edges: 2, nodes: 3 }, simulated: false });
    expect(valueOf(scenarioRun, METRIC_IDS.hierarchyDepth)).toMatchObject({ value: 2, simulated: false });

    // From the answer of the Reasoning module: same figures as the stored result, marked simulated
    expect(valueOf(scenarioRun, METRIC_IDS.numberOfProducts)).toMatchObject({ value: result.products, inputs: { products: result.products }, simulated: true });
    expect(valueOf(scenarioRun, METRIC_IDS.degreeOfVariability)).toMatchObject({ value: result.products / 2 ** 3, inputs: { products: result.products, features: 3 }, simulated: true });
    expect(valueOf(scenarioRun, METRIC_IDS.rateOfRequiredFeatures).value).toBeCloseTo(result.coreFeatures / 3, 6);
    expect(valueOf(scenarioRun, METRIC_IDS.configurationSpace)).toMatchObject({ value: result.configurations, simulated: true });
    expect(valueOf(scenarioRun, METRIC_IDS.reasoningTime)).toMatchObject({ value: result.reasoningTimeMs, simulated: true });

    // Not computable, with the reason
    expect(valueOf(scenarioRun, METRIC_IDS.domainCoverage)).toMatchObject({ value: null, reason: expect.stringMatching(/application model linked to its domain model/) });
    expect(valueOf(scenarioRun, REQ_01)).toMatchObject({ value: null, reason: expect.stringMatching(/Architecture model with component dependencies.*Q7/) });
    expect(valueOf(scenarioRun, customMetric)).toMatchObject({ value: null, reason: "Custom metrics are not computed yet (LAB-MT-02)." });
  });

  test("a failed or cancelled scenario run still lists every metric, as not computed", async () => {
    useGateway({ failingSolverId: "minizinc" });
    const failedRun = await runToEnd((await readyExperiment()).id);
    expect(failedRun.scenarioRuns[0].metrics).toHaveLength(11);
    expect(failedRun.scenarioRuns[0].metrics.every((m: any) => m.value === null && m.reason.startsWith("The scenario run failed:"))).toBe(true);

    useGateway({ durationMs: 10_000 });
    const experiment = await readyExperiment();
    const started = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    const cancelled = await as(ALICE).post(`/experiments/${experiment.id}/runs/${started.body.id}/cancel`);
    expect(cancelled.body.scenarioRuns[0].metrics.map((m: any) => m.reason)).toEqual(Array(11).fill("The scenario run was cancelled."));
    await executor.whenIdle();
  });

  test("the run keeps the definition of its metrics, even if a metric changes afterwards", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);
    expect((await as(ALICE).put(`/metrics/${customMetric}`, { name: "Renamed", formula: "products * 3", unit: "products" })).status).toBe(200);

    const after = (await as(ALICE).get(`/experiments/${experiment.id}/runs/${run.id}`)).body;
    expect(after.provenance.metrics.find((m: any) => m.id === customMetric)).toMatchObject({ name: "Alice's custom metric", formula: "products * 2" });
    await as(ALICE).put(`/metrics/${customMetric}`, { name: "Alice's custom metric", formula: "products * 2", unit: "products" });
  });

  test("metric values cannot be changed or deleted (LAB-R-01)", async () => {
    const run = await runToEnd((await readyExperiment()).id);
    await expect(sequelize.query(`UPDATE ${SCHEMA}.metric_result SET value = 42 WHERE run_id = '${run.id}'`)).rejects.toThrow(/LAB-NF-06/);
    await expect(sequelize.query(`DELETE FROM ${SCHEMA}.metric_result WHERE run_id = '${run.id}'`)).rejects.toThrow(/LAB-NF-06/);
    await expect(sequelize.query(`TRUNCATE ${SCHEMA}.metric_result`)).rejects.toThrow(/cannot be emptied/);
  });
});

describe("LAB-VIS-01 progress while a scenario runs", () => {
  test("the progress reported by the Reasoning module is followed, and is 1 at the end", async () => {
    useGateway({ durationMs: 600 });
    const experiment = await readyExperiment();
    const started = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    const url = `/experiments/${experiment.id}/runs/${started.body.id}`;

    const seen: number[] = [];
    while (seen.length < 50) {
      const run = (await as(ALICE).get(url)).body;
      if (run.status === "completed") break;
      if (run.scenarioRuns[0].progress !== null) seen.push(run.scenarioRuns[0].progress);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await executor.whenIdle();

    expect(seen.some((progress) => progress > 0 && progress < 1)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect((await as(ALICE).get(url)).body.scenarioRuns[0].progress).toBe(1);
  });
});

describe("LAB-MT-04 results of several scenarios and runs", () => {
  test("one row per run, scenario run and metric; filtered by run; reserved to readers", async () => {
    const experiment = await readyExperiment({
      metrics: [METRIC_IDS.numberOfProducts, METRIC_IDS.structuralComplexity],
      scenarios: [
        { name: "Free", modelIds: [MODEL_ID], solverConfigs: { minizinc, z3 } },
        { name: "No radio", modelIds: [MODEL_ID], solverConfigs: { minizinc }, operationalContext: { activeFeatures: [], inactiveFeatures: ["Radio"], extraConstraints: "" } },
      ],
    });
    const first = await runToEnd(experiment.id);
    const second = await runToEnd(experiment.id);

    const all = (await as(ALICE).get(`/experiments/${experiment.id}/results`)).body;
    // 2 runs x 3 scenario runs x 2 metrics
    expect(all.rows).toHaveLength(12);
    expect(all.runs.map((r: any) => r.number)).toEqual([1, 2]);
    expect(all.metrics.map((m: any) => m.id).sort()).toEqual([METRIC_IDS.numberOfProducts, METRIC_IDS.structuralComplexity].sort());
    // Rows carry exactly the stored values
    const stored = second.scenarioRuns[2];
    expect(all.rows.find((row: any) => row.runId === second.id && row.scenarioRunId === stored.id && row.metricId === METRIC_IDS.numberOfProducts))
      .toMatchObject({ scenarioName: "No radio", solverId: "minizinc", runNumber: 2, value: valueOf(stored, METRIC_IDS.numberOfProducts).value, simulated: true });

    const onlyFirst = (await as(ALICE).get(`/experiments/${experiment.id}/results?runId=${first.id}`)).body;
    expect(new Set(onlyFirst.rows.map((row: any) => row.runId))).toEqual(new Set([first.id]));

    expect((await as(ALICE).get(`/experiments/${experiment.id}/results?runId=00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    expect((await as(BOB).get(`/experiments/${experiment.id}/results`)).status).toBe(403);
  });
});

describe("LAB-MT-05 export", () => {
  test("CSV, JSON and XLSX hold every result and metric of the runs", async () => {
    const experiment = await readyExperiment({
      name: 'Export, with "quotes"',
      metrics: [METRIC_IDS.numberOfProducts, METRIC_IDS.hierarchyDepth, REQ_01],
      scenarios: [{ name: "Free, all", modelIds: [MODEL_ID], solverConfigs: { minizinc, z3 } }],
    });
    const run = await runToEnd(experiment.id);
    const rows = (await as(ALICE).get(`/experiments/${experiment.id}/results`)).body.rows;
    expect(rows).toHaveLength(6);

    // JSON: the runs as the API gives them
    const json = await as(ALICE).get(`/experiments/${experiment.id}/export?format=json`);
    expect(json.headers["content-disposition"]).toMatch(/attachment; filename=".*-results\.json"/);
    expect(json.body.experiment).toMatchObject({ id: experiment.id, name: 'Export, with "quotes"' });
    expect(json.body.runs).toEqual([run]);

    // CSV: a header and one line per row, fields quoted when needed
    const csv = await request(app).get(`/experiments/${experiment.id}/export?format=csv`).set("x-test-user", ALICE);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/^text\/csv/);
    const lines = csv.text.trimEnd().split("\r\n");
    expect(lines).toHaveLength(1 + rows.length);
    expect(lines[0]).toBe("runNumber,runId,runStatus,experimentVersion,scenarioName,solverId,solverVersion,scenarioRunStatus,metricCode,metricName,unit,value,reason,simulated");
    const products = rows.find((r: any) => r.solverId === "z3" && r.metricId === METRIC_IDS.numberOfProducts);
    expect(lines).toContain(`1,${run.id},completed,1,"Free, all",z3,4.13.0,completed,,Number of products,products,${products.value},,yes`);
    expect(lines.some((line) => line.includes("REQ-01") && line.includes(',Needs: Architecture model with component dependencies.'))).toBe(true);

    // XLSX: a real Office Open XML package with the three sheets
    const xlsx = await request(app).get(`/experiments/${experiment.id}/export?format=xlsx`).set("x-test-user", ALICE).buffer(true)
      .parse((res, done) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => done(null, Buffer.concat(chunks))); });
    expect(xlsx.status).toBe(200);
    const parts = unzip(xlsx.body as Buffer);
    expect([...parts.keys()]).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]));
    expect(parts.get("xl/workbook.xml")).toMatch(/name="Metrics".*name="Scenario runs".*name="Runs"/);
    const metricsSheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(metricsSheet.match(/<row /g)).toHaveLength(1 + rows.length);
    expect(metricsSheet).toContain(`<v>${products.value}</v>`);

    expect((await request(app).get(`/experiments/${experiment.id}/export?format=pdf`).set("x-test-user", ALICE)).status).toBe(400);
  });
});

describe("LAB-MT-06 solver benchmarking", () => {
  test("success rate, response time from the execution log, retries and agreement, per solver", async () => {
    useGateway({ transientFailures: 1 });
    const experiment = await readyExperiment({
      metrics: [METRIC_IDS.numberOfProducts],
      scenarios: [
        { name: "A", modelIds: [MODEL_ID], solverConfigs: { minizinc, z3 } },
        { name: "B", modelIds: [MODEL_ID], solverConfigs: { minizinc, z3 } },
      ],
    });
    const good = await runToEnd(experiment.id);
    useGateway({ failingSolverId: "z3" });
    await runToEnd(experiment.id);

    const solvers = (await as(ALICE).get(`/experiments/${experiment.id}/benchmark`)).body;
    const [minizincStats, z3Stats] = solvers;

    expect(solvers.map((s: any) => s.solverId)).toEqual(["minizinc", "z3"]);
    expect(minizincStats).toMatchObject({ versions: ["2.8.5"], scenarioRuns: 4, completed: 4, failed: 0, successRate: 1, retries: 1 });
    expect(z3Stats).toMatchObject({ versions: ["4.13.0"], scenarioRuns: 4, completed: 2, failed: 2, successRate: 0.5, retries: 0 });
    // Agreement is measured where both solvers answered: the first run only
    expect(minizincStats).toMatchObject({ compared: 2, agreementRate: 1 });

    // Response times are those of the completed attempts in the log
    const logged = good.scenarioRuns
      .filter((s: any) => s.solverId === "z3")
      .map((s: any) => s.attemptLog.find((a: any) => a.outcome === "completed"))
      .map((a: any) => new Date(a.finishedAt).getTime() - new Date(a.startedAt).getTime());
    expect(z3Stats.responseTimeMs).toEqual({
      mean: (logged[0] + logged[1]) / 2,
      median: (logged[0] + logged[1]) / 2,
      min: Math.min(...logged),
      max: Math.max(...logged),
    });
  });
});
