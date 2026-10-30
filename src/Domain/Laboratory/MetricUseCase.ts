import MetricRepository, { MetricInput } from "../../DataProviders/repository/Laboratory/MetricRepository";
import { Metric } from "./Entities/Metric";

export default class MetricUseCase {
  private metricRepository: MetricRepository;

  constructor() {
    this.metricRepository = new MetricRepository();
  }

  async getMetricsByUserId(userId: string): Promise<Metric[]> {
    return this.metricRepository.getMetricsByUserId(userId);
  }

  async getPublicMetrics(): Promise<Metric[]> {
    return this.metricRepository.getPublicMetrics();
  }

  async getMetricById(id: string, userId: string): Promise<Metric> {
    return this.metricRepository.getMetricById(id, userId);
  }

  async createMetric(metricData: MetricInput, userId: string): Promise<Metric> {
    return this.metricRepository.createMetric(metricData, userId);
  }

  async updateMetric(id: string, metricData: MetricInput, userId: string): Promise<Metric> {
    return this.metricRepository.updateMetric(id, metricData, userId);
  }

  async deleteMetric(id: string, userId: string): Promise<void> {
    return this.metricRepository.deleteMetric(id, userId);
  }

  async publishMetrics(metricIds: string[], userId: string): Promise<void> {
    return this.metricRepository.publishMetrics(metricIds, userId);
  }
}
