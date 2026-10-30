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
import MockReasoningGateway from "../DataProviders/reasoning/MockReasoningGateway";
import MockNotificationGateway from "../DataProviders/notifications/MockNotificationGateway";
import { setReasoningGateway } from "../Domain/Reasoning/ReasoningGateway";
import { setNotificationGateway } from "../Domain/Notifications/NotificationGateway";
import { RunExecutor, setRunExecutor } from "../DataProviders/execution/RunExecutor";
import { METRIC_IDS } from "../Domain/Metrics/computeMetrics";

const SCHEMA = Config.DB.SCHEMA;
const ALICE = "user-alice";
const BOB = "user-bob";
const CAROL = "user-carol";
const DAN = "user-dan";
const PROJECT = "project-shared";
const MODEL_ID = "model-car";

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

const z3 = { version: "4.13.0", timeOut: 30, randomSeed: 7, mode: "enumeration" };
let executor: RunExecutor;
let notifications: MockNotificationGateway;

async function experiment(owner = ALICE, overrides: object = {}) {
  const created = await as(owner).post("/experiments", {
    name: "Shared work",
    projectId: PROJECT,
    metrics: [METRIC_IDS.numberOfProducts],
    scenarios: [{ name: "Car", modelIds: [MODEL_ID], solverConfigs: { z3 } }],
    ...overrides,
  });
  expect(created.status).toBe(201);
  return created.body;
}

const share = (experimentId: string, email: string, permissions: object) =>
  as(ALICE).post(`/experiments/${experimentId}/share`, { userEmail: email, permissions });

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8"));
  await sequelize.query(`INSERT INTO variamos."user" (id, "user", name, email) VALUES
    ('${ALICE}', 'alice', 'Alice', 'alice@example.org'), ('${BOB}', 'bob', 'Bob', 'bob@example.org'),
    ('${CAROL}', 'carol', 'Carol', 'carol@example.org'), ('${DAN}', 'dan', 'Dan', 'dan@example.org')`);
  await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name) VALUES ('${PROJECT}', '${ALICE}', 'Shared')`);
  await sequelize.query(`INSERT INTO variamos.user_project (user_id, project_id, role) VALUES ('${BOB}', '${PROJECT}', 'editor'), ('${CAROL}', '${PROJECT}', 'editor')`);
  // LAB-RP-01: the languages of the models, whose semantics is pinned at Ready
  await sequelize.query(
    `INSERT INTO variamos.language (id, name, semantics) VALUES
     (1, 'Feature model', '{"elementTypes": ["Feature", "Bundle"], "relationTypes": ["Mandatory", "Optional"]}'),
     (2, 'Phone model', '{"elementTypes": ["Feature"]}')
     ON CONFLICT (id) DO NOTHING`
  );
  await sequelize.query(`INSERT INTO variamos.model (id, project_id, product_line_id, engineering_type, name, language_id, model)
    VALUES ('${MODEL_ID}', '${PROJECT}', 'pl', 'domain', 'Car', 1, '{"elements": [{"id": "car", "name": "Car"}], "relationships": []}')`);
  await migrate();
});

beforeEach(() => {
  setReasoningGateway(new MockReasoningGateway({ durationMs: 30 }));
  executor = new RunExecutor({ concurrency: 2, maxRetries: 2, retryDelayMs: 10, pollIntervalMs: 10, maxRuntimeSeconds: 30 });
  setRunExecutor(executor);
  notifications = new MockNotificationGateway();
  setNotificationGateway(notifications);
});

afterAll(async () => {
  await executor.whenIdle();
  await sequelize.close();
});

describe("LAB-COL-01 read, write and execute given separately", () => {
  test.each([
    ["read only", { write: false, execute: false }],
    ["read and execute", { write: false, execute: true }],
    ["read and write", { write: true, execute: false }],
    ["read, write and execute", { write: true, execute: true }],
  ])("%s: each action is allowed or refused accordingly", async (_, permissions) => {
    const { id } = await experiment();
    expect((await share(id, "bob@example.org", permissions)).status).toBe(200);
    const bob = as(BOB);
    const ok = (allowed: boolean) => (allowed ? expect.not.stringMatching(/^403$/) : "403");

    // Read: always
    const detailed = await bob.get(`/experiments/${id}/detailed`);
    expect(detailed.status).toBe(200);
    expect(detailed.body.permissions).toEqual({ read: true, ...permissions, manage: false });
    expect((await bob.get(`/experiments/${id}/runs`)).status).toBe(200);

    // Write: edit and mark Ready
    expect(String((await bob.put(`/experiments/${id}`, { description: "Bob was here" })).status)).toEqual(ok(permissions.write));
    expect(String((await bob.put(`/experiments/${id}/ready`)).status)).toEqual(ok(permissions.write));
    if (!permissions.write) await as(ALICE).put(`/experiments/${id}/ready`);

    // Execute: start and cancel runs
    const started = await bob.post(`/experiments/${id}/runs`);
    expect(String(started.status)).toEqual(ok(permissions.execute));
    if (permissions.execute) await executor.whenIdle();

    // Manage: never for a shared user
    expect((await bob.put(`/experiments/${id}/archive`)).status).toBe(403);
    expect((await bob.post(`/experiments/${id}/share`, { userEmail: "carol@example.org", permissions: { write: true } })).status).toBe(403);
    expect((await bob.delete(`/experiments/${id}`)).status).toBe(403);

    // The collaborators list shows what was given
    const collaborators = (await as(ALICE).get(`/experiments/${id}/collaborators`)).body;
    expect(collaborators.find((c: any) => c.id === BOB)).toMatchObject({ role: permissions.write ? "editor" : "viewer", permissions: { read: true, ...permissions, manage: false } });
  });

  test("a run can only be cancelled with execute", async () => {
    setReasoningGateway(new MockReasoningGateway({ durationMs: 10_000 }));
    const { id } = await experiment();
    await as(ALICE).put(`/experiments/${id}/ready`);
    await share(id, "bob@example.org", { write: true, execute: false });
    const run = (await as(ALICE).post(`/experiments/${id}/runs`)).body;

    expect((await as(BOB).post(`/experiments/${id}/runs/${run.id}/cancel`)).status).toBe(403);
    await share(id, "bob@example.org", { write: true, execute: true });
    expect((await as(BOB).post(`/experiments/${id}/runs/${run.id}/cancel`)).status).toBe(200);
    await executor.whenIdle();
  });

  test("the former roles still work: editor writes and executes, viewer reads", async () => {
    const { id } = await experiment();
    await as(ALICE).post(`/experiments/${id}/share`, { userEmail: "bob@example.org", role: "editor" });
    await as(ALICE).post(`/experiments/${id}/share`, { userEmail: "carol@example.org", role: "viewer" });
    expect((await as(BOB).get(`/experiments/${id}/detailed`)).body.permissions).toEqual({ read: true, write: true, execute: true, manage: false });
    expect((await as(CAROL).get(`/experiments/${id}/detailed`)).body.permissions).toEqual({ read: true, write: false, execute: false, manage: false });
    expect((await as(ALICE).post(`/experiments/${id}/share`, { userEmail: "dan@example.org" })).status).toBe(400);
  });
});

describe("platform data as the Administration module keeps it", () => {
  test("a deleted project cannot hold new experiments; a deleted or disabled account cannot be given access", async () => {
    await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name, is_deleted) VALUES ('project-gone', '${ALICE}', 'Gone', TRUE)`);
    const refused = await as(ALICE).post("/experiments", { name: "In a deleted project", projectId: "project-gone" });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe("Unknown project.");

    await sequelize.query(`INSERT INTO variamos."user" (id, "user", name, email, is_enabled, is_deleted) VALUES
      ('user-off', 'off', 'Off', 'off@example.org', FALSE, FALSE), ('user-gone', 'gone', 'Gone', 'gone@example.org', TRUE, TRUE)`);
    const { id } = await experiment();
    expect((await share(id, "off@example.org", { write: true, execute: true })).status).toBe(404);
    expect((await share(id, "gone@example.org", { write: true, execute: true })).status).toBe(404);
  });
});

describe("LAB-COL-02 editing at the same time", () => {
  test("two saves from the same version at once: one is kept, the other is told what changed", async () => {
    const { id, version } = await experiment();
    await share(id, "bob@example.org", { write: true, execute: false });

    const [alice, bob] = await Promise.all([
      as(ALICE).put(`/experiments/${id}`, { expectedVersion: version, name: "Alice's name" }),
      as(BOB).put(`/experiments/${id}`, { expectedVersion: version, hypothesis: "Bob's hypothesis" }),
    ]);

    const statuses = [alice.status, bob.status].sort();
    expect(statuses).toEqual([200, 409]);
    const [kept, refused, winner] = alice.status === 200 ? [alice, bob, "Alice"] : [bob, alice, "Bob"];
    expect(kept.body.version).toBe(version + 1);
    expect(refused.body.message).toBe(`Someone saved version ${version + 1} while you were editing version ${version}.`);
    expect(refused.body.details[0]).toMatch(new RegExp(`^Version ${version + 1} by ${winner}: `));

    // Nothing was lost: one version more, with the change that was kept
    const now = (await as(ALICE).get(`/experiments/${id}/detailed`)).body;
    expect(now.version).toBe(version + 1);

    // Saving again from the new version works
    const retry = await as(winner === "Alice" ? BOB : ALICE).put(`/experiments/${id}`, { expectedVersion: version + 1, description: "after the conflict" });
    expect(retry.status).toBe(200);
    expect(retry.body.version).toBe(version + 2);
  });

  test("ten saves at once without expectedVersion are made one after the other", async () => {
    const { id, version } = await experiment();
    const saves = await Promise.all(Array.from({ length: 10 }, (_, i) => as(ALICE).put(`/experiments/${id}`, { description: `Save ${i}` })));
    expect(saves.map((s) => s.status)).toEqual(Array(10).fill(200));
    expect((await as(ALICE).get(`/experiments/${id}/detailed`)).body.version).toBe(version + 10);
  });

  test("the other collaborators are notified of a change, the author is not", async () => {
    const { id } = await experiment();
    await share(id, "bob@example.org", { write: true, execute: true });
    await share(id, "carol@example.org", { write: false, execute: false });

    await as(BOB).put(`/experiments/${id}`, { name: "Renamed by Bob" });

    expect(notifications.changes).toEqual([
      expect.objectContaining({
        experimentId: id,
        version: 2,
        changedBy: "Bob",
        userIds: expect.arrayContaining([ALICE, CAROL]),
        changes: ['name changed from "Shared work" to "Renamed by Bob"'],
      }),
    ]);
    expect(notifications.changes[0].userIds).not.toContain(BOB);
  });
});

describe("LAB-COL-03 comments and annotations", () => {
  test("on the experiment, a scenario, a run and a result metric; visible to everyone with access", async () => {
    const exp = await experiment();
    const scenarioId = exp.scenarios[0].id;
    await as(ALICE).put(`/experiments/${exp.id}/ready`);
    const run = (await as(ALICE).post(`/experiments/${exp.id}/runs`)).body;
    await executor.whenIdle();
    const scenarioRunId = run.scenarioRuns[0].id;
    await share(exp.id, "carol@example.org", { write: false, execute: false });

    const post = (user: string, body: object) => as(user).post(`/experiments/${exp.id}/comments`, body);
    expect((await post(ALICE, { targetType: "experiment", targetId: exp.id, body: "Why Z3 only?" })).status).toBe(201);
    expect((await post(CAROL, { targetType: "scenario", targetId: scenarioId, body: "Add GPS forced on" })).status).toBe(201);
    expect((await post(ALICE, { targetType: "run", targetId: run.id, body: "Baseline run" })).status).toBe(201);
    const annotation = await post(CAROL, { targetType: "scenario_run", targetId: scenarioRunId, metricId: METRIC_IDS.numberOfProducts, body: "Matches the paper" });
    expect(annotation.status).toBe(201);

    const comments = (await as(CAROL).get(`/experiments/${exp.id}/comments`)).body;
    expect(comments.map((c: any) => [c.targetType, c.targetId, c.targetLabel, c.authorName, c.body])).toEqual([
      ["experiment", exp.id, "Experiment", "Alice", "Why Z3 only?"],
      ["scenario", scenarioId, "Scenario Car", "Carol", "Add GPS forced on"],
      ["run", run.id, "Run 1", "Alice", "Baseline run"],
      ["scenario_run", scenarioRunId, "Run 1 · Car · z3 · Number of products", "Carol", "Matches the paper"],
    ]);
    expect(comments[3].metricId).toBe(METRIC_IDS.numberOfProducts);

    // Not visible without access; elements must belong to the experiment
    expect((await as(DAN).get(`/experiments/${exp.id}/comments`)).status).toBe(403);
    const other = await experiment(ALICE, { name: "Other" });
    expect((await post(ALICE, { targetType: "scenario", targetId: other.scenarios[0].id, body: "wrong place" })).status).toBe(400);
    expect((await post(ALICE, { targetType: "run", targetId: exp.id, body: "not a run" })).status).toBe(400);
    expect((await post(ALICE, { targetType: "experiment", targetId: exp.id, body: "   " })).status).toBe(400);
    expect((await post(ALICE, { targetType: "experiment", targetId: exp.id, metricId: METRIC_IDS.numberOfProducts, body: "x" })).status).toBe(400);
  });

  test("the author edits; the author, the owner and the director delete; a deleted comment keeps its place", async () => {
    const { id } = await experiment();
    await share(id, "bob@example.org", { write: true, execute: true });
    await share(id, "carol@example.org", { write: false, execute: false });
    const bobs = (await as(BOB).post(`/experiments/${id}/comments`, { targetType: "experiment", targetId: id, body: "First" })).body;

    const edited = await as(BOB).put(`/experiments/${id}/comments/${bobs.id}`, { body: "First, edited" });
    expect(edited.body).toMatchObject({ body: "First, edited", deleted: false });
    expect(edited.body.editedAt).not.toBeNull();
    expect((await as(ALICE).put(`/experiments/${id}/comments/${bobs.id}`, { body: "Not mine" })).status).toBe(403);
    expect((await as(CAROL).delete(`/experiments/${id}/comments/${bobs.id}`)).status).toBe(403);

    // The owner moderates
    expect((await as(ALICE).delete(`/experiments/${id}/comments/${bobs.id}`)).body).toMatchObject({ deleted: true, body: null });
    const [listed] = (await as(BOB).get(`/experiments/${id}/comments`)).body;
    expect(listed).toMatchObject({ id: bobs.id, deleted: true, body: null, authorName: "Bob" });
  });

  test("a comment on a scenario removed later keeps its label", async () => {
    const exp = await experiment();
    await as(ALICE).post(`/experiments/${exp.id}/comments`, { targetType: "scenario", targetId: exp.scenarios[0].id, body: "On Car" });
    await as(ALICE).put(`/experiments/${exp.id}`, { scenarios: [{ name: "Truck", modelIds: [MODEL_ID], solverConfigs: { z3 } }] });
    const [comment] = (await as(ALICE).get(`/experiments/${exp.id}/comments`)).body;
    expect(comment).toMatchObject({ targetLabel: "Scenario Car", body: "On Car" });
  });
});

describe("LAB-COL-04 consolidated view and filters", () => {
  test("the director sees every experiment of the researchers they direct, filtered by researcher, project, status, date and type", async () => {
    // The director role comes with research groups (decision Q2): given here directly
    const a1 = await experiment(ALICE, { name: "Alice one" });
    const a2 = await experiment(ALICE, { name: "Alice two" });
    await as(ALICE).put(`/experiments/${a2.id}/ready`);
    const b1 = await experiment(BOB, { name: "Bob one" });
    await as(BOB).post(`/experiments/${b1.id}/publish/template`);
    const notDirected = await experiment(BOB, { name: "Bob alone" });
    for (const e of [a1, a2, b1]) {
      await sequelize.query(`INSERT INTO ${SCHEMA}.experiment_user (experiment_id, user_id, role, can_write, can_execute) VALUES ('${e.id}', '${DAN}', 'director', TRUE, TRUE)`);
    }
    const names = async (query = "") =>
      (await as(DAN).get(`/experiments/groups?pageNumber=1&pageSize=50${query}`)).body.data.map((e: any) => e.name).sort();

    expect(await names()).toEqual(["Alice one", "Alice two", "Bob one"]);
    expect(await names()).not.toContain(notDirected.name);
    expect(await names("&researcher=bob")).toEqual(["Bob one"]);
    expect(await names("&researcher=alice%40example")).toEqual(["Alice one", "Alice two"]);
    expect(await names("&status=ready")).toEqual(["Alice two"]);
    expect(await names("&type=template")).toEqual(["Bob one"]);
    expect(await names("&type=experiment")).toEqual(["Alice one", "Alice two"]);
    expect(await names(`&projectId=${PROJECT}`)).toHaveLength(3);
    const today = new Date().toISOString().slice(0, 10);
    expect(await names(`&createdFrom=${today}&createdTo=${today}`)).toHaveLength(3);
    expect(await names("&createdTo=2000-01-01")).toEqual([]);

    const list = (await as(DAN).get("/experiments/groups?pageNumber=1&pageSize=50")).body.data;
    expect(list.find((e: any) => e.name === "Bob one")).toMatchObject({ ownerName: "Bob", userRole: "director", permissions: { manage: true } });
  });
});
