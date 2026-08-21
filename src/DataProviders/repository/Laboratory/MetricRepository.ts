import { Op, WhereOptions, Transaction } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmMetric, Metric } from "../../../Domain/Laboratory/Entities/Metric";

export default class MetricRepository {
    async getMetricsByUserId(userId: string): Promise<Metric[]> {
        try {
            const metrics = await OrmMetric.findAll({
                where: {
                    userId: userId
                }
            });
            return metrics.map(metric => metric.toJSON() as Metric);
        } catch (error) {
            console.error("Error fetching metrics by user ID:", error);
            throw error;
        }
    }

    async getPublicMetrics(): Promise<Metric[]> {
        try {
            const metrics = await OrmMetric.findAll({
                where: {
                    userId: null
                }
            });
            return metrics.map(metric => metric.toJSON() as Metric);
        } catch (error) {
            console.error("Error fetching public metrics:", error);
            throw error;
        }
    }

    async getMetricById(id: string): Promise<Metric | null> {
        try {
            const metric = await OrmMetric.findByPk(id);
            return metric ? (metric.toJSON() as Metric) : null;
        } catch (error) {
            console.error("Error fetching metric by ID:", error);
            throw error;
        }
    }

    async createMetric(metricData: Metric): Promise<Metric> {
        try {
            const metric = await OrmMetric.create(metricData);
            return metric.toJSON() as Metric;
        } catch (error) {
            console.error("Error creating metric:", error);
            throw error;
        }
    }

    async updateMetric(id: string, metricData: Partial<Metric>): Promise<Metric | null> {
        try {
            const metric = await OrmMetric.findByPk(id);
            if (!metric) {
                return null;
            }
            await metric.update(metricData);
            return metric.toJSON() as Metric;
        } catch (error) {
            console.error("Error updating metric:", error);
            throw error;
        }
    }

    async deleteMetric(id: string): Promise<boolean> {
        try {
            const deletedCount = await OrmMetric.destroy({
                where: { id }
            });
            return deletedCount > 0;
        } catch (error) {
            console.error("Error deleting metric:", error);
            throw error;
        }
    }

    async publishMetrics(metricsToPublish: Metric[]): Promise<void> {
        const transaction: Transaction = await sequelize.transaction();
        try {
            const publishPromises = metricsToPublish.map(metric =>
                OrmMetric.update({ userId: null }, { where: { id: metric.id }, transaction })
            );
            await Promise.all(publishPromises);
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            console.error("Error publishing metrics:", error);
            throw error;
        }
    }
}