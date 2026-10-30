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
import MockReasoningGateway, { MockReasoningOptions } from "../DataProviders/reasoning/MockReasoningGateway";
import MockNotificationGateway from "../DataProviders/notifications/MockNotificationGateway";
import { setReasoningGateway } from "../Domain/Reasoning/ReasoningGateway";
import { setNotificationGateway } from "../Domain/Notifications/NotificationGateway";
import { RunExecutor, RunExecutorOptions, setRunExecutor } from "../DataProviders/execution/RunExecutor";
import RunRepository from "../DataProviders/repository/Laboratory/RunRepository";

const SCHEMA = Config.DB.SCHEMA;
const ALICE = "user-alice";
const BOB = "user-bob";
const PROJECT = "project-alice";
const MODEL_ID = "model-car";

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

const minizinc = { version: "2.8.5", timeOut: 60, randomSeed: 42, mode: "satisfiability", variableSelection: "default", valueSelection: "default" };
const z3 = { version: "4.13.0", timeOut: 30, randomSeed: 7, mode: "enumeration" };

let gateway: MockReasoningGateway;
let notifications: MockNotificationGateway;
let executor: RunExecutor;
let metricId: string;

const FAST: RunExecutorOptions = { concurrency: 2, maxRetries: 2, retryDelayMs: 10, pollIntervalMs: 10, maxRuntimeSeconds: 30 };

function useGateway(options: MockReasoningOptions = {}) {
  gateway = new MockReasoningGateway({ durationMs: 50, ...options });
  setReasoningGateway(gateway);
}

function useExecutor(options: Partial<RunExecutorOptions> = {}) {
  executor = new RunExecutor({ ...FAST, ...options });
  setRunExecutor(executor);
}

/** A Ready experiment: its models are pinned. */
async function readyExperiment(overrides: object = {}) {
  const created = await as(ALICE).post("/experiments", {
    name: "Car reasoning",
    projectId: PROJECT,
    metrics: [metricId],
    scenarios: [{ name: "MiniZinc", modelIds: [MODEL_ID], solverConfigs: { minizinc } }],
    ...overrides,
  });
  expect(created.status).toBe(201);
  const ready = await as(ALICE).put(`/experiments/${created.body.id}/ready`);
  expect(ready.status).toBe(200);
  return ready.body;
}

async function runToEnd(experimentId: string, user = ALICE) {
  const started = await as(user).post(`/experiments/${experimentId}/runs`);
  expect(started.status).toBe(202);
  await executor.whenIdle();
  return (await as(user).get(`/experiments/${experimentId}/runs/${started.body.id}`)).body;
}

const statusOf = async (experimentId: string) => (await as(ALICE).get(`/experiments/${experimentId}/detailed`)).body.status;

/** Waits until the condition holds, checking every 10 ms. */
async function until(condition: () => Promise<boolean>, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > end) throw new Error("Condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8"));
  await sequelize.query(
    `INSERT INTO variamos."user" (id, "user", name, email) VALUES
       ('${ALICE}', 'alice', 'Alice', 'alice@example.org'),
       ('${BOB}', 'bob', 'Bob', 'bob@example.org')`
  );
  await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name) VALUES ('${PROJECT}', '${ALICE}', 'Cars')`);
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
             '{"elements": [{"id": "car", "name": "Car"}, {"id": "gps", "name": "GPS"}, {"id": "radio", "name": "Radio"}], "relationships": []}')`
  );
  await migrate();
  metricId = (await as(ALICE).get("/metrics/public")).body.find((metric: any) => metric.name === "Degree of variability").id;
});

beforeEach(() => {
  useGateway();
  useExecutor();
  notifications = new MockNotificationGateway();
  setNotificationGateway(notifications);
});

afterAll(async () => {
  await executor.whenIdle();
  await sequelize.close();
});

describe("LAB-RUN-01, LAB-RUN-03, LAB-EX-07: a run from start to end", () => {
  test("a Ready experiment runs in the background and completes", async () => {
    const experiment = await readyExperiment();

    const started = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ number: 1, status: "pending", startedBy: ALICE, experimentVersion: experiment.version });
    expect(await statusOf(experiment.id)).toBe("running");

    await executor.whenIdle();
    const run = (await as(ALICE).get(`/experiments/${experiment.id}/runs/${started.body.id}`)).body;

    expect(run.status).toBe("completed");
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
    expect(run.scenarioRuns).toHaveLength(1);
    expect(run.scenarioRuns[0]).toMatchObject({ status: "completed", solverId: "minizinc", solverVersion: "2.8.5", attempts: 1 });
    expect(run.scenarioRuns[0].jobId).toMatch(/^mock-/);
    expect(run.scenarioRuns[0].result).toMatchObject({ simulated: true, satisfiable: true });
    expect(await statusOf(experiment.id)).toBe("completed");

    // LAB-RUN-03: the user who started it is notified
    expect(notifications.sent).toEqual([
      expect.objectContaining({ userId: ALICE, runId: run.id, status: "completed", message: `Run #1 of "Car reasoning" completed.` }),
    ]);

    // LAB-EX-07, LAB-NF-06: every transition is in the audit log
    const events = (await as(ALICE).get(`/experiments/${experiment.id}/history`)).body.map((event: any) => [event.eventType, event.oldValue, event.newValue]);
    expect(events).toEqual(expect.arrayContaining([
      ["run_started", null, { runId: run.id, number: 1 }],
      ["status_changed", "ready", "running"],
      ["run_completed", null, { runId: run.id, number: 1 }],
      ["status_changed", "running", "completed"],
    ]));
  });

  test("the list holds the runs, newest first; a finished experiment can run again", async () => {
    const experiment = await readyExperiment();
    await runToEnd(experiment.id);
    await runToEnd(experiment.id);

    const runs = (await as(ALICE).get(`/experiments/${experiment.id}/runs`)).body;
    expect(runs.map((run: any) => [run.number, run.status])).toEqual([[2, "completed"], [1, "completed"]]);
  });

  test("a Draft cannot run; a running experiment can neither run again, be edited nor archived", async () => {
    const draft = await as(ALICE).post("/experiments", { name: "Draft", projectId: PROJECT });
    const refused = await as(ALICE).post(`/experiments/${draft.body.id}/runs`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/Mark the experiment Ready/);

    useGateway({ durationMs: 2000 });
    const experiment = await readyExperiment();
    const started = await as(ALICE).post(`/experiments/${experiment.id}/runs`);

    expect((await as(ALICE).post(`/experiments/${experiment.id}/runs`)).status).toBe(409);
    expect((await as(ALICE).put(`/experiments/${experiment.id}`, { name: "Changed" })).status).toBe(409);
    expect((await as(ALICE).put(`/experiments/${experiment.id}/archive`)).status).toBe(409);

    await as(ALICE).post(`/experiments/${experiment.id}/runs/${started.body.id}/cancel`);
    await executor.whenIdle();
  });

  test("an invalid configuration is refused before starting, with the list of problems", async () => {
    const experiment = await readyExperiment();
    // The Reasoning module no longer offers the pinned MiniZinc version
    const changed = new MockReasoningGateway({ durationMs: 50 });
    changed.listSolvers = async () =>
      (await new MockReasoningGateway().listSolvers()).map((solver) => (solver.id === "minizinc" ? { ...solver, versions: ["2.9.0"] } : solver));
    setReasoningGateway(changed);

    const refused = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe("The experiment cannot run.");
    expect(refused.body.details.join(" ")).toMatch(/2\.8\.5/);
    expect(await statusOf(experiment.id)).toBe("ready");
    expect(changed.received).toHaveLength(0);
  });

  test("a solver failure ends the run and the experiment as Failed, and notifies the user", async () => {
    useGateway({ failingSolverId: "minizinc" });
    const experiment = await readyExperiment();

    const run = await runToEnd(experiment.id);

    expect(run.status).toBe("failed");
    expect(run.failureReason).toBe("The solver could not handle the model (simulated).");
    expect(run.scenarioRuns[0].attemptLog.map((attempt: any) => attempt.outcome)).toEqual(["failed"]);
    expect(await statusOf(experiment.id)).toBe("failed");
    expect(notifications.sent[0]).toMatchObject({ status: "failed", userId: ALICE });
  });
});

describe("LAB-CF-01 to LAB-CF-04, LAB-RP-02: what a run executes", () => {
  test("the run uses the model pinned at Ready, even after the model changed", async () => {
    const experiment = await readyExperiment();
    const pinnedHash = experiment.scenarios[0].models[0].pinned.hash;

    await sequelize.query(
      `UPDATE variamos.model SET model = '{"elements": [{"id": "car", "name": "Car"}], "relationships": []}' WHERE id = '${MODEL_ID}'`
    );
    try {
      const run = await runToEnd(experiment.id);

      expect(gateway.received[0].models).toEqual([
        expect.objectContaining({ modelId: MODEL_ID, hash: pinnedHash, languageId: 1 }),
      ]);
      expect((gateway.received[0].models[0].snapshot as any).elements).toHaveLength(3);
      expect(run.scenarioRuns[0].result).toMatchObject({ features: 3, modelHashes: [pinnedHash] });
    } finally {
      await sequelize.query(
        `UPDATE variamos.model SET model = '{"elements": [{"id": "car", "name": "Car"}, {"id": "gps", "name": "GPS"}, {"id": "radio", "name": "Radio"}], "relationships": []}' WHERE id = '${MODEL_ID}'`
      );
    }
  });

  test("each solver gets exactly its pinned version and parameters", async () => {
    const experiment = await readyExperiment({
      scenarios: [{ name: "Two solvers", modelIds: [MODEL_ID], solverConfigs: { minizinc, z3 } }],
    });

    const run = await runToEnd(experiment.id);

    const { version: minizincVersion, ...minizincParameters } = minizinc;
    const { version: z3Version, ...z3Parameters } = z3;
    expect(gateway.received.map((job) => job.solver)).toEqual([
      { id: "minizinc", version: minizincVersion, parameters: minizincParameters },
      { id: "z3", version: z3Version, parameters: z3Parameters },
    ]);
    expect(run.scenarioRuns.map((scenarioRun: any) => scenarioRun.result.parameters)).toEqual([minizincParameters, z3Parameters]);
  });

  test("each scenario runs on its own, with its operational context applied", async () => {
    const experiment = await readyExperiment({
      scenarios: [
        { name: "Free", modelIds: [MODEL_ID], solverConfigs: { minizinc } },
        {
          name: "With GPS, without radio",
          modelIds: [MODEL_ID],
          solverConfigs: { minizinc },
          operationalContext: { activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "" },
        },
      ],
    });

    const run = await runToEnd(experiment.id);

    expect(run.scenarioRuns.map((s: any) => [s.scenarioName, s.status])).toEqual([["Free", "completed"], ["With GPS, without radio", "completed"]]);
    expect(new Set(run.scenarioRuns.map((s: any) => s.jobId)).size).toBe(2);
    expect(gateway.received[1].operationalContext).toEqual({ activeFeatures: ["GPS"], inactiveFeatures: ["Radio"], extraConstraints: "" });
    // The mock computes 2^(free features) from what it received: this only shows each scenario's context reached it
    expect(run.scenarioRuns.map((s: any) => s.result.configurations)).toEqual([8, 2]);
  });

  test("the provenance records what was executed, by whom and when (LAB-RP-02)", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);

    expect(run.provenance).toEqual({
      experiment: { id: experiment.id, name: "Car reasoning", version: experiment.version, projectId: PROJECT },
      startedBy: ALICE,
      laboratoryVersion: JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")).version,
      reasoning: { gateway: "mock" },
      metrics: [
        {
          id: metricId,
          code: null,
          name: "Degree of variability",
          unit: "ratio (0–1)",
          formula: "#P / 2^|F|",
          requires: "Variability model (computed by the Reasoning module)",
        },
      ],
      scenarios: [
        {
          scenarioId: experiment.scenarios[0].id,
          name: "MiniZinc",
          models: [{ modelId: MODEL_ID, languageId: 1, hash: experiment.scenarios[0].models[0].pinned.hash, pinnedAt: expect.any(String), semanticsHash: experiment.scenarios[0].models[0].pinned.semanticsHash }],
          operationalContext: null,
          solvers: [{ id: "minizinc", version: "2.8.5", parameters: { timeOut: 60, randomSeed: 42, mode: "satisfiability", variableSelection: "default", valueSelection: "default" } }],
        },
      ],
    });
    expect(run.startedAt).not.toBeNull();
    expect(run.finishedAt).not.toBeNull();
    expect(new Date(run.finishedAt).getTime()).toBeGreaterThanOrEqual(new Date(run.startedAt).getTime());
  });
});

describe("LAB-RUN-04 cancellation", () => {
  test("cancelling stops the solver job in under 5 s and records who cancelled and when", async () => {
    useGateway({ durationMs: 10_000 });
    const experiment = await readyExperiment();
    const started = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    const runUrl = `/experiments/${experiment.id}/runs/${started.body.id}`;
    await until(async () => (await as(ALICE).get(runUrl)).body.scenarioRuns[0].jobId !== null);
    expect(gateway.activeJobs()).toBe(1);

    const before = Date.now();
    const cancelled = await as(ALICE).post(`${runUrl}/cancel`);
    const elapsed = Date.now() - before;

    expect(cancelled.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
    expect(cancelled.body).toMatchObject({ status: "cancelled", cancelledBy: ALICE, cancelledByName: "Alice", startedByName: "Alice" });
    expect(cancelled.body.cancelledAt).not.toBeNull();
    expect(cancelled.body.scenarioRuns[0].status).toBe("cancelled");
    // The solver resources are released
    expect(gateway.activeJobs()).toBe(0);
    expect(await statusOf(experiment.id)).toBe("cancelled");

    await executor.whenIdle();
    const run = (await as(ALICE).get(runUrl)).body;
    expect(run.status).toBe("cancelled");
    expect(run.scenarioRuns[0].attemptLog.map((attempt: any) => attempt.outcome)).toEqual(["cancelled"]);
    expect((await as(ALICE).post(`${runUrl}/cancel`)).status).toBe(409);
    expect(notifications.sent).toEqual([]);
  });
});

describe("LAB-RUN-04 cancellation when the Reasoning module misbehaves", () => {
  test.each([
    ["refuses", async () => { throw new Error("connection refused"); }],
    ["never answers", () => new Promise<void>(() => undefined)],
  ])("the run is cancelled in under 5 s even if the Reasoning module %s", async (_, cancel) => {
    useGateway({ durationMs: 10_000 });
    gateway.cancel = cancel as any;
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const experiment = await readyExperiment();
    const started = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    const runUrl = `/experiments/${experiment.id}/runs/${started.body.id}`;
    await until(async () => (await as(ALICE).get(runUrl)).body.scenarioRuns[0].jobId !== null);

    const before = Date.now();
    const cancelled = await as(ALICE).post(`${runUrl}/cancel`);

    expect(Date.now() - before).toBeLessThan(5000);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    expect(await statusOf(experiment.id)).toBe("cancelled");
    await executor.whenIdle();
    jest.restoreAllMocks();
  });
});

describe("LAB-RUN-06 automatic retries", () => {
  test("a status request that times out: the job is stopped, then submitted again", async () => {
    useGateway({ transientStatusFailures: 1 });
    const experiment = await readyExperiment();

    const run = await runToEnd(experiment.id);

    expect(run.status).toBe("completed");
    expect(run.scenarioRuns[0].attemptLog.map((attempt: any) => attempt.outcome)).toEqual(["transient_error", "completed"]);
    expect(gateway.received).toHaveLength(2);
    // No job left running in the Reasoning module
    expect(gateway.activeJobs()).toBe(0);
  });

  test("a transient failure is retried, and every attempt is logged", async () => {
    useGateway({ transientFailures: 2 });
    const experiment = await readyExperiment();

    const run = await runToEnd(experiment.id);

    expect(run.status).toBe("completed");
    expect(run.scenarioRuns[0].attempts).toBe(3);
    expect(run.scenarioRuns[0].attemptLog.map((attempt: any) => [attempt.attempt, attempt.outcome, attempt.error])).toEqual([
      [1, "transient_error", "Solver temporarily unavailable (simulated)."],
      [2, "transient_error", "Solver temporarily unavailable (simulated)."],
      [3, "completed", null],
    ]);
  });

  test("after the configured number of retries, the run fails", async () => {
    useGateway({ transientFailures: 10 });
    useExecutor({ maxRetries: 1 });
    const experiment = await readyExperiment();

    const run = await runToEnd(experiment.id);

    expect(run.status).toBe("failed");
    expect(run.scenarioRuns[0].attemptLog.map((attempt: any) => attempt.outcome)).toEqual(["transient_error", "transient_error"]);
    expect(run.failureReason).toBe("Solver temporarily unavailable (simulated). (gave up after 2 attempts)");
  });
});

describe("LAB-R-05 runtime limit", () => {
  test("a scenario run longer than the limit ends as Failed (resource limit) and releases the solver", async () => {
    useGateway({ durationMs: 5000 });
    useExecutor({ maxRuntimeSeconds: 0.2 });
    const experiment = await readyExperiment();

    const run = await runToEnd(experiment.id);

    expect(run.status).toBe("failed");
    expect(run.failureReason).toBe("Failed (resource limit): the solver ran longer than 0.2 s.");
    expect(run.scenarioRuns[0].attemptLog.map((attempt: any) => attempt.outcome)).toEqual(["resource_limit"]);
    expect(gateway.activeJobs()).toBe(0);
  });
});

describe("LAB-R-01 integrity of finished runs", () => {
  test("the database refuses to change or delete the data of a finished run", async () => {
    const experiment = await readyExperiment();
    const run = await runToEnd(experiment.id);

    await expect(sequelize.query(`UPDATE ${SCHEMA}.run SET status = 'failed' WHERE id = '${run.id}'`)).rejects.toThrow(/LAB-R-01/);
    await expect(sequelize.query(`DELETE FROM ${SCHEMA}.run WHERE id = '${run.id}'`)).rejects.toThrow(/LAB-R-01/);
    await expect(sequelize.query(`UPDATE ${SCHEMA}.scenario_run SET result = '{}' WHERE run_id = '${run.id}'`)).rejects.toThrow(/LAB-R-01/);
    await expect(sequelize.query(`UPDATE ${SCHEMA}.run_attempt SET outcome = 'failed'`)).rejects.toThrow(/LAB-R-01/);
    await expect(sequelize.query(`DELETE FROM ${SCHEMA}.model_snapshot`)).rejects.toThrow(/LAB-R-01/);
    for (const table of ["run", "scenario_run", "run_attempt", "model_snapshot", "experiment_history", "experiment_version"]) {
      await expect(sequelize.query(`TRUNCATE ${SCHEMA}.${table} CASCADE`)).rejects.toThrow(/cannot be emptied/);
    }
    // The audit log and the version the run executed (LAB-NF-06, LAB-RP-02)
    await expect(sequelize.query(`UPDATE ${SCHEMA}.experiment_history SET event_type = 'x' WHERE experiment_id = '${experiment.id}'`)).rejects.toThrow(/LAB-NF-06/);
    await expect(sequelize.query(`DELETE FROM ${SCHEMA}.experiment_history WHERE experiment_id = '${experiment.id}'`)).rejects.toThrow(/LAB-NF-06/);
    await expect(sequelize.query(`UPDATE ${SCHEMA}.experiment_version SET config = '{}' WHERE experiment_id = '${experiment.id}'`)).rejects.toThrow(/LAB-NF-06/);

    const after = (await as(ALICE).get(`/experiments/${experiment.id}/runs/${run.id}`)).body;
    expect(after).toEqual(run);
  });
});

describe("LAB-EX-05, LAB-COL-01: deletion and execute permission", () => {
  test("an experiment with a completed run is archived instead of deleted", async () => {
    const experiment = await readyExperiment();
    await runToEnd(experiment.id);
    // Editing creates a new Draft version: the status alone no longer says it ran
    await as(ALICE).put(`/experiments/${experiment.id}`, { name: "Second version" });
    expect(await statusOf(experiment.id)).toBe("draft");

    const deleted = await as(ALICE).delete(`/experiments/${experiment.id}`);

    expect(deleted.body.result).toBe("archived");
    expect(await statusOf(experiment.id)).toBe("archived");
  });

  test("a viewer cannot start or cancel a run; an editor can", async () => {
    useGateway({ durationMs: 10_000 });
    const experiment = await readyExperiment();
    await as(ALICE).post(`/experiments/${experiment.id}/share`, { userEmail: "bob@example.org", role: "viewer" });

    expect((await as(BOB).post(`/experiments/${experiment.id}/runs`)).status).toBe(403);
    const aliceRun = await as(ALICE).post(`/experiments/${experiment.id}/runs`);
    expect((await as(BOB).get(`/experiments/${experiment.id}/runs`)).status).toBe(200);
    expect((await as(BOB).post(`/experiments/${experiment.id}/runs/${aliceRun.body.id}/cancel`)).status).toBe(403);
    expect((await as(ALICE).get(`/experiments/${experiment.id}/runs/${aliceRun.body.id}`)).body.status).not.toBe("cancelled");
    expect((await as(ALICE).post(`/experiments/${experiment.id}/runs/${aliceRun.body.id}/cancel`)).status).toBe(200);
    await executor.whenIdle();
    useGateway();

    await as(ALICE).post(`/experiments/${experiment.id}/share`, { userEmail: "bob@example.org", role: "editor" });
    const run = await runToEnd(experiment.id, BOB);
    expect(run).toMatchObject({ status: "completed", startedBy: BOB });
  });
});

describe("LAB-EX-05, LAB-EX-06: deleting an archived experiment", () => {
  test("with a completed run it is refused, and restoring still returns its state", async () => {
    const experiment = await readyExperiment();
    await runToEnd(experiment.id);
    await as(ALICE).put(`/experiments/${experiment.id}/archive`);

    const refused = await as(ALICE).delete(`/experiments/${experiment.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/stays archived/);

    expect((await as(ALICE).put(`/experiments/${experiment.id}/restore`)).body.status).toBe("completed");
  });
});

describe("restart", () => {
  test("runs left unfinished by a stopped service are marked failed at start-up", async () => {
    const experiment = await readyExperiment();
    // Started, but no executor picks it up: as if the service stopped
    const run = await new RunRepository().startRun(experiment.id, ALICE);

    expect(await new RunRepository().failInterruptedRuns()).toBe(1);

    const after = (await as(ALICE).get(`/experiments/${experiment.id}/runs/${run.id}`)).body;
    expect(after).toMatchObject({ status: "failed", failureReason: "Interrupted: the Laboratory service stopped during the run." });
    expect(await statusOf(experiment.id)).toBe("failed");
  });
});
