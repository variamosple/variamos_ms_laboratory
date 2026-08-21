import request from "supertest";

jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

import { app } from "../app";
import ExperimentRepository from "../DataProviders/repository/Laboratory/ExperimentRepository";

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
        pageNumber: "2",
        pageSize: "10",
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
      .mockResolvedValue(null);

    const response = await request(app).get("/experiments/missing/detailed");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Experiment not found" });
  });
});