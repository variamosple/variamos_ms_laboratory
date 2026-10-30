import { Op, Transaction } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { OrmMetric, Metric } from "../../../Domain/Laboratory/Entities/Metric";
import { OrmExperimentMetric } from "../../../Domain/Laboratory/Entities/ExperimentMetric";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../Domain/Core/Entities/Errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fields a user may set on a metric. The owner always comes from the session. */
export type MetricInput = Partial<Pick<Metric, "name" | "formula" | "unit" | "description" | "script"> & { category: string }>;

const EDITABLE_FIELDS: (keyof MetricInput)[] = ["name", "formula", "unit", "description", "script", "category"];

/**
 * Metrics are public (userId NULL) or private to their author. Only the author
 * can change, delete or publish a private metric; public metrics are read-only.
 */
export default class MetricRepository {
    async getMetricsByUserId(userId: string): Promise<Metric[]> {
        const metrics = await OrmMetric.findAll({
            where: { userId },
            order: [["name", "ASC"]],
        });
        return metrics.map(metric => metric.toJSON() as Metric);
    }

    async getPublicMetrics(): Promise<Metric[]> {
        const metrics = await OrmMetric.findAll({
            where: { userId: null },
            order: [["name", "ASC"]],
        });
        return metrics.map(metric => metric.toJSON() as Metric);
    }

    /** A public metric, or a private metric of the user. */
    async getMetricById(id: string, userId: string): Promise<Metric> {
        const metric = await this.findVisible(id, userId);
        return metric.toJSON() as Metric;
    }

    async createMetric(metricData: MetricInput, userId: string): Promise<Metric> {
        const values = this.pickEditable(metricData);

        if (!values.name?.trim() || !values.formula?.trim()) {
            throw new ValidationError("A metric needs a name and a formula.");
        }

        const metric = await OrmMetric.create({
            ...values,
            name: values.name.trim(),
            userId,
        } as any);
        return metric.toJSON() as Metric;
    }

    async updateMetric(id: string, metricData: MetricInput, userId: string): Promise<Metric> {
        const metric = await this.findOwned(id, userId);
        const values = this.pickEditable(metricData);

        if (values.name !== undefined && !values.name.trim()) {
            throw new ValidationError("A metric needs a name.");
        }
        if (values.formula !== undefined && !values.formula.trim()) {
            throw new ValidationError("A metric needs a formula.");
        }

        await metric.update(values);
        return metric.toJSON() as Metric;
    }

    /** A metric used by an experiment is kept, so the experiment stays reproducible. */
    async deleteMetric(id: string, userId: string): Promise<void> {
        const metric = await this.findOwned(id, userId);

        const uses = await OrmExperimentMetric.count({ where: { metricId: id } });
        if (uses > 0) {
            throw new ConflictError("This metric is used by an experiment and cannot be deleted.");
        }

        await metric.destroy();
    }

    /** LAB-MT-02: an author publishes their own metrics to the public catalog. */
    async publishMetrics(metricIds: string[], userId: string): Promise<void> {
        if (metricIds.length === 0) return;

        const transaction: Transaction = await sequelize.transaction();
        try {
            for (const id of metricIds) {
                await this.findOwned(id, userId, transaction);
            }
            await OrmMetric.update(
                { userId: null },
                { where: { id: { [Op.in]: metricIds } }, transaction }
            );
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    private pickEditable(metricData: MetricInput): MetricInput {
        const values: MetricInput = {};
        for (const field of EDITABLE_FIELDS) {
            const value = metricData?.[field];
            if (value !== undefined) {
                if (value !== null && typeof value !== "string") {
                    throw new ValidationError(`Invalid value for ${field}.`);
                }
                values[field] = value ?? undefined;
            }
        }
        return values;
    }

    private async findVisible(id: string, userId: string, transaction?: Transaction): Promise<OrmMetric> {
        const metric = UUID_PATTERN.test(id) ? await OrmMetric.findByPk(id, { transaction }) : null;

        if (!metric || (metric.userId !== null && metric.userId !== userId)) {
            throw new NotFoundError("Metric not found.");
        }
        return metric;
    }

    private async findOwned(id: string, userId: string, transaction?: Transaction): Promise<OrmMetric> {
        const metric = await this.findVisible(id, userId, transaction);

        if (metric.userId !== userId) {
            throw new ForbiddenError("Only the author of a private metric can change it; public metrics are read-only.");
        }
        return metric;
    }
}
