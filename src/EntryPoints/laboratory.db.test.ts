import fs from "fs";
import path from "path";
import request from "supertest";

// The signed-in user is given by the x-test-user header.
jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: any, res: any, next: any) => {
    const id = req.header("x-test-user");
    // Same body as the real middleware for a missing token
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

const SCHEMA = Config.DB.SCHEMA;
const ALICE = "user-alice";
const BOB = "user-bob";
const MODEL_ID = "model-feature-1";
const PROJECT_ALICE = "project-alice";
const PROJECT_BOB = "project-bob";
/** Owned by Bob, shared with Alice. */
const PROJECT_SHARED = "project-shared";
const PROJECT_OF: Record<string, string> = { [ALICE]: PROJECT_ALICE, [BOB]: PROJECT_BOB };
const RADIO_MODEL_ID = "model-feature-2";

/** Requests as a user; every response is checked against openapi.json. */
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
    delete: (url: string) => send("delete", url),
  };
};

const solverConfigs = {
  minizinc: {
    version: "2.8.5",
    timeOut: 60,
    randomSeed: 42,
    mode: "satisfiability",
    variableSelection: "default",
    valueSelection: "default",
  },
};

async function createMetric(user: string, name = "Number of products") {
  const response = await as(user).post("/metrics", { name, formula: "count(products)", unit: "products" });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function createExperiment(user: string, overrides: object = {}) {
  const response = await as(user).post("/experiments", {
    name: "Solver comparison",
    description: "MiniZinc on the feature model",
    hypothesis: "MiniZinc answers in under a second",
    labels: ["fm"],
    projectId: PROJECT_OF[user],
    scenarios: [{ id: "6f1d0e8a-3d6c-4d7f-9a43-0b9e7c1a2b10", name: "MiniZinc", modelIds: [MODEL_ID], solverConfigs }],
    metrics: [],
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body;
}

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(
    fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8")
  );
  await sequelize.query(
    `INSERT INTO variamos."user" (id, "user", name, email) VALUES
       ('${ALICE}', 'alice', 'Alice', 'alice@example.org'),
       ('${BOB}', 'bob', 'Bob', 'bob@example.org')`
  );
  // LAB-RP-01: the languages of the models, whose semantics is pinned at Ready
  await sequelize.query(
    `INSERT INTO variamos.language (id, name, semantics) VALUES
     (1, 'Feature model', '{"elementTypes": ["Feature", "Bundle"], "relationTypes": ["Mandatory", "Optional"]}'),
     (2, 'Phone model', '{"elementTypes": ["Feature"]}')
     ON CONFLICT (id) DO NOTHING`
  );
  await sequelize.query(
    `INSERT INTO variamos.model (id, project_id, product_line_id, engineering_type, name, language_id, model)
     VALUES ('${MODEL_ID}', 'project-1', 'pl-1', 'domain', 'Car feature model', 1,
             '{"elements": [{"id": "root", "name": "Car"}, {"id": "e2", "name": "GPS"}], "relationships": []}'),
            ('${RADIO_MODEL_ID}', 'project-1', 'pl-1', 'domain', 'Radio feature model', 1,
             '{"elements": [{"id": "r1", "name": "Radio"}], "relationships": []}')`
  );
  await sequelize.query(
    `INSERT INTO variamos.project (id, owner_id, name) VALUES
       ('${PROJECT_ALICE}', '${ALICE}', 'Alice project'),
       ('${PROJECT_BOB}', '${BOB}', 'Bob project'),
       ('${PROJECT_SHARED}', '${BOB}', 'Shared project')`
  );
  await sequelize.query(
    `INSERT INTO variamos.user_project (user_id, project_id, role) VALUES ('${ALICE}', '${PROJECT_SHARED}', 'editor')`
  );
  expect(await migrate()).toEqual([
    "001_initial_schema.sql",
    "002_lifecycle_and_pinning.sql",
    "003_scenario_models.sql",
    "004_metric_catalog.sql",
    "005_experiment_project.sql",
    "006_runs.sql",
    "007_protect_audit_and_truncate.sql",
    "008_metric_results.sql",
    "009_reproducibility.sql",
    "010_collaboration.sql",
    "011_language_semantics.sql",
  ]);
});

afterAll(async () => {
  await sequelize.close();
});

describe("database and migrations", () => {
  test("health check reaches the database without authentication", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.gateways).toEqual({ reasoning: "mock", notifications: "mock" });
    checkContract("get", "/health", response.status, response.body);
  });

  test("migrations are applied once", async () => {
    expect(await migrate()).toEqual([]);
  });

  test("requests without a session are rejected", async () => {
    const response = await request(app).get("/experiments");
    expect(response.status).toBe(401);
    checkContract("get", "/experiments", response.status, response.body);
  });
});

describe("experiment creation and access control (LAB-EX-01, LAB-NF-05)", () => {
  test("a new experiment is a Draft owned by its creator, whatever the request says", async () => {
    const experiment = await createExperiment(ALICE, { status: "completed", isTemplate: true, version: 7 });

    expect(experiment).toMatchObject({ status: "draft", version: 1, isTemplate: false, userRole: "owner", author: "Alice" });
  });

  test("an experiment belongs to a project the user owns or that is shared with them", async () => {
    const base = { name: "Project check", metrics: [] };

    const missing = await as(ALICE).post("/experiments", base);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe("A project is required.");

    expect((await as(ALICE).post("/experiments", { ...base, projectId: "project-unknown" })).status).toBe(400);
    expect((await as(ALICE).post("/experiments", { ...base, projectId: PROJECT_BOB })).status).toBe(403);

    const shared = await as(ALICE).post("/experiments", { ...base, projectId: PROJECT_SHARED });
    expect(shared.status).toBe(201);
    expect(shared.body.projectId).toBe(PROJECT_SHARED);
  });

  test("the list of a project holds its experiments (LAB-EX-01)", async () => {
    await createExperiment(ALICE, { name: "In the shared project", projectId: PROJECT_SHARED });
    await createExperiment(ALICE, { name: "In Alice's project" });

    const response = await as(ALICE).get(`/experiments?projectId=${PROJECT_SHARED}&pageNumber=1&pageSize=50`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((e: any) => e.name)).toContain("In the shared project");
    expect(response.body.data.every((e: any) => e.projectId === PROJECT_SHARED)).toBe(true);
  });

  test("moving an experiment to a project is recorded, and needs access to that project", async () => {
    const { id } = await createExperiment(ALICE);

    expect((await as(ALICE).put(`/experiments/${id}`, { projectId: PROJECT_BOB })).status).toBe(403);

    const moved = await as(ALICE).put(`/experiments/${id}`, { projectId: PROJECT_SHARED });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ projectId: PROJECT_SHARED, version: 2 });

    const history = await as(ALICE).get(`/experiments/${id}/history`);
    expect(history.body.map((event: any) => event.eventType)).toContain("project_updated");
  });

  test("the solver configuration of each scenario is stored", async () => {
    const experiment = await createExperiment(ALICE);
    const detailed = await as(ALICE).get(`/experiments/${experiment.id}/detailed`);

    expect(detailed.body.scenarios[0]).toMatchObject({ name: "MiniZinc", solverConfigs });
    expect(detailed.body.scenarios[0].models).toHaveLength(1);
    expect(detailed.body.scenarios[0].models[0]).toMatchObject({ modelId: MODEL_ID, model: { name: "Car feature model" } });
  });

  test("a scenario sent with a single modelId, as the first interface did, is accepted", async () => {
    const experiment = await createExperiment(ALICE, {
      scenarios: [{ name: "Legacy", modelId: MODEL_ID, solverConfigs }],
    });

    expect(experiment.scenarios[0].models.map((m: any) => m.modelId)).toEqual([MODEL_ID]);
  });

  test("another user gets 403 on every route of a private experiment", async () => {
    const { id } = await createExperiment(ALICE);
    const bob = as(BOB);

    const statuses = await Promise.all([
      bob.get(`/experiments/${id}/detailed`),
      bob.get(`/experiments/${id}/history`),
      bob.get(`/experiments/${id}/version/1`),
      bob.get(`/experiments/${id}/collaborators`),
      bob.put(`/experiments/${id}`, { name: "Taken over" }),
      bob.put(`/experiments/${id}/archive`),
      bob.put(`/experiments/${id}/ready`),
      bob.post(`/experiments/${id}/copy`),
      bob.delete(`/experiments/${id}`),
    ]).then((responses) => responses.map((response) => response.status));

    expect(statuses).toEqual(Array(statuses.length).fill(403));
  });

  test("an unknown experiment is a 404", async () => {
    const response = await as(ALICE).get("/experiments/00000000-0000-4000-8000-000000000000/detailed");
    expect(response.status).toBe(404);
  });

  test("the user list holds only the user's own experiments", async () => {
    await createExperiment(BOB, { name: "Bob's experiment" });
    const response = await as(BOB).get("/experiments?pageNumber=1&pageSize=50");

    expect(response.status).toBe(200);
    expect(response.body.data.map((e: any) => e.name)).toEqual(["Bob's experiment"]);
  });
});

describe("lifecycle (LAB-EX-03, LAB-EX-07, LAB-RUN-01, LAB-R-03)", () => {
  test("Ready is refused with the list of problems until the configuration is complete", async () => {
    const { id } = await createExperiment(ALICE, {
      scenarios: [{ name: "Empty" }],
    });

    const response = await as(ALICE).put(`/experiments/${id}/ready`);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([
      "Select at least one metric.",
      "Empty: select at least one input model.",
      "Empty: add at least one solver.",
    ]);
  });

  test("Ready refuses a solver with a floating version or an invalid parameter (LAB-CF-02, LAB-R-03)", async () => {
    const metricId = await createMetric(ALICE);
    const { id } = await createExperiment(ALICE, {
      metrics: [metricId],
      scenarios: [
        {
          name: "S1",
          modelIds: [MODEL_ID],
          solverConfigs: { minizinc: { ...solverConfigs.minizinc, version: "latest", valueSelection: "random" } },
        },
      ],
    });

    const response = await as(ALICE).put(`/experiments/${id}/ready`);

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([
      'S1: MiniZinc (Gecode) must be pinned to a version (no "latest").',
      'S1: "random" is not a valid value selection for MiniZinc (Gecode).',
    ]);
  });

  test("Ready refuses an operational context naming features the models do not have (LAB-CF-04)", async () => {
    const metricId = await createMetric(ALICE);
    const { id } = await createExperiment(ALICE, {
      metrics: [metricId],
      scenarios: [
        {
          name: "S1",
          modelIds: [MODEL_ID],
          solverConfigs,
          operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "" },
        },
      ],
    });

    const response = await as(ALICE).put(`/experiments/${id}/ready`);

    expect(response.body.details).toEqual(["S1: features not found in the input models (Radio)."]);
  });

  test("every model of a scenario is pinned separately (LAB-CF-01)", async () => {
    const metricId = await createMetric(ALICE);
    const { id } = await createExperiment(ALICE, {
      metrics: [metricId],
      scenarios: [
        {
          name: "Two models",
          modelIds: [MODEL_ID, RADIO_MODEL_ID],
          solverConfigs,
          operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "" },
        },
      ],
    });

    const ready = await as(ALICE).put(`/experiments/${id}/ready`);

    expect(ready.status).toBe(200);
    const models = ready.body.scenarios[0].models;
    expect(models.map((m: any) => m.modelId)).toEqual([MODEL_ID, RADIO_MODEL_ID]);
    expect(models[0].pinned.hash).not.toBe(models[1].pinned.hash);
  });

  test("Ready pins a copy of each model; editing afterwards creates a new Draft version", async () => {
    const metricId = await createMetric(ALICE);
    const { id } = await createExperiment(ALICE, { metrics: [{ id: metricId }] });

    const ready = await as(ALICE).put(`/experiments/${id}/ready`);
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe("ready");
    expect(ready.body.scenarios[0].models[0].pinned).toMatchObject({ languageId: 1, hash: expect.stringMatching(/^[0-9a-f]{64}$/), semanticsHash: expect.stringMatching(/^[0-9a-f]{64}$/) });

    const edited = await as(ALICE).put(`/experiments/${id}`, { hypothesis: "Z3 is faster" });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ status: "draft", version: 2, hypothesis: "Z3 is faster" });
    expect(edited.body.scenarios[0].models[0].pinned).toBeUndefined();

    const history = await as(ALICE).get(`/experiments/${id}/history`);
    expect(history.body.map((h: any) => h.eventType)).toEqual(
      expect.arrayContaining(["experiment_created", "status_changed", "hypothesis_updated"])
    );
  });

  test("the status is never taken from an update request", async () => {
    const { id } = await createExperiment(ALICE);
    const response = await as(ALICE).put(`/experiments/${id}`, { name: "Renamed", status: "completed" });

    expect(response.body).toMatchObject({ status: "draft", name: "Renamed" });
  });

  test("saving without changes does not create a version", async () => {
    const created = await createExperiment(ALICE);
    const response = await as(ALICE).put(`/experiments/${created.id}`, {
      name: created.name,
      scenarios: created.scenarios,
      metrics: created.metrics,
    });

    expect(response.body.version).toBe(1);
  });
});

describe("archive, restore and deletion (LAB-EX-05, LAB-EX-06)", () => {
  test("an archived experiment cannot be edited and is restored to its previous state", async () => {
    const metricId = await createMetric(ALICE);
    const { id } = await createExperiment(ALICE, { metrics: [metricId] });
    await as(ALICE).put(`/experiments/${id}/ready`);

    expect((await as(ALICE).put(`/experiments/${id}/archive`)).body.status).toBe("archived");
    expect((await as(ALICE).put(`/experiments/${id}`, { name: "x" })).status).toBe(409);

    const archived = await as(ALICE).get("/experiments/archived");
    expect(archived.body.data.map((e: any) => e.id)).toContain(id);

    const restored = await as(ALICE).put(`/experiments/${id}/restore`);
    expect(restored.body.status).toBe("ready");
  });

  test("deletion is logical: the experiment disappears but its rows stay", async () => {
    const { id } = await createExperiment(ALICE);

    const response = await as(ALICE).delete(`/experiments/${id}`);
    expect(response.body.result).toBe("deleted");

    const list = await as(ALICE).get("/experiments?pageNumber=1&pageSize=100");
    expect(list.body.data.map((e: any) => e.id)).not.toContain(id);

    expect((await as(ALICE).get(`/experiments/${id}/detailed`)).status).toBe(404);

    const [rows] = await sequelize.query(`SELECT deleted_at FROM ${SCHEMA}.experiment WHERE id = '${id}'`);
    expect((rows as any[])[0].deleted_at).not.toBeNull();
  });
});

describe("versions (LAB-EX-04)", () => {
  test("a past version keeps its metrics and can be restored as a new version", async () => {
    const metricId = await createMetric(ALICE, "Variability degree");
    const { id } = await createExperiment(ALICE, { metrics: [{ id: metricId }] });

    await as(ALICE).put(`/experiments/${id}`, { name: "Second name", metrics: [] });

    const v1 = await as(ALICE).get(`/experiments/${id}/version/1`);
    expect(v1.status).toBe(200);
    expect(v1.body.name).toBe("Solver comparison");
    expect(v1.body.metrics.map((m: any) => m.name)).toEqual(["Variability degree"]);

    const restored = await as(ALICE).post(`/experiments/${id}/version/1/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ version: 3, name: "Solver comparison" });
    expect(restored.body.metrics.map((m: any) => m.id)).toEqual([metricId]);

    expect((await as(ALICE).get(`/experiments/${id}/version/9`)).status).toBe(404);
  });
});

describe("sharing, templates and cloning (LAB-COL-01, LAB-CF-05, LAB-EX-02)", () => {
  test("a viewer can read but not edit; an editor can edit", async () => {
    const { id } = await createExperiment(ALICE);

    expect((await as(ALICE).post(`/experiments/${id}/share`, { userEmail: "bob@example.org", role: "viewer" })).status).toBe(200);
    expect((await as(BOB).get(`/experiments/${id}/detailed`)).body.userRole).toBe("viewer");
    expect((await as(BOB).put(`/experiments/${id}`, { name: "By Bob" })).status).toBe(403);

    await as(ALICE).post(`/experiments/${id}/share`, { userEmail: "bob@example.org", role: "editor" });
    expect((await as(BOB).put(`/experiments/${id}`, { name: "By Bob" })).body.name).toBe("By Bob");

    expect((await as(ALICE).post(`/experiments/${id}/share`, { userEmail: "bob@example.org", role: "owner" })).status).toBe(400);
    expect((await as(BOB).post(`/experiments/${id}/share`, { userEmail: "alice@example.org", role: "viewer" })).status).toBe(403);
  });

  test("an experiment without metric cannot be published", async () => {
    const { id } = await createExperiment(ALICE);
    const response = await as(ALICE).post(`/experiments/${id}/publish/benchmark`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("An experiment must contain at least one metric before publishing");
  });

  test("anyone can read and clone a template; the clone records its origin", async () => {
    const metricId = await createMetric(ALICE);
    const { id } = await createExperiment(ALICE, { metrics: [metricId] });

    expect((await as(BOB).post(`/experiments/${id}/publish/template`)).status).toBe(403);
    expect((await as(ALICE).post(`/experiments/${id}/publish/template`)).body.isTemplate).toBe(true);

    expect((await as(BOB).get(`/experiments/${id}/detailed`)).status).toBe(200);

    // Bob has no access to Alice's project: he chooses the project of the copy
    const withoutProject = await as(BOB).post(`/experiments/${id}/copy`);
    expect(withoutProject.status).toBe(400);
    expect(withoutProject.body.message).toBe("Choose the project of the copy.");

    const clone = await as(BOB).post(`/experiments/${id}/copy`, { projectId: PROJECT_BOB });
    expect(clone.status).toBe(201);
    expect(clone.body).toMatchObject({
      status: "draft",
      userRole: "owner",
      isTemplate: false,
      projectId: PROJECT_BOB,
      clonedFrom: { experimentId: id, version: 1 },
    });

    const ownCopy = await as(ALICE).post(`/experiments/${id}/copy`);
    expect(ownCopy.body.projectId).toBe(PROJECT_ALICE);
    expect(clone.body.scenarios[0].solverConfigs).toEqual(solverConfigs);
  });
});

describe("cloning (LAB-EX-02)", () => {
  test("the clone keeps the whole configuration and shows its origin in the list", async () => {
    const publicMetric = (await as(ALICE).get("/metrics/public")).body.find((m: any) => m.source).id;
    const ownMetric = await createMetric(ALICE, "Own metric for cloning");
    const context = { activeFeatures: ["GPS"], inactiveFeatures: [], extraConstraints: "GPS => Car" };
    const original = await createExperiment(ALICE, {
      name: "Original to clone",
      labels: ["fm", "clone"],
      metrics: [publicMetric, ownMetric],
      scenarios: [
        { name: "One", modelIds: [MODEL_ID, RADIO_MODEL_ID], solverConfigs, operationalContext: context },
        { name: "Two", modelIds: [RADIO_MODEL_ID], solverConfigs: {} },
      ],
    });

    const clone = (await as(ALICE).post(`/experiments/${original.id}/copy`)).body;

    expect(clone).toMatchObject({
      name: "Original to clone (copy)",
      status: "draft",
      description: original.description,
      hypothesis: original.hypothesis,
      labels: ["fm", "clone"],
      projectId: PROJECT_ALICE,
      clonedFrom: { experimentId: original.id, version: 1, name: "Original to clone" },
    });
    expect(clone.metrics.map((m: any) => m.id).sort()).toEqual([publicMetric, ownMetric].sort());
    const configuration = (e: any) => e.scenarios.map((s: any) => [s.name, s.models.map((m: any) => m.modelId), s.solverConfigs, s.operationalContext ?? null]);
    expect(configuration(clone)).toEqual(configuration(original));
    expect(clone.scenarios.map((s: any) => s.id)).not.toEqual(original.scenarios.map((s: any) => s.id));

    const listed = (await as(ALICE).get("/experiments?name=Original%20to%20clone%20(copy)&pageNumber=1&pageSize=5")).body.data[0];
    expect(listed.clonedFrom).toEqual({ experimentId: original.id, version: 1, name: "Original to clone" });
  });

  test("a clone of someone else's template leaves out their private metrics", async () => {
    const publicMetric = (await as(ALICE).get("/metrics/public")).body.find((m: any) => m.source).id;
    const privateMetric = await createMetric(ALICE, "Alice private metric");
    const { id } = await createExperiment(ALICE, { metrics: [publicMetric, privateMetric] });
    await as(ALICE).post(`/experiments/${id}/publish/template`);

    const clone = (await as(BOB).post(`/experiments/${id}/copy`, { projectId: PROJECT_BOB })).body;

    expect(clone.metrics.map((m: any) => m.id)).toEqual([publicMetric]);
    expect((await as(BOB).get(`/metrics/${privateMetric}`)).status).toBe(404);
  });
});

describe("catalogs (LAB-CF-02, LAB-MT-01)", () => {
  test("the solvers come from the Reasoning gateway, with versions and parameters", async () => {
    const response = await as(ALICE).get("/catalog/solvers");

    expect(response.status).toBe(200);
    expect(response.body.map((s: any) => s.id)).toEqual(["minizinc", "swi-prolog", "z3"]);
    expect(response.body[0].parameters.map((p: any) => p.name)).toEqual(
      expect.arrayContaining(["timeOut", "randomSeed", "mode"])
    );
  });

  test("at least 10 predefined public metrics with description, formula and unit", async () => {
    const response = await as(BOB).get("/metrics/public");
    const predefined = response.body.filter((m: any) => m.source);

    expect(predefined.length).toBeGreaterThanOrEqual(10);
    predefined.forEach((metric: any) => {
      expect(metric.description).toBeTruthy();
      expect(metric.formula).toBeTruthy();
      expect(metric.unit).toBeTruthy();
    });
    expect(predefined.find((m: any) => m.code === "REQ-13")).toMatchObject({
      category: "Complexity or Maintainability",
      formulaOrigin: "spec",
    });
  });

  test("a predefined metric is read-only", async () => {
    const response = await as(ALICE).put("/metrics/6c1ab000-0000-4000-8000-000000000001", { name: "Changed" });
    expect(response.status).toBe(403);
  });
});

describe("metrics ownership (LAB-MT-01, LAB-MT-02, LAB-NF-05)", () => {
  test("the author comes from the session, not from the request", async () => {
    const response = await as(ALICE).post("/metrics", { name: "Depth", formula: "max(depth)", unit: "levels", userId: BOB });

    expect(response.body.userId).toBe(ALICE);
  });

  test("another user can neither read, change, delete nor publish a private metric", async () => {
    const metricId = await createMetric(ALICE, "Private metric");

    expect((await as(BOB).get(`/metrics/${metricId}`)).status).toBe(404);
    expect((await as(BOB).put(`/metrics/${metricId}`, { name: "Stolen" })).status).toBe(404);
    expect((await as(BOB).delete(`/metrics/${metricId}`)).status).toBe(404);
    expect((await as(BOB).post("/metrics/publish", [metricId])).status).toBe(404);
  });

  test("an experiment cannot use another user's private metric", async () => {
    const metricId = await createMetric(ALICE, "Alice only");
    const response = await as(BOB).post("/experiments", { name: "Bob", projectId: PROJECT_BOB, metrics: [metricId] });

    expect(response.status).toBe(400);
  });

  test("published metrics are public and read-only; a metric in use cannot be deleted", async () => {
    const metricId = await createMetric(ALICE, "Shared metric");
    await createExperiment(ALICE, { metrics: [metricId] });

    expect((await as(ALICE).delete(`/metrics/${metricId}`)).status).toBe(409);

    expect((await as(ALICE).post("/metrics/publish", [{ id: metricId }])).status).toBe(200);
    const publicMetrics = await as(BOB).get("/metrics/public");
    expect(publicMetrics.body.map((m: any) => m.id)).toContain(metricId);

    expect((await as(ALICE).put(`/metrics/${metricId}`, { name: "Changed" })).status).toBe(403);
  });
});
