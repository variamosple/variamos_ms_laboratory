import fs from "fs";
import path from "path";
import request from "supertest";

// The signed-in user is given by the x-test-user header (the real middleware is tested in authentication.db.test.ts).
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: any, res: any, next: any) => {
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
import { unzip, zip } from "../Domain/Results/zip";
import { modelHash, sha256Hex } from "../Domain/Core/canonicalJson";
import { isPersistentId } from "../Domain/Results/persistentId";
import MockReasoningGateway, { MockReasoningOptions } from "../DataProviders/reasoning/MockReasoningGateway";
import { setReasoningGateway } from "../Domain/Reasoning/ReasoningGateway";
import { RunExecutor, setRunExecutor } from "../DataProviders/execution/RunExecutor";
import { METRIC_IDS } from "../Domain/Metrics/computeMetrics";

const SCHEMA = Config.DB.SCHEMA;
const ALICE = "user-alice";
const BOB = "user-bob";
const PROJECT = "project-alice";
const OTHER_PROJECT = "project-alice-2";
const CAR = "model-car";
const PHONE = "model-phone";
// Keys deliberately not in alphabetical order: the pinned hash must not depend on it
const CAR_MODEL = '{"relationships": [{"sourceId": "car", "targetId": "gps"}], "elements": [{"name": "Car", "id": "car"}, {"name": "GPS", "id": "gps"}]}';

const as = (user: string) => {
  const send = async (method: "get" | "post" | "put", url: string, body?: object) => {
    const response = await request(app)[method](url).set("x-test-user", user).send(body);
    checkContract(method, url, response.status, response.body);
    return response;
  };
  return { get: (url: string) => send("get", url), post: (url: string, body?: object) => send("post", url, body), put: (url: string, body?: object) => send("put", url, body) };
};

/** A binary response as a Buffer. */
const download = (url: string, user = ALICE) =>
  request(app).get(url).set("x-test-user", user).buffer(true)
    .parse((res, done) => { const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => done(null, Buffer.concat(chunks))); });

const upload = async (file: Buffer, projectId = OTHER_PROJECT, user = ALICE) => {
  const response = await request(app).post(`/reproductions?projectId=${projectId}`).set("x-test-user", user).set("Content-Type", "application/zip").send(file);
  checkContract("post", "/reproductions", response.status, response.body);
  return response;
};

const minizinc = { version: "2.8.5", timeOut: 60, randomSeed: 42, mode: "satisfiability", variableSelection: "default", valueSelection: "default" };
const z3 = { version: "4.13.0", timeOut: 30, randomSeed: 7, mode: "enumeration" };
const METRICS = [METRIC_IDS.numberOfProducts, METRIC_IDS.configurationSpace, METRIC_IDS.reasoningTime, METRIC_IDS.structuralComplexity, METRIC_IDS.hierarchyDepth];

let gateway: MockReasoningGateway;
let executor: RunExecutor;

function useGateway(options: MockReasoningOptions = {}) {
  gateway = new MockReasoningGateway({ durationMs: 30, ...options });
  setReasoningGateway(gateway);
}

async function readyExperiment(overrides: object = {}) {
  const created = await as(ALICE).post("/experiments", {
    name: "Car and phone",
    projectId: PROJECT,
    metrics: METRICS,
    scenarios: [
      { name: "Car", modelIds: [CAR], solverConfigs: { minizinc, z3 } },
      { name: "Phone, GPS on", modelIds: [PHONE], solverConfigs: { z3 }, operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "" } },
    ],
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

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8"));
  await sequelize.query(`INSERT INTO variamos."user" (id, "user", name, email) VALUES ('${ALICE}', 'alice', 'Alice', 'alice@example.org'), ('${BOB}', 'bob', 'Bob', 'bob@example.org')`);
  await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name) VALUES ('${PROJECT}', '${ALICE}', 'Cars'), ('${OTHER_PROJECT}', '${ALICE}', 'Replications')`);
  // LAB-RP-01: the languages of the models, whose semantics is pinned at Ready
  await sequelize.query(
    `INSERT INTO variamos.language (id, name, semantics) VALUES
     (1, 'Feature model', '{"elementTypes": ["Feature", "Bundle"], "relationTypes": ["Mandatory", "Optional"]}'),
     (2, 'Phone model', '{"elementTypes": ["Feature"]}')
     ON CONFLICT (id) DO NOTHING`
  );
  await sequelize.query(
    `INSERT INTO variamos.model (id, project_id, product_line_id, engineering_type, name, language_id, model) VALUES
     ('${CAR}', '${PROJECT}', 'pl-1', 'domain', 'Car', 1, '${CAR_MODEL}'),
     ('${PHONE}', '${PROJECT}', 'pl-1', 'domain', 'Phone', 2, '{"elements": [{"id": "phone", "name": "Phone"}, {"id": "gps", "name": "GPS"}, {"id": "cam", "name": "Camera"}], "relationships": [{"sourceId": "phone", "targetId": "gps"}, {"sourceId": "phone", "targetId": "cam"}]}')`
  );
  await migrate();
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

describe("LAB-RP-03 persistent identifier", () => {
  test("a completed run gets one, stable, resolvable by readers only; a failed run gets none", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);

    expect(isPersistentId(run.persistentId)).toBe(true);
    const again = (await as(ALICE).get(`/experiments/${experiment.id}/runs/${run.id}`)).body;
    expect(again.persistentId).toBe(run.persistentId);

    const resolved = await as(ALICE).get(`/runs/${run.persistentId}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ persistentId: run.persistentId, runId: run.id, runNumber: 1, experimentId: experiment.id, experimentName: "Car and phone", status: "completed" });
    expect((await as(BOB).get(`/runs/${run.persistentId}`)).status).toBe(403);
    expect((await as(ALICE).get("/runs/VLAB-0000-0000-0000-0000")).status).toBe(404);
    expect((await as(ALICE).get("/runs/not-an-id")).status).toBe(404);

    // Never changed afterwards (LAB-R-01)
    await expect(sequelize.query(`UPDATE ${SCHEMA}.run SET persistent_id = 'VLAB-X' WHERE id = '${run.id}'`)).rejects.toThrow(/LAB-R-01/);

    useGateway({ failingSolverId: "z3" });
    const failed = await runToEnd(experiment.id);
    expect(failed.status).toBe("failed");
    expect(failed.persistentId).toBeNull();
  });
});

describe("LAB-RP-01 reproducibility package", () => {
  test("generated at completion, with every listed part, and always the same bytes", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);

    // Generated when the run completed, before anyone asked for it
    const [[stored]] = await sequelize.query(`SELECT sha256 FROM ${SCHEMA}.run_package WHERE run_id = '${run.id}'`) as any;
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);

    const response = await download(`/experiments/${experiment.id}/runs/${run.id}/package`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="${run.persistentId}.zip"`);
    const file = response.body as Buffer;
    expect(sha256Hex(file)).toBe(stored.sha256);
    expect(response.headers["x-content-sha256"]).toBe(stored.sha256);

    const parts = unzip(file);
    const manifest = JSON.parse(parts.get("manifest.json")!);
    expect(manifest).toMatchObject({
      format: "variamos-laboratory-package/1",
      persistentId: run.persistentId,
      experiment: { id: experiment.id, name: "Car and phone", version: experiment.version, projectId: PROJECT },
      run: { id: run.id, number: 1, status: "completed", startedBy: "Alice" },
      reasoning: { gateway: "mock", simulated: true },
      solvers: expect.arrayContaining([{ id: "minizinc", version: "2.8.5" }, { id: "z3", version: "4.13.0" }]),
    });
    // Nothing left unsaid about the semantics: every model has it
    expect(manifest.limitations.join(" ")).not.toMatch(/semantics/i);
    // Every file is listed with its hash
    for (const { path: file, sha256 } of manifest.files) expect(sha256Hex(parts.get(file)!)).toBe(sha256);
    expect(manifest.files.map((f: any) => f.path).sort()).toEqual([...parts.keys()].filter((p) => p !== "manifest.json").sort());

    // Exact models: the pinned copies, checkable by their hash
    for (const model of manifest.models) {
      expect(modelHash(JSON.parse(parts.get(model.file)!))).toBe(model.hash);
    }
    expect(manifest.models.map((m: any) => m.hash).sort()).toEqual(experiment.scenarios.flatMap((s: any) => s.models.map((m: any) => m.pinned.hash)).sort());

    // Exact semantics of the language of each model, checkable by its hash
    for (const model of manifest.models) {
      expect(model.semanticsFile).toBe(`semantics/${model.semanticsHash}.json`);
      expect(modelHash(JSON.parse(parts.get(model.semanticsFile)!))).toBe(model.semanticsHash);
    }
    expect(JSON.parse(parts.get(manifest.models.find((m: any) => m.languageId === 2).semanticsFile)!)).toEqual({ elementTypes: ["Feature"] });
    expect(parts.get("README.md")).toMatch(/semantics\//);

    // Complete setup, results and metrics, instructions
    const configuration = JSON.parse(parts.get("configuration.json")!);
    expect(configuration.scenarios[1]).toMatchObject({ name: "Phone, GPS on", operationalContext: { activeFeatures: ["GPS"] }, solvers: [{ id: "z3", version: "4.13.0", parameters: { timeOut: 30, randomSeed: 7, mode: "enumeration" } }] });
    expect(configuration.metrics).toHaveLength(METRICS.length);
    expect(JSON.parse(parts.get("results/run.json")!)).toEqual(run);
    expect(parts.get("results/metrics.csv")!.trimEnd().split("\r\n")).toHaveLength(1 + 3 * METRICS.length);
    expect(parts.get("README.md")).toMatch(/Reproduce from a package/);

    // Same bytes on every download
    expect(sha256Hex((await download(`/experiments/${experiment.id}/runs/${run.id}/package`)).body as Buffer)).toBe(stored.sha256);
    // The stored package cannot be replaced
    await expect(sequelize.query(`UPDATE ${SCHEMA}.run_package SET sha256 = 'x' WHERE run_id = '${run.id}'`)).rejects.toThrow(/LAB-NF-06/);
    expect((await download(`/experiments/${experiment.id}/runs/${run.id}/package`, BOB)).status).toBe(403);
  });

  test("only a completed run has a package", async () => {
    useGateway({ failingSolverId: "minizinc" });
    const experiment = await readyExperiment();
    const failed = await runToEnd(experiment.id);
    expect((await download(`/experiments/${experiment.id}/runs/${failed.id}/package`)).status).toBe(409);
  });

  test("re-running from the package gives equivalent results, even after the models changed", async () => {
    const experiment = await readyExperiment();
    const original = await runToEnd(experiment.id);
    const file = (await download(`/experiments/${experiment.id}/runs/${original.id}/package`)).body as Buffer;

    // The live models change and one disappears: the package does not depend on them
    await sequelize.query(`UPDATE variamos.model SET model = '{"elements": [], "relationships": []}' WHERE id = '${CAR}'`);
    await sequelize.query(`UPDATE variamos.model SET is_deleted = TRUE WHERE id = '${PHONE}'`);
    try {
      const reproduced = await upload(file);
      expect(reproduced.status).toBe(201);
      const copy = reproduced.body.experiment;
      expect(copy).toMatchObject({ status: "ready", projectId: OTHER_PROJECT, reproducedFrom: original.persistentId, name: `Car and phone (reproduction of ${original.persistentId})` });
      expect(reproduced.body.metricsLeftOut).toEqual([]);

      const again = await runToEnd(copy.id);
      expect(again.status).toBe("completed");
      // Same models, solvers, parameters and contexts were sent
      expect(again.provenance.scenarios.map((s: any) => [s.name, s.models.map((m: any) => m.hash), s.solvers, s.operationalContext]))
        .toEqual(original.provenance.scenarios.map((s: any) => [s.name, s.models.map((m: any) => m.hash), s.solvers, s.operationalContext]));

      const comparison = (await as(ALICE).get(`/runs/compare?runId=${original.persistentId}&runId=${again.id}`)).body;
      expect(comparison.equivalent).toBe(true);
      expect(comparison.differences.configuration).toEqual([]);
      // Only timings differ
      expect(comparison.differences.results.every((p: string) => /reasoningTimeMs|Reasoning time/.test(p))).toBe(true);
    } finally {
      await sequelize.query(`UPDATE variamos.model SET model = '${CAR_MODEL}' WHERE id = '${CAR}'`);
      await sequelize.query(`UPDATE variamos.model SET is_deleted = FALSE WHERE id = '${PHONE}'`);
    }
  });

  test("the semantics a run used is the one pinned at Ready, and a reproduction keeps it", async () => {
    const experiment = await readyExperiment();
    const before = experiment.scenarios[0].models[0].pinned.semanticsHash;
    const [[language]] = (await sequelize.query("SELECT semantics FROM variamos.language WHERE id = 1")) as any;
    expect(before).toBe(modelHash(language.semantics));

    // The Languages module changes the semantics after Ready: the run does not see it
    await sequelize.query(`UPDATE variamos.language SET semantics = '{"elementTypes": ["Feature"], "relationTypes": ["Requires"]}' WHERE id = 1`);
    try {
      const original = await runToEnd(experiment.id);
      expect(original.provenance.scenarios[0].models[0].semanticsHash).toBe(before);
      const [[kept]] = (await sequelize.query(`SELECT snapshot FROM ${SCHEMA}.semantics_snapshot WHERE hash = '${before}'`)) as any;
      expect(kept.snapshot).toEqual(language.semantics);
      // Never changed afterwards (LAB-R-01)
      await expect(sequelize.query(`UPDATE ${SCHEMA}.semantics_snapshot SET snapshot = '{}' WHERE hash = '${before}'`)).rejects.toThrow(/LAB-R-01/);
      await expect(sequelize.query(`DELETE FROM ${SCHEMA}.semantics_snapshot WHERE hash = '${before}'`)).rejects.toThrow(/LAB-R-01/);
      await expect(sequelize.query(`TRUNCATE ${SCHEMA}.semantics_snapshot CASCADE`)).rejects.toThrow(/LAB-R-01/);

      // Reproduced today, it runs on the semantics of the package, not on today's
      const file = (await download(`/experiments/${experiment.id}/runs/${original.id}/package`)).body as Buffer;
      const copy = (await upload(file)).body.experiment;
      expect(copy.scenarios[0].models[0].pinned.semanticsHash).toBe(before);
      // The copy holds the semantics of the package itself, as on a Laboratory that never saw it
      const [[pinnedCopy]] = (await sequelize.query(`SELECT semantics_snapshot FROM ${SCHEMA}.scenario_model WHERE scenario_id = '${copy.scenarios[0].id}'`)) as any;
      expect(pinnedCopy.semantics_snapshot).toEqual(language.semantics);
      const again = await runToEnd(copy.id);
      expect(again.provenance.scenarios.map((s: any) => s.models.map((m: any) => m.semanticsHash)))
        .toEqual(original.provenance.scenarios.map((s: any) => s.models.map((m: any) => m.semanticsHash)));

      // An experiment marked Ready now takes the new semantics
      const later = await readyExperiment();
      expect(later.scenarios[0].models[0].pinned.semanticsHash).not.toBe(before);
    } finally {
      await sequelize.query(`UPDATE variamos.language SET semantics = '${JSON.stringify(language.semantics)}' WHERE id = 1`);
    }
  });

  test("a model whose language does not exist cannot be marked Ready", async () => {
    await sequelize.query(
      `INSERT INTO variamos.model (id, project_id, product_line_id, engineering_type, name, language_id, model)
       VALUES ('model-orphan', '${PROJECT}', 'pl-1', 'domain', 'Orphan', 99, '{"elements": [{"id": "o", "name": "O"}], "relationships": []}')`
    );
    const created = await as(ALICE).post("/experiments", {
      name: "Orphan language",
      projectId: PROJECT,
      metrics: METRICS,
      scenarios: [{ name: "One", modelIds: ["model-orphan"], solverConfigs: { z3 } }, { name: "Two", modelIds: [CAR], solverConfigs: { z3 } }],
    });
    const ready = await as(ALICE).put(`/experiments/${created.body.id}/ready`);
    expect(ready.status).toBe(400);
    expect(ready.body.details).toEqual(["The language 99 of the model Orphan does not exist."]);
  });

  test("a package made before the semantics was kept is refused, with the reason", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);
    const parts = unzip((await download(`/experiments/${experiment.id}/runs/${run.id}/package`)).body as Buffer);
    const manifest = JSON.parse(parts.get("manifest.json")!);
    const old = { ...manifest, models: manifest.models.map(({ semanticsHash, semanticsFile, ...model }: any) => model) };
    const encoder = new TextEncoder();
    const file = Buffer.from(zip([...parts.entries()].map(([p, text]) => ({ path: p, data: encoder.encode(p === "manifest.json" ? JSON.stringify(old) : text) }))));
    const refused = await upload(file);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/before the Laboratory kept the semantics/);
  });

  test("an altered or foreign file is refused", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);
    const parts = unzip((await download(`/experiments/${experiment.id}/runs/${run.id}/package`)).body as Buffer);

    const encoder = new TextEncoder();
    const rebuild = (changes: Record<string, string>) =>
      Buffer.from(zip([...parts.entries()].map(([p, text]) => ({ path: p, data: encoder.encode(changes[p] ?? text) }))));

    const manifest = JSON.parse(parts.get("manifest.json")!);
    const modelFile = manifest.models[0].file;
    const altered = await upload(rebuild({ [modelFile]: parts.get(modelFile)!.replace("GPS", "Radio") }));
    expect(altered.status).toBe(400);
    expect(altered.body.message).toBe(`Invalid package: ${modelFile} was changed: its SHA-256 does not match the manifest.`);

    // Changing the manifest as well does not help: the model no longer matches its hash
    const forgedText = parts.get(modelFile)!.replace("GPS", "Radio");
    const forgedManifest = { ...manifest, files: manifest.files.map((f: any) => (f.path === modelFile ? { ...f, sha256: sha256Hex(forgedText) } : f)) };
    const forged = await upload(rebuild({ [modelFile]: forgedText, "manifest.json": JSON.stringify(forgedManifest) }));
    expect(forged.status).toBe(400);
    expect(forged.body.message).toMatch(/does not match its hash/);

    // The same for the semantics of a language
    const semanticsFile = manifest.models[0].semanticsFile;
    const forgedSemantics = parts.get(semanticsFile)!.replace("Feature", "Mandatory");
    const forgedSemanticsManifest = { ...manifest, files: manifest.files.map((f: any) => (f.path === semanticsFile ? { ...f, sha256: sha256Hex(forgedSemantics) } : f)) };
    const semanticsForged = await upload(rebuild({ [semanticsFile]: forgedSemantics, "manifest.json": JSON.stringify(forgedSemanticsManifest) }));
    expect(semanticsForged.status).toBe(400);
    expect(semanticsForged.body.message).toMatch(/semantics of the model .* does not match its hash/);

    expect((await upload(Buffer.from("not a zip"))).status).toBe(400);
    // Reproducing into a project the user cannot use
    expect((await upload(rebuild({}), PROJECT, BOB)).status).toBe(403);
  });
});

describe("LAB-NF-03 reproducibility suite", () => {
  test("20 experiments re-run from their packages: all equivalent", async () => {
    const contexts = [null, { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "" }, { activeFeatures: [], inactiveFeatures: ["Camera"], extraConstraints: "" }];
    let equivalent = 0;
    for (let i = 0; i < 20; i++) {
      const experiment = await readyExperiment({
        name: `Suite ${i + 1}`,
        scenarios: [{ name: `S${i}`, modelIds: [i % 2 ? PHONE : CAR], solverConfigs: i % 3 ? { z3: { ...z3, randomSeed: i } } : { minizinc }, operationalContext: i % 2 ? contexts[i % 3] : null }],
      });
      const original = await runToEnd(experiment.id);
      const file = (await download(`/experiments/${experiment.id}/runs/${original.id}/package`)).body as Buffer;
      const copy = (await upload(file)).body.experiment;
      const again = await runToEnd(copy.id);
      const comparison = (await as(ALICE).get(`/runs/compare?runId=${original.id}&runId=${again.id}`)).body;
      if (comparison.equivalent) equivalent++;
    }
    expect(equivalent / 20).toBeGreaterThanOrEqual(0.99);
    // 40 runs
  }, 120_000);
});

describe("LAB-RP-04 runs side by side", () => {
  test("two experiments: the differences in setup and results are listed", async () => {
    const first = await readyExperiment({ name: "First", scenarios: [{ name: "Car", modelIds: [CAR], solverConfigs: { z3 } }] });
    const second = await readyExperiment({
      name: "Second",
      scenarios: [{ name: "Car", modelIds: [CAR], solverConfigs: { z3: { ...z3, timeOut: 90 } }, operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "" } }],
    });
    const a = await runToEnd(first.id);
    const b = await runToEnd(second.id);

    const comparison = (await as(ALICE).get(`/runs/compare?runId=${a.persistentId}&runId=${b.persistentId}`)).body;
    expect(comparison.runs.map((r: any) => [r.experiment.name, r.persistentId])).toEqual([["First", a.persistentId], ["Second", b.persistentId]]);
    expect(comparison.differences.configuration).toEqual(expect.arrayContaining(["scenarios/Car/solvers/z3/parameters/timeOut", "scenarios/Car/operationalContext"]));
    expect(comparison.differences.results).toContain("Car/z3/result/configurations");
    expect(comparison.equivalent).toBe(false);

    expect((await as(ALICE).get(`/runs/compare?runId=${a.id}`)).status).toBe(400);
    expect((await as(BOB).get(`/runs/compare?runId=${a.id}&runId=${b.id}`)).status).toBe(403);
  });
});
