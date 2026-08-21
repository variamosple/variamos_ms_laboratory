import MetricRepository from "../../DataProviders/repository/Laboratory/MetricRepository";
import { Metric } from "./Entities/Metric";

export default class MetricUseCase {
  private metricRepository: MetricRepository;

  constructor() {
    this.metricRepository = new MetricRepository();
  }

  async getMetricsByUserId(userId: string): Promise<Metric[]> {
        return  this.metricRepository.getMetricsByUserId(userId);
    }

    async getPublicMetrics(): Promise<Metric[]> {   
        return this.metricRepository.getPublicMetrics();
    }

    async getMetricById(id: string): Promise<Metric | null> {
        return this.metricRepository.getMetricById(id);
    }

    async createMetric(metricData: Metric): Promise<Metric> {
        return this.metricRepository.createMetric(metricData);
    }

    async updateMetric(id: string, metricData: Partial<Metric>): Promise<Metric | null> {
        return this.metricRepository.updateMetric(id, metricData);
    }

    async deleteMetric(id: string): Promise<boolean> {
        return this.metricRepository.deleteMetric(id);
    }

    async publishMetrics(metricsToPublish: Metric[]): Promise<void> {
        return this.metricRepository.publishMetrics(metricsToPublish);
    }
}