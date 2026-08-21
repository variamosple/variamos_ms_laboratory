import ExperimentRepository from "./ExperimentRepository";
import { OrmExperiment } from "../../../Domain/Laboratory/Entities/Experiment";
import { OrmExperimentUser, ExperimentRoleEnum } from "../../../Domain/Laboratory/Entities/ExperimentUser";
import { ExperimentDetailed } from "../../../Domain/Laboratory/Entities/Experiment";
import { ExperimentFilter } from "../../../Domain/Laboratory/Entities/ExperimentFilter";
import { RequestModel } from "../../../Domain/Core/Entities/RequestModel";

describe("ExperimentRepository", () => {
  let repository: ExperimentRepository;

  beforeEach(() => {
    repository = new ExperimentRepository();
    jest.restoreAllMocks();
  });

  test("rejects experiments without a name before opening a transaction", async () => {
    const experiment = { name: "   " } as ExperimentDetailed;

    await expect(repository.saveExperiment(experiment, "user-1"))
      .rejects.toThrow("Experiment name is required.");
  });

  test("builds owner filters and maps paged results", async () => {
    const row = {
      id: "experiment-1",
      name: "Trial",
      version: 1,
      labels: ["demo"],
      status: "draft",
      isTemplate: false,
      isBenchmark: false,
      description: "Description",
      hypothesis: "Hypothesis",
      users: [{ userId: "user-1", role: ExperimentRoleEnum.OWNER }],
    };
    const findAndCountAll = jest.spyOn(OrmExperiment, "findAndCountAll")
      .mockResolvedValue({ count: 1, rows: [row] } as any);
    const request = new RequestModel(
      "tx-1",
      new ExperimentFilter("user-1", "Trial", 2, 10)
    );

    const response = await repository.getUserExperiments(request);

    expect(response.transactionId).toBe("tx-1");
    expect(response.totalCount).toBe(1);
    expect(response.data?.[0]).toMatchObject({
      id: "experiment-1",
      name: "Trial",
      userRole: ExperimentRoleEnum.OWNER,
    });
    expect(findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: expect.anything(), name: expect.anything() }),
      limit: 10,
      offset: 10,
      order: [["name", "ASC"]],
    }));
  });

  test("returns an error response when paged queries fail", async () => {
    jest.spyOn(OrmExperiment, "findAndCountAll").mockRejectedValue(new Error("database error"));
    const request = new RequestModel("tx-2", new ExperimentFilter("user-1"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await repository.getUserExperiments(request);

    expect(response.errorCode).toBe(500);
    expect(response.message).toBe("Internal Server Error");
  });

  test("does not publish an experiment without a scenario", async () => {
    jest.spyOn(OrmExperimentUser, "findOne").mockResolvedValue({} as any);
    jest.spyOn(OrmExperiment, "findByPk").mockResolvedValue({ scenarios: [], metrics: [] } as any);

    await expect(repository.publishAsTemplate("experiment-1", "user-1"))
      .rejects.toThrow("An experiment must contain at least one scenario before publishing");
  });

  test("does not publish an experiment without a metric", async () => {
    jest.spyOn(OrmExperimentUser, "findOne").mockResolvedValue({} as any);
    jest.spyOn(OrmExperiment, "findByPk").mockResolvedValue({ scenarios: [{}], metrics: [] } as any);

    await expect(repository.publishAsBenchmark("experiment-1", "user-1"))
      .rejects.toThrow("An experiment must contain at least one metric before publishing");
  });
});