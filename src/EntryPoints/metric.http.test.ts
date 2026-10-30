import request from "supertest";

jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

import { app } from "../app";
import MetricRepository from "../DataProviders/repository/Laboratory/MetricRepository";
import { NotFoundError } from "../Domain/Core/Entities/Errors";

describe("HTTP /metrics", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET /metrics/public returns public metrics", async () => {
    const metrics = [{ id: "metric-1", name: "Accuracy", userId: null }];
    const getPublicMetrics = jest
      .spyOn(MetricRepository.prototype, "getPublicMetrics")
      .mockResolvedValue(metrics as any);

    const response = await request(app).get("/metrics/public");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(metrics);
    expect(getPublicMetrics).toHaveBeenCalledTimes(1);
  });

  test("POST /metrics creates a metric from JSON and returns 201", async () => {
    const metric = {
      id: "metric-1",
      name: "Accuracy",
      formula: "correct / total",
      unit: "%",
      script: "return accuracy",
    };
    const createMetric = jest
      .spyOn(MetricRepository.prototype, "createMetric")
      .mockResolvedValue(metric as any);

    const response = await request(app)
      .post("/metrics")
      .send(metric)
      .set("Content-Type", "application/json");

    expect(response.status).toBe(201);
    expect(response.body).toEqual(metric);
    expect(createMetric).toHaveBeenCalledWith(metric, "user-1");
  });

  test("GET /metrics/:id returns 404 when the metric does not exist", async () => {
    jest
      .spyOn(MetricRepository.prototype, "getMetricById")
      .mockRejectedValue(new NotFoundError("Metric not found."));

    const response = await request(app).get("/metrics/missing");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Metric not found.");
  });

  test("DELETE /metrics/:id returns 204 after deletion", async () => {
    const deleteMetric = jest
      .spyOn(MetricRepository.prototype, "deleteMetric")
      .mockResolvedValue(undefined);

    const response = await request(app).delete("/metrics/metric-1");

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(deleteMetric).toHaveBeenCalledWith("metric-1", "user-1");
  });

  test("POST /metrics/publish accepts ids or metrics and passes the user", async () => {
    const publishMetrics = jest
      .spyOn(MetricRepository.prototype, "publishMetrics")
      .mockResolvedValue(undefined);

    const response = await request(app).post("/metrics/publish").send(["metric-1", { id: "metric-2" }]);

    expect(response.status).toBe(200);
    expect(publishMetrics).toHaveBeenCalledWith(["metric-1", "metric-2"], "user-1");
  });
});
