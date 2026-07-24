import ExperimentRepository from "../../DataProviders/repository/Laboratory/ExperimentRepository";
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

  async saveExperiment(experiment: ExperimentDetailed, userId: string) {
    return this.experimentRepository.saveExperiment(experiment, userId);
  }

  async getExperimentDetailed(id: string, userId: string) {
    return this.experimentRepository.getExperimentDetailed(id, userId);
  }
  async updateExperiment(experiment: ExperimentDetailed, userId: string) {
    return this.experimentRepository.updateExperiment(experiment, userId);
  }

  async deleteExperiment(id: string, userId: string) {
    return this.experimentRepository.deleteExperiment(id, userId);
  }

  async archiveExperiment(id: string, userId: string) {
    return await this.experimentRepository.archiveExperiment(id, userId);
  }

  async restoreExperiment(id: string, userId: string) {
    return await this.experimentRepository.restoreExperiment(id, userId);
  }

  async shareExperiment(experimentId: string, userEmail: string, role: ExperimentRoleEnum, userId: string) {
    return await this.experimentRepository.shareExperiment(experimentId, userEmail, role, userId);
  }

  async copyExperiment(experimentId: string, userId: string) {
    return await this.experimentRepository.copyExperiment(experimentId, userId);
  }

  async publishAsTemplate(id: string, userId: string): Promise<Experiment | null> {
    return await this.experimentRepository.publishAsTemplate(id, userId);
  }

  async publishAsBenchmark(id: string, userId: string): Promise<Experiment | null> {
    return await this.experimentRepository.publishAsBenchmark(id, userId);
  }

  async getExperimentHistory(experimentId: string, userId: string) {
    return await this.experimentRepository.getExperimentHistory(experimentId, userId);
  }

  async getExperimentVersion(experimentId: string, version: number) {
    return await this.experimentRepository.getExperimentVersion(experimentId, version);
  }

  async restoreExperimentVersion(experimentId: string, version: number, userId: string) {
    const experimentVersion = await this.experimentRepository.getExperimentVersion(experimentId, version);
    return await this.experimentRepository.updateExperiment(experimentVersion, userId);
  }

  async getCollaborators(experimentId: string, userId: string) {
    return await this.experimentRepository.getCollaborators(experimentId, userId);
  }

  async removeCollaborator(experimentId: string, collaboratorId: string, userId: string) {
    return await this.experimentRepository.removeCollaborator(experimentId, collaboratorId, userId);
  }
}