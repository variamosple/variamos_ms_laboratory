import request from "supertest";

jest.mock("@variamosple/variamos-security", () => ({
  hasPermissions: () => (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

import { app } from "../app";
import ExperimentRepository from "../DataProviders/repository/Laboratory/ExperimentRepository";
import { ConflictError, ForbiddenError, NotFoundError } from "../Domain/Core/Entities/Errors";

describe("HTTP /experiments", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET /experiments forwards authenticated user and query parameters", async () => {
    const responseBody = {
      transactionId: "getUserExperiments",
      totalCount: 1,
      data: [{ id: "experiment-1", name: "Trial" }],
    };
    const getUserExperiments = jest
      .spyOn(ExperimentRepository.prototype, "getUserExperiments")
      .mockResolvedValue(responseBody as any);

    const response = await request(app)
      .get("/experiments")
      .query({ name: "trial", pageNumber: "2", pageSize: "10" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(responseBody);
    expect(getUserExperiments).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: "getUserExperiments",
      data: expect.objectContaining({
        userId: "user-1",
        name: "trial",
        pageNumber: 2,
        pageSize: 10,
      }),
    }));
  });

  test("POST /experiments parses JSON and returns 201", async () => {
    const experiment = {
      id: "experiment-1",
      name: "Trial",
      version: 1,
      labels: [],
      status: "draft",
      isTemplate: false,
      isBenchmark: false,
      scenarios: [],
      metrics: [],
    };
    const saveExperiment = jest
      .spyOn(ExperimentRepository.prototype, "saveExperiment")
      .mockResolvedValue(experiment as any);

    const response = await request(app)
      .post("/experiments")
      .send(experiment)
      .set("Content-Type", "application/json");

    expect(response.status).toBe(201);
    expect(response.body).toEqual(experiment);
    expect(saveExperiment).toHaveBeenCalledWith(experiment, "user-1");
  });

  test("GET /experiments/:id/detailed returns 404 when absent", async () => {
    jest
      .spyOn(ExperimentRepository.prototype, "getExperimentDetailed")
      .mockRejectedValue(new NotFoundError());

    const response = await request(app).get("/experiments/missing/detailed");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      transactionId: "getExperimentDetailed",
      errorCode: 404,
      message: "Experiment not found.",
    });
  });

  test("a permission refusal is a 403 and a state conflict a 409", async () => {
    jest
      .spyOn(ExperimentRepository.prototype, "updateExperiment")
      .mockRejectedValueOnce(new ForbiddenError())
      .mockRejectedValueOnce(new ConflictError("An archived experiment cannot be edited. Restore it first."));

    expect((await request(app).put("/experiments/experiment-1").send({ name: "x" })).status).toBe(403);
    const conflict = await request(app).put("/experiments/experiment-1").send({ name: "x" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.message).toBe("An archived experiment cannot be edited. Restore it first.");
  });

  test("an unexpected error is a 500 without its details", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest
      .spyOn(ExperimentRepository.prototype, "archiveExperiment")
      .mockRejectedValue(new Error("connection refused at 10.0.0.3"));

    const response = await request(app).put("/experiments/experiment-1/archive");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("10.0.0.3");
  });

  test("PUT /experiments/:id/ready calls the Ready transition for the user", async () => {
    const markReady = jest
      .spyOn(ExperimentRepository.prototype, "markReady")
      .mockResolvedValue({ id: "experiment-1", status: "ready" } as any);

    const response = await request(app).put("/experiments/experiment-1/ready");

    expect(response.status).toBe(200);
    expect(markReady).toHaveBeenCalledWith("experiment-1", "user-1");
  });
});