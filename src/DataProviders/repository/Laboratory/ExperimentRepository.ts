import { randomUUID } from "crypto";
import { modelHash } from "../../../Domain/Core/canonicalJson";
import { Op, Transaction, WhereOptions, literal } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";
import { Config } from "../../../Config";

import { Experiment, OrmExperiment, ExperimentDetailed, ExperimentStatus } from "../../../Domain/Laboratory/Entities/Experiment";
import { ExperimentRoleEnum, OrmExperimentUser, Collaborator } from "../../../Domain/Laboratory/Entities/ExperimentUser";
import { OrmScenario, Scenario } from "../../../Domain/Laboratory/Entities/Scenario";
import { OrmMetric, Metric } from "../../../Domain/Laboratory/Entities/Metric";
import { ExperimentFilter } from "../../../Domain/Laboratory/Entities/ExperimentFilter";
import { RequestModel } from "../../../Domain/Core/Entities/RequestModel";
import { ResponseModel } from "../../../Domain/Core/Entities/ResponseModel";
import { OrmExperimentMetric } from "../../../Domain/Laboratory/Entities/ExperimentMetric";
import { OrmUser } from "../../../Domain/Session/Entities/User";
import { ModelEntity, OrmModel } from "../../../Domain/ProductLineEngineering/Entities/Model";
import { OrmProject, OrmUserProject } from "../../../Domain/ProductLineEngineering/Entities/Project";
import { OrmLanguage } from "../../../Domain/ProductLineEngineering/Entities/Language";
import { OrmScenarioModel } from "../../../Domain/Laboratory/Entities/ScenarioModel";
import { OrmRun } from "../../../Domain/Laboratory/Entities/Run";
import { getNotificationGateway } from "../../../Domain/Notifications/NotificationGateway";
import { getReasoningGateway } from "../../../Domain/Reasoning/ReasoningGateway";
import { OrmExperimentHistory, ExperimentHistoryCreationAttributes, ExperimentHistory } from "../../../Domain/Laboratory/Entities/ExperimentHistory";
import { ExperimentConfigSnapshot, OrmExperimentVersion } from "../../../Domain/Laboratory/Entities/ExperimentVersion";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../../Domain/Core/Entities/Errors";
import {
  MANAGE_ROLES,
  ScenarioInput,
  canArchive,
  canMarkReady,
  deleteOutcome,
  editOutcome,
  editRejection,
  validateForReady,
  featureNames,
  Permission,
  permissionsOf,
  sharedRole,
  cloneOf,
  deleteRejection,
} from "../../../Domain/Laboratory/ExperimentLifecycle";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the interface sends to create or update an experiment. */
export type ExperimentInput = Omit<Partial<ExperimentDetailed>, "scenarios" | "metrics"> & {
  /**
   * LAB-COL-02: the version the user started editing from. If someone saved
   * since, the change is refused with what they changed, instead of being lost.
   */
  expectedVersion?: number;
  metrics?: (Metric | string)[];
  metricIds?: string[];
  scenarios?: (ScenarioInput & {
    /** Accepted from clients written before scenarios had several models. */
    modelId?: string | null;
    models?: { modelId: string }[];
    solverConfig?: ScenarioInput["solverConfigs"];
  })[];
};

export type DeleteResult = "deleted" | "archived";

/** The editable part of a stored scenario. */
const toScenarioInput = (scenario: Scenario): ScenarioInput & { id: string } => ({
  id: scenario.id,
  name: scenario.name,
  modelIds: scenario.models.map((model) => model.modelId),
  solverConfigs: scenario.solverConfigs,
  operationalContext: scenario.operationalContext,
});

const featuresOf = (model: OrmModel): Set<string> => featureNames(model.model);

/** One line for a change of the audit log (LAB-COL-02 conflicts and notifications). */
const describeChange = (event: { eventType: string; oldValue?: unknown; newValue?: unknown }): string => {
  switch (event.eventType) {
    case "name_updated":
      return `name changed from "${event.oldValue}" to "${event.newValue}"`;
    case "description_updated":
      return "description changed";
    case "hypothesis_updated":
      return "hypothesis changed";
    case "labels_updated":
      return "labels changed";
    case "project_updated":
      return "moved to another project";
    case "metrics_updated":
      return "metrics changed";
    case "scenario_added":
      return `scenario "${(event.newValue as any)?.name ?? ""}" added`;
    case "scenario_removed":
      return `scenario "${(event.oldValue as any)?.name ?? ""}" removed`;
    case "scenario_model_updated":
      return "models of a scenario changed";
    case "scenario_solver_config_updated":
      return "solver settings of a scenario changed";
    case "scenario_updated":
      return "name or operational context of a scenario changed";
    case "status_changed":
      return `status changed to ${event.newValue}`;
    case "version_restored":
      return `version ${(event.newValue as any)?.version} restored`;
    default:
      return event.eventType.replace(/_/g, " ");
  }
};

export default class ExperimentRepository {

  private async buildPagedResponse(
    request: RequestModel<ExperimentFilter>,
    userId: string,
    where: WhereOptions,
    include: any[] = []
  ): Promise<ResponseModel<Experiment[]>> {

    const response = new ResponseModel<Experiment[]>(request.transactionId);

    try {
      const { data: filter = new ExperimentFilter() } = request;

      const pageSize = filter.pageSize ?? undefined;
      const pageNumber = filter.pageNumber ?? undefined;

      const result = await OrmExperiment.findAndCountAll({
        where: { ...where, deletedAt: null },
        include,
        distinct: true,
        order: [["name", "ASC"]],
        limit: pageSize,
        offset:
          pageNumber && pageSize
            ? (pageNumber - 1) * pageSize
            : undefined,
      });

      response.totalCount = result.count;

      const originNames = await this.originNames(result.rows, userId);
      const owners = await this.ownerNames(result.rows.map((row) => row.id));
      response.data = result.rows.map((row) => {
        const access = row.users?.find((user) => user.userId === userId);
        const userRole = access?.role ?? "viewer";
        const experiment = this.toExperiment(row, userRole);
        experiment.permissions = access?.role
          ? permissionsOf({ role: access.role, canWrite: access.canWrite, canExecute: access.canExecute })
          : { read: true, write: false, execute: false, manage: false };
        if (experiment.clonedFrom) experiment.clonedFrom.name = originNames.get(experiment.clonedFrom.experimentId) ?? null;
        experiment.ownerName = owners.get(row.id) ?? null;
        return experiment;
      });

    } catch (error) {
      console.error("ExperimentRepository error:", error);
      response.withError(500, "Internal Server Error");
    }

    return response;
  }

  private toExperiment(row: OrmExperiment, userRole: string): Experiment {
    const experiment = new Experiment(
      row.id,
      row.name,
      row.version,
      row.labels ?? [],
      row.status,
      userRole,
      row.isTemplate,
      row.isBenchmark,
      row.description,
      row.hypothesis,
      row.createdAt,
      row.updatedAt
    );
    experiment.projectId = row.projectId ?? null;
    if (row.clonedFromExperimentId) {
      experiment.clonedFrom = { experimentId: row.clonedFromExperimentId, version: row.clonedFromVersion ?? null };
    }
    return experiment;
  }

  /** LAB-COL-04: the researcher who created each experiment of a list. */
  private async ownerNames(experimentIds: string[]): Promise<Map<string, string>> {
    if (experimentIds.length === 0) return new Map();
    const owners = await OrmExperimentUser.findAll({
      where: { experimentId: experimentIds, role: ExperimentRoleEnum.OWNER },
      include: [{ model: OrmUser, as: "user", attributes: ["name"] }],
    });
    return new Map(owners.map((owner: any) => [owner.experimentId, owner.user?.name ?? owner.userId]));
  }

  /**
   * LAB-EX-02: names of the originals of cloned experiments, shown in the lists.
   * Only names the user may read: templates, benchmarks, or experiments shared with them.
   */
  private async originNames(rows: { clonedFromExperimentId?: string | null }[], userId: string): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.clonedFromExperimentId).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();

    const originals = await OrmExperiment.findAll({ where: { id: ids }, attributes: ["id", "name", "isTemplate", "isBenchmark"] });
    const readable = new Set(
      (await OrmExperimentUser.findAll({ where: { experimentId: ids, userId }, attributes: ["experimentId"] })).map((row) => row.experimentId)
    );
    return new Map(
      originals
        .filter((original) => original.isTemplate || original.isBenchmark || readable.has(original.id))
        .map((original) => [original.id, original.name])
    );
  }

  /**
   * Filters of the lists: name, project (LAB-EX-01), and for the consolidated
   * view (LAB-COL-04) researcher, status, creation date and experiment type.
   */
  private buildNameFilter(filter: ExperimentFilter): WhereOptions {
    const where: any = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.createdFrom || filter.createdTo) {
      where.createdAt = {
        ...(filter.createdFrom ? { [Op.gte]: new Date(filter.createdFrom) } : {}),
        // The whole day of `createdTo`
        ...(filter.createdTo ? { [Op.lt]: new Date(new Date(filter.createdTo).getTime() + 24 * 3600 * 1000) } : {}),
      };
    }

    if (filter.type === "template") where.isTemplate = true;
    if (filter.type === "benchmark") where.isBenchmark = true;
    if (filter.type === "experiment") {
      where.isTemplate = false;
      where.isBenchmark = false;
    }

    if (filter.researcher) {
      // Owner whose name or e-mail contains the text
      const text = sequelize.escape(`%${filter.researcher}%`);
      where[Op.and as any] = [
        ...(where[Op.and as any] ?? []),
        literal(
          `"OrmExperiment"."id" IN (SELECT eu.experiment_id FROM ${Config.DB.SCHEMA}.experiment_user eu
             JOIN variamos."user" u ON u.id = eu.user_id
            WHERE eu.role = 'owner' AND (u.name ILIKE ${text} OR u.email ILIKE ${text}))`
        ),
      ];
    }

    if (filter.projectId) {
      where.projectId = filter.projectId;
    }

    if (filter.name) {
      where.name = {
        [Op.iLike]: `%${filter.name}%`,
      };
    }

    return where;
  }

  private buildUserInclude(userId: string, roles: string[]) {
    return [
      {
        model: OrmExperimentUser,
        as: "users",
        where: {
          userId,
          role: {
            [Op.in]: roles,
          },
        },
        required: true,
      },
    ];
  }

  /**
   * Loads a non-deleted experiment and checks what the user may do on it
   * (LAB-NF-05, LAB-COL-01): a permission, or a list of roles. Templates and
   * benchmarks are readable by every user when `allowPublished` is set
   * (LAB-CF-05). `lock` holds the row until the transaction ends, so that
   * concurrent changes are made one after the other (LAB-COL-02).
   */
  async ensureExperimentPermission(
    experimentId: string,
    userId: string,
    required: Permission | ExperimentRoleEnum[],
    transaction?: Transaction,
    allowPublished = false,
    lock = false
  ): Promise<{ experiment: OrmExperiment; role: ExperimentRoleEnum; permissions: Record<Permission, boolean> }> {
    if (!UUID_PATTERN.test(experimentId)) {
      throw new NotFoundError();
    }

    const experiment = await OrmExperiment.findOne({
      where: { id: experimentId, deletedAt: null },
      transaction,
      ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    if (!experiment) {
      throw new NotFoundError();
    }

    const access = await OrmExperimentUser.findOne({
      where: { experimentId, userId },
      transaction,
    });

    const role = access?.role;
    const permissions = permissionsOf(access && role ? { role, canWrite: access.canWrite, canExecute: access.canExecute } : null);
    const allowed = Array.isArray(required) ? !!role && required.includes(role) : permissions[required];

    if (role && allowed) {
      return { experiment, role, permissions };
    }

    if (allowPublished && (experiment.isTemplate || experiment.isBenchmark) && (required === "read" || (Array.isArray(required) && required.includes(ExperimentRoleEnum.VIEWER)))) {
      return { experiment, role: role ?? ExperimentRoleEnum.VIEWER, permissions: { ...permissions, read: true } };
    }

    throw new ForbiddenError();
  }

  /** LAB-EX-01: an experiment belongs to a VariaMos project the user owns or that is shared with them. */
  async ensureProjectAccess(projectId: unknown, userId: string, transaction?: Transaction): Promise<string> {
    if (typeof projectId !== "string" || projectId.trim() === "") {
      throw new ValidationError("A project is required.");
    }

    const project = await OrmProject.findByPk(projectId, { transaction });
    if (!project || project.isDeleted) {
      throw new ValidationError("Unknown project.");
    }

    if (project.ownerId !== userId) {
      const membership = await OrmUserProject.findOne({ where: { projectId, userId }, transaction });
      if (!membership) {
        throw new ForbiddenError("You have no access to this project.");
      }
    }

    return projectId;
  }

  /** LAB-COL-02: what was saved after a version, by whom: "Version 3 by Alice: name changed". */
  private async changesSince(experimentId: string, version: number, transaction?: Transaction): Promise<string[]> {
    const events = await OrmExperimentHistory.findAll({
      where: { experimentId, experimentVersion: { [Op.gt]: version } },
      include: [{ model: OrmUser, as: "user", attributes: ["name"], required: false }],
      order: [["createdAt", "ASC"]],
      transaction,
    });
    return events.map((event: any) =>
      `Version ${event.experimentVersion} by ${event.user?.name ?? event.userId}: ${describeChange(event)}`
    );
  }

  /** LAB-COL-02: the other collaborators are notified of a saved change. */
  private async notifyChange(experimentId: string, name: string, version: number, userId: string, changes: string[]) {
    const collaborators = await OrmExperimentUser.findAll({ where: { experimentId }, attributes: ["userId"] });
    const author = await OrmUser.findByPk(userId, { attributes: ["name"] });
    const userIds = collaborators.map((c) => c.userId!).filter((id) => id !== userId);
    if (userIds.length === 0) return;
    await getNotificationGateway()
      .notifyExperimentChanged({ userIds, experimentId, experimentName: name, version, changedBy: (author as any)?.name ?? userId, changes })
      .catch((error) => console.error("Change notification failed:", error));
  }

  private async validatePublishExperiment(id: string, transaction?: Transaction): Promise<OrmExperiment> {
    const experiment = await OrmExperiment.findByPk(id, {
        include: [
            {
                model: OrmScenario,
                as: "scenarios",
            },
            {
                model: OrmMetric,
                as: "metrics",
            },
        ],
        transaction,
    });

    if (!experiment || experiment.deletedAt) {
        throw new NotFoundError();
    }

    if (!experiment.scenarios || experiment.scenarios.length === 0) {
        throw new ValidationError("An experiment must contain at least one scenario before publishing");
    }

    if (!experiment.metrics || experiment.metrics.length === 0) {
        throw new ValidationError("An experiment must contain at least one metric before publishing");
    }

    return experiment;
  }

  /**
   * Scenario list from the request, with names and solver configurations. A
   * scenario keeps its id only if it already belongs to the experiment; new
   * scenarios get a server-side id.
   */
  private normalizeScenarios(
    scenarios: ExperimentInput["scenarios"],
    existingIds: string[] = []
  ): (ScenarioInput & { id: string })[] {
    return (scenarios ?? []).map((scenario, index) => ({
      id: scenario.id && existingIds.includes(scenario.id) ? scenario.id : randomUUID(),
      name: scenario.name?.trim() || `Scenario ${index + 1}`,
      modelIds: this.modelIdsOf(scenario),
      // `solverConfig` is what the first version of the service expected
      solverConfigs: scenario.solverConfigs ?? scenario.solverConfig ?? {},
      operationalContext: scenario.operationalContext ?? undefined,
    }));
  }

  /** The scenario models, in order and without duplicates. */
  private modelIdsOf(scenario: NonNullable<ExperimentInput["scenarios"]>[number]): string[] {
    const ids =
      scenario.modelIds ??
      scenario.models?.map((model) => model.modelId) ??
      (scenario.modelId ? [scenario.modelId] : []);
    return [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
  }

  private metricIdsOf(experiment: ExperimentInput): string[] {
    const ids = experiment.metricIds ?? (experiment.metrics ?? []).map((metric: any) =>
      typeof metric === "string" ? metric : metric?.id
    );
    return [...new Set(ids.filter(Boolean) as string[])];
  }

  /** A user can only attach public metrics and their own (LAB-MT-01, LAB-MT-02). */
  private async ensureMetricsUsable(metricIds: string[], userId: string, transaction?: Transaction) {
    if (metricIds.some((id) => !UUID_PATTERN.test(id))) {
      throw new ValidationError("Unknown metric.");
    }
    if (metricIds.length === 0) return;

    const count = await OrmMetric.count({
      where: {
        id: metricIds,
        [Op.or]: [{ userId: null }, { userId }],
      },
      transaction,
    });

    if (count !== metricIds.length) {
      throw new ValidationError("Unknown metric, or a private metric of another user.");
    }
  }

  private snapshotOf(
    experiment: { name?: string; description?: string; hypothesis?: string; projectId?: string | null; labels?: string[] },
    metricIds: string[],
    scenarios: ScenarioInput[]
  ): ExperimentConfigSnapshot {
    return {
      name: experiment.name ?? "",
      description: experiment.description,
      hypothesis: experiment.hypothesis,
      projectId: experiment.projectId ?? null,
      labels: experiment.labels ?? [],
      metricIds: [...metricIds].sort(),
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id!,
        name: scenario.name,
        modelIds: scenario.modelIds ?? [],
        solverConfigs: (scenario.solverConfigs ?? {}) as any,
        operationalContext: (scenario.operationalContext ?? undefined) as any,
      })),
    };
  }

  private async createScenarios(experimentId: string, scenarios: ScenarioInput[], transaction: Transaction) {
    if (scenarios.length === 0) return;

    await OrmScenario.bulkCreate(
      scenarios.map((scenario, position) => ({
        id: scenario.id,
        experimentId,
        name: scenario.name,
        position,
        solverConfigs: (scenario.solverConfigs ?? {}) as any,
        operationalContext: (scenario.operationalContext ?? null) as any,
      })),
      { transaction }
    );

    const models = scenarios.flatMap((scenario) =>
      (scenario.modelIds ?? []).map((modelId, position) => ({ scenarioId: scenario.id!, position, modelId }))
    );
    if (models.length > 0) {
      await OrmScenarioModel.bulkCreate(models, { transaction });
    }
  }

  private async replaceMetrics(experimentId: string, metricIds: string[], transaction: Transaction) {
    await OrmExperimentMetric.destroy({ where: { experimentId }, transaction });

    if (metricIds.length > 0) {
      await OrmExperimentMetric.bulkCreate(
        metricIds.map((metricId) => ({ experimentId, metricId })),
        { transaction }
      );
    }
  }

  async loadDetailed(id: string, userRole: string, transaction?: Transaction, userId?: string): Promise<ExperimentDetailed> {
    const ormExperiment = await OrmExperiment.findByPk(id, {
      include: [
        {
          model: OrmExperimentUser,
          as: "users",
          include: [
            {
              model: OrmUser,
              as: "user",
            },
          ],
        },
        {
          model: OrmScenario,
          as: "scenarios",
          include: [
            {
              model: OrmScenarioModel,
              as: "models",
              include: [
                {
                  model: OrmModel,
                  as: "model",
                },
              ],
            },
          ],
        },
        {
          model: OrmMetric,
          as: "metrics",
        },
      ],
      order: [[{ model: OrmScenario, as: "scenarios" }, "position", "ASC"]],
      transaction,
    });

    if (!ormExperiment || ormExperiment.deletedAt) {
      throw new NotFoundError();
    }

    const experiment = new ExperimentDetailed(
      ormExperiment.id,
      ormExperiment.name,
      ormExperiment.version,
      ormExperiment.labels ?? [],
      ormExperiment.status,
      userRole,
      ormExperiment.isTemplate,
      ormExperiment.isBenchmark,
      ormExperiment.description,
      ormExperiment.hypothesis,
      ormExperiment.createdAt,
      ormExperiment.updatedAt
    );

    experiment.projectId = ormExperiment.projectId ?? null;
    experiment.reproducedFrom = ormExperiment.reproducedFrom ?? null;
    const access = userId ? ormExperiment.users?.find((user) => user.userId === userId) : undefined;
    experiment.permissions = access?.role
      ? permissionsOf({ role: access.role, canWrite: access.canWrite, canExecute: access.canExecute })
      : { read: true, write: false, execute: false, manage: false };
    experiment.scenarios = (ormExperiment.scenarios ?? []).map(Scenario.fromOrm);

    experiment.metrics = (ormExperiment.metrics ?? []).map(
      (metric) =>
        new Metric(
          metric.id,
          metric.name,
          metric.formula,
          metric.unit,
          metric.script,
          metric.createdAt,
          metric.updatedAt,
          metric.description,
          metric.userId
        )
    );

    const owner = ormExperiment.users?.find(
      (user) => user.role === ExperimentRoleEnum.OWNER
    );

    experiment.author = (owner?.user as any)?.name ?? "";

    if (ormExperiment.clonedFromExperimentId) {
      experiment.clonedFrom = {
        experimentId: ormExperiment.clonedFromExperimentId,
        version: ormExperiment.clonedFromVersion ?? null,
        // Shown when the owner of the clone may read the original
        name: (await this.originNames([ormExperiment], owner?.userId ?? "")).get(ormExperiment.clonedFromExperimentId) ?? null,
      };
    }

    return experiment;
  }

  async getUserExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      // Archived experiments have their own list; a status filter narrows the others
      status: filter.status && filter.status !== "archived" ? filter.status : { [Op.ne]: "archived" },
    };

    return this.buildPagedResponse(
      request,
      filter.userId!,
      where,
      this.buildUserInclude(filter.userId!, ["owner"])
    );
  }

  async getGroupExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      // Archived experiments have their own list; a status filter narrows the others
      status: filter.status && filter.status !== "archived" ? filter.status : { [Op.ne]: "archived" },
    };

    return this.buildPagedResponse(
      request,
      filter.userId!,
      where,
      this.buildUserInclude(filter.userId!, ["director"])
    );
  }


  async getSharedExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      // Archived experiments have their own list; a status filter narrows the others
      status: filter.status && filter.status !== "archived" ? filter.status : { [Op.ne]: "archived" },
    };
    return this.buildPagedResponse(
      request,
      filter.userId!,
      where,
      this.buildUserInclude(filter.userId!, ["editor", "viewer"])
    );
  }

  async getTemplateExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      isTemplate: true,
    };

    return this.buildPagedResponse(request, filter.userId!, where);
  }

  async getTemplateBenchmarks(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      isBenchmark: true,
    };

    return this.buildPagedResponse(request, filter.userId!, where);
  }

  async getArchivedExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      status: "archived",
    };

    return this.buildPagedResponse(
      request,
      filter.userId!,
      where,
      this.buildUserInclude(filter.userId!, MANAGE_ROLES)
    );
  }

  async getExperimentDetailed(id: string, userId: string): Promise<ExperimentDetailed> {
    const { role } = await this.ensureExperimentPermission(id, userId, "read", undefined, true);
    return this.loadDetailed(id, role, undefined, userId);
  }

  /** LAB-EX-01: a new experiment is always a Draft owned by its creator. */
  async saveExperiment(experiment: ExperimentInput, userId: string): Promise<ExperimentDetailed> {
    if (!experiment.name?.trim()) {
      throw new ValidationError("Experiment name is required.");
    }

    const scenarios = this.normalizeScenarios(experiment.scenarios);
    const metricIds = this.metricIdsOf(experiment);
    const snapshot = this.snapshotOf({ ...experiment, projectId: experiment.projectId ?? null }, metricIds, scenarios);

    const transaction = await sequelize.transaction();
    try {
      const projectId = await this.ensureProjectAccess(experiment.projectId, userId, transaction);
      await this.ensureMetricsUsable(metricIds, userId, transaction);

      const createdExperiment = await OrmExperiment.create(
        {
          id: randomUUID(),
          name: experiment.name.trim(),
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          projectId,
          version: 1,
          labels: experiment.labels ?? [],
          status: "draft",
          isTemplate: false,
          isBenchmark: false,
        },
        { transaction }
      );

      const experimentId = createdExperiment.id!;

      await OrmExperimentUser.create(
        {
          experimentId,
          userId,
          role: ExperimentRoleEnum.OWNER,
        },
        { transaction }
      );

      await this.createScenarios(experimentId, scenarios, transaction);
      await this.replaceMetrics(experimentId, metricIds, transaction);

      await OrmExperimentVersion.create(
        { experimentId, version: 1, userId, config: snapshot },
        { transaction }
      );

      await OrmExperimentHistory.create(
        {
          experimentId,
          experimentVersion: 1,
          userId,
          eventType: "experiment_created",
          newValue: { ...snapshot, status: "draft" },
        },
        { transaction }
      );

      await transaction.commit();

      return this.loadDetailed(experimentId, ExperimentRoleEnum.OWNER, undefined, userId);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * LAB-EX-03 / LAB-EX-04: saves a change as a new version. In Draft the
   * experiment is edited in place; a Ready or finished experiment goes back to
   * Draft; a running or archived one is rejected. The status, template and
   * benchmark flags are never taken from the request: they have their own actions.
   */
  async updateExperiment(
    experiment: ExperimentInput,
    userId: string,
    restoredFromVersion?: number
  ): Promise<ExperimentDetailed> {
    const transaction = await sequelize.transaction();

    try {
      // Locked until commit: concurrent saves are made one after the other (LAB-COL-02)
      const { experiment: current, role } = await this.ensureExperimentPermission(
        experiment.id!,
        userId,
        "write",
        transaction,
        false,
        true
      );

      if (typeof experiment.expectedVersion === "number" && experiment.expectedVersion !== current.version) {
        throw new ConflictError(
          `Someone saved version ${current.version} while you were editing version ${experiment.expectedVersion}.`,
          await this.changesSince(current.id, experiment.expectedVersion, transaction)
        );
      }

      const outcome = editOutcome(current.status);
      if (outcome === "rejected") {
        throw new ConflictError(editRejection(current.status));
      }

      if (experiment.name !== undefined && !experiment.name.trim()) {
        throw new ValidationError("Experiment name is required.");
      }

      const previousExperiment = await this.loadDetailed(current.id, role, transaction, userId);

      const next = {
        name: experiment.name?.trim() ?? previousExperiment.name,
        description: experiment.description ?? previousExperiment.description,
        hypothesis: experiment.hypothesis ?? previousExperiment.hypothesis,
        projectId: experiment.projectId ?? previousExperiment.projectId ?? null,
        labels: experiment.labels ?? previousExperiment.labels,
      };

      if (next.projectId !== (previousExperiment.projectId ?? null)) {
        await this.ensureProjectAccess(next.projectId, userId, transaction);
      }
      const scenarios = experiment.scenarios
        ? this.normalizeScenarios(experiment.scenarios, previousExperiment.scenarios.map((s) => s.id))
        : previousExperiment.scenarios.map(toScenarioInput);
      const metricIds =
        experiment.metrics || experiment.metricIds
          ? this.metricIdsOf(experiment)
          : previousExperiment.metrics.map((m) => m.id);

      await this.ensureMetricsUsable(
        metricIds.filter((id) => !previousExperiment.metrics.some((m) => m.id === id)),
        userId,
        transaction
      );

      const nextVersion = previousExperiment.version + 1;
      const history: ExperimentHistoryCreationAttributes[] = [];
      const event = (attributes: Omit<ExperimentHistoryCreationAttributes, "experimentId" | "experimentVersion" | "userId">) =>
        history.push({ experimentId: current.id, experimentVersion: nextVersion, userId, ...attributes });

      // Experiment fields

      if (previousExperiment.name !== next.name) {
        event({ eventType: "name_updated", oldValue: previousExperiment.name, newValue: next.name });
      }

      if ((previousExperiment.description ?? "") !== (next.description ?? "")) {
        event({ eventType: "description_updated", oldValue: previousExperiment.description, newValue: next.description });
      }

      if ((previousExperiment.hypothesis ?? "") !== (next.hypothesis ?? "")) {
        event({ eventType: "hypothesis_updated", oldValue: previousExperiment.hypothesis, newValue: next.hypothesis });
      }

      if (next.projectId !== (previousExperiment.projectId ?? null)) {
        event({ eventType: "project_updated", oldValue: previousExperiment.projectId, newValue: next.projectId });
      }

      if (
        JSON.stringify([...(previousExperiment.labels ?? [])].sort()) !==
        JSON.stringify([...(next.labels ?? [])].sort())
      ) {
        event({ eventType: "labels_updated", oldValue: previousExperiment.labels, newValue: next.labels });
      }

      // Metrics

      const previousMetricIds = previousExperiment.metrics.map((m) => m.id).sort();
      const currentMetricIds = [...metricIds].sort();

      if (JSON.stringify(previousMetricIds) !== JSON.stringify(currentMetricIds)) {
        event({ eventType: "metrics_updated", oldValue: previousMetricIds, newValue: currentMetricIds });
      }

      // Scenarios

      const previousScenarioIds = previousExperiment.scenarios.map((s) => s.id);
      const currentScenarioIds = scenarios.map((s) => s.id!);

      for (const scenario of scenarios) {
        const previousScenario = previousExperiment.scenarios.find((s) => s.id === scenario.id);

        if (!previousScenario) {
          event({
            eventType: "scenario_added",
            scenarioId: scenario.id,
            newValue: { name: scenario.name, modelIds: scenario.modelIds, solverConfigs: scenario.solverConfigs },
          });
          continue;
        }

        const previousModelIds = previousScenario.models.map((model) => model.modelId);
        if (JSON.stringify(previousModelIds) !== JSON.stringify(scenario.modelIds ?? [])) {
          event({
            eventType: "scenario_model_updated",
            scenarioId: scenario.id,
            oldValue: previousModelIds,
            newValue: scenario.modelIds,
          });
        }

        if (JSON.stringify(previousScenario.solverConfigs ?? {}) !== JSON.stringify(scenario.solverConfigs ?? {})) {
          event({
            eventType: "scenario_solver_config_updated",
            scenarioId: scenario.id,
            oldValue: previousScenario.solverConfigs,
            newValue: scenario.solverConfigs,
          });
        }

        if (
          (previousScenario.name ?? "") !== (scenario.name ?? "") ||
          JSON.stringify(previousScenario.operationalContext ?? null) !==
            JSON.stringify(scenario.operationalContext ?? null)
        ) {
          event({
            eventType: "scenario_updated",
            scenarioId: scenario.id,
            oldValue: { name: previousScenario.name, operationalContext: previousScenario.operationalContext },
            newValue: { name: scenario.name, operationalContext: scenario.operationalContext },
          });
        }
      }

      for (const scenario of previousExperiment.scenarios.filter((s) => !currentScenarioIds.includes(s.id))) {
        event({
          eventType: "scenario_removed",
          scenarioId: scenario.id,
          oldValue: {
            name: scenario.name,
            modelIds: scenario.models.map((model) => model.modelId),
            solverConfigs: scenario.solverConfigs,
          },
        });
      }

      const positionsChanged =
        JSON.stringify(previousScenarioIds.filter((id) => currentScenarioIds.includes(id))) !==
        JSON.stringify(currentScenarioIds.filter((id) => previousScenarioIds.includes(id)));

      // Nothing changed: no new version
      if (history.length === 0 && !positionsChanged) {
        await transaction.rollback();
        return previousExperiment;
      }

      const nextStatus: ExperimentStatus = outcome === "new-draft" ? "draft" : current.status;

      if (nextStatus !== current.status) {
        event({ eventType: "status_changed", oldValue: current.status, newValue: nextStatus });
      }

      if (restoredFromVersion !== undefined) {
        event({ eventType: "version_restored", newValue: { version: restoredFromVersion } });
      }

      // Update experiment

      await OrmExperiment.update(
        {
          ...next,
          version: nextVersion,
          status: nextStatus,
        },
        {
          where: { id: current.id },
          transaction,
        }
      );

      // A changed configuration is no longer the one pinned at Ready: scenarios are rewritten unpinned.
      await OrmScenario.destroy({ where: { experimentId: current.id }, transaction });
      await this.createScenarios(current.id, scenarios, transaction);
      await this.replaceMetrics(current.id, metricIds, transaction);

      await OrmExperimentVersion.create(
        {
          experimentId: current.id,
          version: nextVersion,
          userId,
          config: this.snapshotOf(next, metricIds, scenarios),
        },
        { transaction }
      );

      await OrmExperimentHistory.bulkCreate(history, { transaction });

      await transaction.commit();

      await this.notifyChange(current.id, next.name, nextVersion, userId, history.map(describeChange));

      return this.loadDetailed(current.id, role, undefined, userId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  private async setStatus(
    experiment: OrmExperiment,
    userId: string,
    changes: Partial<Pick<OrmExperiment, "status" | "statusBeforeArchive" | "deletedAt">>,
    eventType: ExperimentHistoryCreationAttributes["eventType"],
    transaction: Transaction
  ) {
    await OrmExperiment.update(changes, { where: { id: experiment.id }, transaction });

    await OrmExperimentHistory.create(
      {
        experimentId: experiment.id,
        experimentVersion: experiment.version,
        userId,
        eventType,
        oldValue: experiment.status,
        newValue: changes.status ?? experiment.status,
      },
      { transaction }
    );
  }

  /**
   * LAB-EX-05: logical deletion by the creator or the research director. An
   * experiment with completed executions is archived instead.
   */
  async deleteExperiment(id: string, userId: string): Promise<DeleteResult> {
    const transaction = await sequelize.transaction();

    try {
      const { experiment } = await this.ensureExperimentPermission(id, userId, "manage", transaction);

      const completedRuns = await OrmRun.count({ where: { experimentId: id, status: "completed" }, transaction });
      const outcome = deleteOutcome(experiment.status, completedRuns > 0);

      if (outcome === "rejected") {
        throw new ConflictError(deleteRejection(experiment.status));
      }

      if (outcome === "archive") {
        await this.setStatus(
          experiment,
          userId,
          { status: "archived", statusBeforeArchive: experiment.status },
          "experiment_archived",
          transaction
        );
      } else {
        await this.setStatus(experiment, userId, { deletedAt: new Date() }, "experiment_deleted", transaction);
      }

      await transaction.commit();

      return outcome === "archive" ? "archived" : "deleted";

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** LAB-EX-06: archive, remembering the state to restore. */
  async archiveExperiment(id: string, userId: string): Promise<ExperimentDetailed> {
    const transaction = await sequelize.transaction();

    try {
      const { experiment, role } = await this.ensureExperimentPermission(id, userId, "manage", transaction);

      if (!canArchive(experiment.status)) {
        throw new ConflictError(`An experiment in state '${experiment.status}' cannot be archived.`);
      }

      await this.setStatus(
        experiment,
        userId,
        { status: "archived", statusBeforeArchive: experiment.status },
        "experiment_archived",
        transaction
      );

      await transaction.commit();

      return this.loadDetailed(id, role, undefined, userId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** LAB-EX-06: restoring returns the experiment to its pre-archive state. */
  async restoreExperiment(id: string, userId: string): Promise<ExperimentDetailed> {
    const transaction = await sequelize.transaction();

    try {
      const { experiment, role } = await this.ensureExperimentPermission(id, userId, "manage", transaction);

      if (experiment.status !== "archived") {
        throw new ConflictError("Only an archived experiment can be restored.");
      }

      await this.setStatus(
        experiment,
        userId,
        { status: experiment.statusBeforeArchive ?? "draft", statusBeforeArchive: null },
        "experiment_restored",
        transaction
      );

      await transaction.commit();

      return this.loadDetailed(id, role, undefined, userId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * LAB-EX-07 Draft -> Ready, after LAB-RUN-01 validation. Each scenario model
   * is copied and hashed (LAB-CF-01, LAB-R-03): runs will use this exact copy.
   */
  async markReady(id: string, userId: string): Promise<ExperimentDetailed> {
    const transaction = await sequelize.transaction();

    try {
      const { experiment, role } = await this.ensureExperimentPermission(id, userId, "write", transaction);

      if (!canMarkReady(experiment.status)) {
        throw new ConflictError(`An experiment in state '${experiment.status}' cannot be marked Ready.`);
      }

      const detailed = await this.loadDetailed(id, role, transaction, userId);
      const scenarios = detailed.scenarios.map(toScenarioInput);
      const modelIds = [...new Set(scenarios.flatMap((s) => s.modelIds ?? []))];

      const models = modelIds.length
        ? await OrmModel.findAll({
            where: { id: modelIds, isDeleted: { [Op.not]: true } },
            transaction,
          })
        : [];

      const problems = validateForReady(
        {
          name: detailed.name,
          scenarios,
          metricIds: detailed.metrics.map((m) => m.id),
        },
        {
          models: new Map(models.map((model) => [model.id, featuresOf(model)])),
          solvers: await getReasoningGateway().listSolvers(),
        }
      );

      // LAB-RP-01: the semantics of each language is pinned with the models
      const languages = models.length
        ? await OrmLanguage.findAll({ where: { id: [...new Set(models.map((model) => model.languageId))] }, transaction })
        : [];
      models
        .filter((model) => !languages.some((language) => language.id === model.languageId))
        .forEach((model) => problems.push(`The language ${model.languageId} of the model ${model.name ?? model.id} does not exist.`));

      if (problems.length > 0) {
        throw new ValidationError("The experiment is not ready to run.", problems);
      }

      const pinnedAt = new Date();
      for (const scenario of scenarios) {
        for (const [position, modelId] of (scenario.modelIds ?? []).entries()) {
          const model = models.find((m) => m.id === modelId)!;
          const semantics = languages.find((language) => language.id === model.languageId)!.semantics ?? {};
          await OrmScenarioModel.update(
            {
              modelSnapshot: model.model,
              modelSnapshotHash: modelHash(model.model),
              modelLanguageId: model.languageId,
              modelPinnedAt: pinnedAt,
              semanticsSnapshot: semantics,
              semanticsHash: modelHash(semantics),
            },
            { where: { scenarioId: scenario.id, position }, transaction }
          );
        }
      }

      await this.setStatus(experiment, userId, { status: "ready" }, "status_changed", transaction);

      await transaction.commit();

      return this.loadDetailed(id, role, undefined, userId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * LAB-COL-01: share with read, write and execute given separately
   * (`permissions`), or with a role: editor writes and executes, viewer reads.
   */
  async shareExperiment(
    experimentId: string,
    userEmail: string,
    role: ExperimentRoleEnum | undefined,
    userId: string,
    permissions?: { write?: boolean; execute?: boolean }
  ) {
    const transaction = await sequelize.transaction();

    try {
      const { experiment } = await this.ensureExperimentPermission(
        experimentId,
        userId,
        "manage",
        transaction
      );

      let canWrite: boolean;
      let canExecute: boolean;
      if (permissions) {
        canWrite = !!permissions.write;
        canExecute = !!permissions.execute;
      } else if (role === ExperimentRoleEnum.EDITOR || role === ExperimentRoleEnum.VIEWER) {
        canWrite = canExecute = role === ExperimentRoleEnum.EDITOR;
      } else {
        throw new ValidationError("Give the permissions (write, execute), or the editor or viewer role.");
      }
      const sharedAs = sharedRole(canWrite);

      // A deleted or disabled account cannot be given access
      const user = await OrmUser.findOne({
        where: {
          email: userEmail,
          isEnabled: true,
          isDeleted: false,
        },
        transaction,
      });

      if (!user) {
        throw new NotFoundError("User not found.");
      }

      const sharedUserId = user.getDataValue("id");

      const existingPermission = await OrmExperimentUser.findOne({
        where: {
          experimentId,
          userId: sharedUserId,
        },
        transaction,
      });

      if (
        existingPermission &&
        (
          existingPermission.role === ExperimentRoleEnum.OWNER ||
          existingPermission.role === ExperimentRoleEnum.DIRECTOR
        )
      ) {
        throw new ConflictError(
          "Owner and Director roles cannot be modified."
        );
      }

      await OrmExperimentUser.upsert(
        {
          experimentId,
          userId: sharedUserId,
          role: sharedAs,
          canWrite,
          canExecute,
        },
        {
          transaction,
        }
      );

      await OrmExperimentHistory.create(
        {
          experimentId,
          experimentVersion: experiment.version,
          userId,
          eventType: "collaborator_shared",
          oldValue: existingPermission
            ? { userId: sharedUserId, role: existingPermission.role, write: !!existingPermission.canWrite, execute: !!existingPermission.canExecute }
            : undefined,
          newValue: { userId: sharedUserId, role: sharedAs, write: canWrite, execute: canExecute },
        },
        { transaction }
      );

      await transaction.commit();

      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * LAB-EX-02: the clone is a Draft that records the experiment and version it comes from.
   * It goes to the given project, or to the project of the original (LAB-EX-01).
   */
  async copyExperiment(experimentId: string, userId: string, projectId?: string): Promise<ExperimentDetailed> {
    const transaction = await sequelize.transaction();

    try {
      const { role } = await this.ensureExperimentPermission(
        experimentId,
        userId,
        "read",
        transaction,
        true
      );
      const source = await this.loadDetailed(experimentId, role, transaction, userId);
      const targetProjectId = projectId !== undefined
        ? await this.ensureProjectAccess(projectId, userId, transaction)
        : await this.ensureProjectAccess(source.projectId, userId, transaction).catch((error) => {
            // A template from someone else's project: the user picks the project of the copy
            if (error instanceof ForbiddenError || error instanceof ValidationError) {
              throw new ValidationError("Choose the project of the copy.");
            }
            throw error;
          });

      const clone = cloneOf(
        { ...source, scenarios: source.scenarios.map(toScenarioInput), metrics: source.metrics },
        userId,
        randomUUID
      );
      const { scenarios, metricIds } = clone;

      const newExperiment = await OrmExperiment.create(
        {
          id: randomUUID(),
          name: clone.name,
          description: clone.description,
          hypothesis: clone.hypothesis,
          projectId: targetProjectId,
          version: 1,
          labels: clone.labels,
          status: clone.status,
          isTemplate: clone.isTemplate,
          isBenchmark: clone.isBenchmark,
          clonedFromExperimentId: clone.clonedFrom.experimentId,
          clonedFromVersion: clone.clonedFrom.version,
        },
        {
          transaction,
        }
      );

      await OrmExperimentUser.create(
        {
          experimentId: newExperiment.id,
          userId,
          role: ExperimentRoleEnum.OWNER,
        },
        {
          transaction,
        }
      );

      await this.createScenarios(newExperiment.id, scenarios, transaction);
      await this.replaceMetrics(newExperiment.id, metricIds, transaction);

      const snapshot = this.snapshotOf({ ...source, name: newExperiment.name, projectId: targetProjectId }, metricIds, scenarios);

      await OrmExperimentVersion.create(
        { experimentId: newExperiment.id, version: 1, userId, config: snapshot },
        { transaction }
      );

      await OrmExperimentHistory.create(
        {
          experimentId: newExperiment.id,
          experimentVersion: 1,
          userId,
          eventType: "experiment_copied",
          oldValue: {
            sourceExperimentId: source.id,
            sourceVersion: source.version,
          },
          newValue: { ...snapshot, status: "draft" },
        },
        { transaction }
      );

      await transaction.commit();

      return this.loadDetailed(newExperiment.id, ExperimentRoleEnum.OWNER, undefined, userId);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  private async publish(id: string, userId: string, as: "template" | "benchmark"): Promise<ExperimentDetailed> {
    const transaction = await sequelize.transaction();

    try {
      const { role } = await this.ensureExperimentPermission(
        id,
        userId,
        [ExperimentRoleEnum.OWNER],
        transaction
      );

      const experiment = await this.validatePublishExperiment(id, transaction);

      experiment.isTemplate = as === "template";
      experiment.isBenchmark = as === "benchmark";

      await experiment.save({ transaction });

      await OrmExperimentHistory.create(
        {
          experimentId: id,
          experimentVersion: experiment.version,
          userId,
          eventType: as === "template" ? "published_as_template" : "published_as_benchmark",
        },
        { transaction }
      );

      await transaction.commit();

      return this.loadDetailed(id, role, undefined, userId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async publishAsTemplate(id: string, userId: string): Promise<ExperimentDetailed> {
    return this.publish(id, userId, "template");
  }

  async publishAsBenchmark(id: string, userId: string): Promise<ExperimentDetailed> {
    return this.publish(id, userId, "benchmark");
  }

  async getExperimentHistory(
    experimentId: string,
    userId: string
  ): Promise<ExperimentHistory[]> {
    await this.ensureExperimentPermission(experimentId, userId, "read", undefined, true);

    const rows = await OrmExperimentHistory.findAll({
      where: {
        experimentId,
      },
      include: [
        {
          model: OrmUser,
          as: "user",
          attributes: ["name"],
          required: false,
        },
      ],
      order: [
        ["experimentVersion", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return rows.map((row) => ({
      id: row.id,
      experimentId: row.experimentId,
      scenarioId: row.scenarioId,
      userName: (row.user as any)?.name ?? "Unknown User",
      experimentVersion: row.experimentVersion,
      eventType: row.eventType,
      oldValue: row.oldValue,
      newValue: row.newValue,
      createdAt: row.createdAt,
    }));
  }

  /** LAB-EX-04: a past version, as it was saved. */
  async getExperimentVersion(
    experimentId: string,
    version: number,
    userId: string
  ): Promise<ExperimentDetailed> {
    const { experiment: current, role } = await this.ensureExperimentPermission(
      experimentId,
      userId,
      "read",
      undefined,
      true
    );

    const stored = Number.isInteger(version)
      ? await OrmExperimentVersion.findOne({ where: { experimentId, version } })
      : null;

    if (!stored) {
      throw new NotFoundError("Version not found.");
    }

    const snapshot = stored.config;

    const experiment = new ExperimentDetailed(
      experimentId,
      snapshot.name,
      version,
      snapshot.labels ?? [],
      current.status,
      role,
      current.isTemplate,
      current.isBenchmark,
      snapshot.description,
      snapshot.hypothesis,
      stored.createdAt,
      stored.createdAt
    );
    experiment.projectId = snapshot.projectId !== undefined ? snapshot.projectId : current.projectId ?? null;

    const modelIdsOf = (scenario: ExperimentConfigSnapshot["scenarios"][number]) =>
      scenario.modelIds ?? (scenario.modelId ? [scenario.modelId] : []);
    const modelIds = [...new Set(snapshot.scenarios.flatMap(modelIdsOf))];
    const models = modelIds.length ? await OrmModel.findAll({ where: { id: modelIds } }) : [];

    experiment.scenarios = snapshot.scenarios.map((scenario) =>
      new Scenario(
        scenario.id,
        experimentId,
        modelIdsOf(scenario).map((modelId) => {
          const model = models.find((m) => m.id === modelId);
          return { modelId, model: model ? ModelEntity.fromOrm(model) : undefined };
        }),
        scenario.solverConfigs,
        scenario.name,
        scenario.operationalContext
      )
    );

    const metrics = snapshot.metricIds.length
      ? await OrmMetric.findAll({ where: { id: snapshot.metricIds } })
      : [];

    experiment.metrics = metrics.map(
      (metric) =>
        new Metric(
          metric.id,
          metric.name,
          metric.formula,
          metric.unit,
          metric.script,
          metric.createdAt,
          metric.updatedAt,
          metric.description,
          metric.userId
        )
    );

    return experiment;
  }

  /** LAB-EX-04: restoring a version saves its configuration as a new version. */
  async restoreExperimentVersion(experimentId: string, version: number, userId: string): Promise<ExperimentDetailed> {
    const old = await this.getExperimentVersion(experimentId, version, userId);

    return this.updateExperiment(
      {
        id: experimentId,
        name: old.name,
        description: old.description ?? "",
        hypothesis: old.hypothesis ?? "",
        projectId: old.projectId,
        labels: old.labels,
        metricIds: old.metrics.map((metric) => metric.id),
        scenarios: old.scenarios.map(toScenarioInput),
      },
      userId,
      version
    );
  }

  public async getCollaborators(
    experimentId: string,
    userId: string
  ): Promise<Collaborator[]> {
    await this.ensureExperimentPermission(experimentId, userId, "read");

    const collaborators = await OrmExperimentUser.findAll({
      where: { experimentId },
      include: [
        {
          model: OrmUser,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    return collaborators.map((collaborator) => ({
      id: (collaborator.user as any)?.id ?? collaborator.userId!,
      name: (collaborator.user as any)?.name ?? "",
      email: (collaborator.user as any)?.email ?? "",
      role: collaborator.role!,
      permissions: permissionsOf({ role: collaborator.role!, canWrite: collaborator.canWrite, canExecute: collaborator.canExecute }),
    }));
  }

  public async removeCollaborator(
    experimentId: string,
    collaboratorId: string,
    userId: string
  ): Promise<void> {
    const transaction = await sequelize.transaction();

    try {
      const { experiment } = await this.ensureExperimentPermission(
        experimentId,
        userId,
        "manage",
        transaction
      );

      const collaborator = await OrmExperimentUser.findOne({
        where: {
          experimentId,
          userId: collaboratorId,
        },
        transaction,
      });

      if (!collaborator) {
        throw new NotFoundError("Collaborator not found.");
      }

      if (collaborator.role === ExperimentRoleEnum.OWNER) {
        throw new ConflictError("Owner cannot be removed.");
      }

      await collaborator.destroy({ transaction });

      await OrmExperimentHistory.create(
        {
          experimentId,
          experimentVersion: experiment.version,
          userId,
          eventType: "collaborator_removed",
          oldValue: { userId: collaboratorId, role: collaborator.role },
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

}
