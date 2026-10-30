import ExperimentUseCase from "./ExperimentUseCase";
import { ExperimentRoleEnum } from "./Entities/ExperimentUser";

const mockRepository = {
  getUserExperiments: jest.fn(),
  getGroupExperiments: jest.fn(),
  getSharedExperiments: jest.fn(),
  getTemplateExperiments: jest.fn(),
  getTemplateBenchmarks: jest.fn(),
  getArchivedExperiments: jest.fn(),
  saveExperiment: jest.fn(),
  getExperimentDetailed: jest.fn(),
  updateExperiment: jest.fn(),
  deleteExperiment: jest.fn(),
  archiveExperiment: jest.fn(),
  restoreExperiment: jest.fn(),
  shareExperiment: jest.fn(),
  copyExperiment: jest.fn(),
  publishAsTemplate: jest.fn(),
  publishAsBenchmark: jest.fn(),
  getExperimentHistory: jest.fn(),
  getExperimentVersion: jest.fn(),
  restoreExperimentVersion: jest.fn(),
  markReady: jest.fn(),
  getCollaborators: jest.fn(),
  removeCollaborator: jest.fn(),
};

jest.mock("../../DataProviders/repository/Laboratory/ExperimentRepository", () =>
  jest.fn().mockImplementation(() => mockRepository)
);

describe("ExperimentUseCase", () => {
  let useCase: ExperimentUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ExperimentUseCase();
  });

  test("delegates experiment listing to the repository", async () => {
    const request = { transactionId: "tx-1", data: { userId: "user-1" } } as any;
    const response = { data: [] };
    mockRepository.getUserExperiments.mockResolvedValue(response);

    await expect(useCase.getUserExperiments(request)).resolves.toBe(response);
    expect(mockRepository.getUserExperiments).toHaveBeenCalledWith(request);
  });

  test("delegates create, update, and delete operations", async () => {
    const experiment = { id: "experiment-1" } as any;
    mockRepository.saveExperiment.mockResolvedValue(experiment);
    mockRepository.updateExperiment.mockResolvedValue(experiment);
    mockRepository.deleteExperiment.mockResolvedValue("deleted");

    await expect(useCase.saveExperiment(experiment, "user-1")).resolves.toBe(experiment);
    await expect(useCase.updateExperiment(experiment, "user-1")).resolves.toBe(experiment);
    await expect(useCase.deleteExperiment("experiment-1", "user-1")).resolves.toBe("deleted");

    expect(mockRepository.saveExperiment).toHaveBeenCalledWith(experiment, "user-1");
    expect(mockRepository.updateExperiment).toHaveBeenCalledWith(experiment, "user-1");
    expect(mockRepository.deleteExperiment).toHaveBeenCalledWith("experiment-1", "user-1");
  });

  test("delegates version reading and restoring with the user", async () => {
    const version = { id: "experiment-1", version: 2 } as any;
    mockRepository.getExperimentVersion.mockResolvedValue(version);
    mockRepository.restoreExperimentVersion.mockResolvedValue(version);

    await expect(useCase.getExperimentVersion("experiment-1", 2, "user-1")).resolves.toBe(version);
    await expect(useCase.restoreExperimentVersion("experiment-1", 2, "user-1")).resolves.toBe(version);

    expect(mockRepository.getExperimentVersion).toHaveBeenCalledWith("experiment-1", 2, "user-1");
    expect(mockRepository.restoreExperimentVersion).toHaveBeenCalledWith("experiment-1", 2, "user-1");
  });

  test("delegates the Ready transition", async () => {
    mockRepository.markReady.mockResolvedValue({ status: "ready" });

    await expect(useCase.markReady("experiment-1", "user-1")).resolves.toEqual({ status: "ready" });
    expect(mockRepository.markReady).toHaveBeenCalledWith("experiment-1", "user-1");
  });

  test("passes sharing role and user to the repository", async () => {
    const response = { success: true };
    mockRepository.shareExperiment.mockResolvedValue(response);

    await expect(useCase.shareExperiment(
      "experiment-1",
      "editor@example.com",
      ExperimentRoleEnum.EDITOR,
      "owner-1"
    )).resolves.toBe(response);

    expect(mockRepository.shareExperiment).toHaveBeenCalledWith(
      "experiment-1",
      "editor@example.com",
      ExperimentRoleEnum.EDITOR,
      "owner-1",
      undefined
    );
  });

  test("passes separate permissions to the repository (LAB-COL-01)", async () => {
    mockRepository.shareExperiment.mockResolvedValue(true);

    await useCase.shareExperiment("experiment-1", "runner@example.com", undefined, "owner-1", { write: false, execute: true });

    expect(mockRepository.shareExperiment).toHaveBeenCalledWith("experiment-1", "runner@example.com", undefined, "owner-1", { write: false, execute: true });
  });

  test.each([
    ["getGroupExperiments", "getGroupExperiments"],
    ["getSharedExperiments", "getSharedExperiments"],
    ["getTemplateExperiments", "getTemplateExperiments"],
    ["getTemplateBenchmarks", "getTemplateBenchmarks"],
    ["getArchivedExperiments", "getArchivedExperiments"],
  ])("delegates %s", async (method, repositoryMethod) => {
    const request = { data: {} } as any;
    const response = { data: [] };
    const repositoryMethodMock = (mockRepository as any)[repositoryMethod];
    repositoryMethodMock.mockResolvedValue(response);

    await expect((useCase as any)[method](request)).resolves.toBe(response);
    expect(repositoryMethodMock).toHaveBeenCalledWith(request);
  });
});