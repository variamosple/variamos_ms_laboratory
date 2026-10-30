import ExperimentRepository, { ExperimentInput } from "../../DataProviders/repository/Laboratory/ExperimentRepository";
import { Experiment, ExperimentDetailed } from "./Entities/Experiment";
import { ExperimentFilter } from "./Entities/ExperimentFilter";
import { ExperimentRoleEnum } from "./Entities/ExperimentUser";
import { RequestModel } from "../Core/Entities/RequestModel";
import { ResponseModel } from "../Core/Entities/ResponseModel";

export default class ExperimentUseCase {
  private experimentRepository: ExperimentRepository;

  constructor() {
    this.experimentRepository = new ExperimentRepository();
  }

  async getUserExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {
    return this.experimentRepository.getUserExperiments(request);
  }

  async getGroupExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {
    return this.experimentRepository.getGroupExperiments(request);
  }

  async getSharedExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {
    return this.experimentRepository.getSharedExperiments(request);
  }

  async getTemplateExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {
    return this.experimentRepository.getTemplateExperiments(request);
  }

  async getTemplateBenchmarks(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {
    return this.experimentRepository.getTemplateBenchmarks(request);
  }

  async getArchivedExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {
    return this.experimentRepository.getArchivedExperiments(request);
  }

  async saveExperiment(experiment: ExperimentInput, userId: string) {
    return this.experimentRepository.saveExperiment(experiment, userId);
  }

  async getExperimentDetailed(id: string, userId: string) {
    return this.experimentRepository.getExperimentDetailed(id, userId);
  }
  async updateExperiment(experiment: ExperimentInput, userId: string) {
    return this.experimentRepository.updateExperiment(experiment, userId);
  }

  async deleteExperiment(id: string, userId: string) {
    return this.experimentRepository.deleteExperiment(id, userId);
  }

  async markReady(id: string, userId: string) {
    return this.experimentRepository.markReady(id, userId);
  }

  async archiveExperiment(id: string, userId: string) {
    return await this.experimentRepository.archiveExperiment(id, userId);
  }

  async restoreExperiment(id: string, userId: string) {
    return await this.experimentRepository.restoreExperiment(id, userId);
  }

  async shareExperiment(
    experimentId: string,
    userEmail: string,
    role: ExperimentRoleEnum | undefined,
    userId: string,
    permissions?: { write?: boolean; execute?: boolean }
  ) {
    return await this.experimentRepository.shareExperiment(experimentId, userEmail, role, userId, permissions);
  }

  async copyExperiment(experimentId: string, userId: string, projectId?: string) {
    return await this.experimentRepository.copyExperiment(experimentId, userId, projectId);
  }

  async publishAsTemplate(id: string, userId: string): Promise<ExperimentDetailed> {
    return await this.experimentRepository.publishAsTemplate(id, userId);
  }

  async publishAsBenchmark(id: string, userId: string): Promise<ExperimentDetailed> {
    return await this.experimentRepository.publishAsBenchmark(id, userId);
  }

  async getExperimentHistory(experimentId: string, userId: string) {
    return await this.experimentRepository.getExperimentHistory(experimentId, userId);
  }

  async getExperimentVersion(experimentId: string, version: number, userId: string) {
    return await this.experimentRepository.getExperimentVersion(experimentId, version, userId);
  }

  async restoreExperimentVersion(experimentId: string, version: number, userId: string) {
    return await this.experimentRepository.restoreExperimentVersion(experimentId, version, userId);
  }

  async getCollaborators(experimentId: string, userId: string) {
    return await this.experimentRepository.getCollaborators(experimentId, userId);
  }

  async removeCollaborator(experimentId: string, collaboratorId: string, userId: string) {
    return await this.experimentRepository.removeCollaborator(experimentId, collaboratorId, userId);
  }
}