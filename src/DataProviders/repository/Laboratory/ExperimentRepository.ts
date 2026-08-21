import { Op, WhereOptions } from "sequelize";
import sequelize from "../../../DataProviders/dataBase/VariamosORM";

import { Experiment, OrmExperiment, ExperimentDetailed } from "../../../Domain/Laboratory/Entities/Experiment";
import { ExperimentRoleEnum, OrmExperimentUser, Collaborator } from "../../../Domain/Laboratory/Entities/ExperimentUser";
import { OrmScenario, Scenario } from "../../../Domain/Laboratory/Entities/Scenario";
import { OrmMetric, Metric } from "../../../Domain/Laboratory/Entities/Metric";
import { ExperimentFilter } from "../../../Domain/Laboratory/Entities/ExperimentFilter";
import { RequestModel } from "../../../Domain/Core/Entities/RequestModel";
import { ResponseModel } from "../../../Domain/Core/Entities/ResponseModel";
import { OrmExperimentMetric } from "../../../Domain/Laboratory/Entities/ExperimentMetric";
import { OrmUser } from "../../../Domain/Session/Entities/User";
import { ModelEntity, OrmModel } from "../../../Domain/ProductLineEngineering/Entities/Model";
import { Transaction } from "sequelize";
import { OrmExperimentHistory, ExperimentHistoryCreationAttributes } from "../../../Domain/Laboratory/Entities/ExperimentHistory";
import { ExperimentHistory } from "../../../Domain/Laboratory/Entities/ExperimentHistory";


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
        where,
        include,
        order: [["name", "ASC"]],
        limit: pageSize,
        offset:
          pageNumber && pageSize
            ? (pageNumber - 1) * pageSize
            : undefined,
      });

      response.totalCount = result.count;

      response.data = result.rows.map((row) => {
      const userRole = row.users?.find((user) => user.userId === userId)?.role ?? "viewer";
      return new Experiment(
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
  });

    } catch (error) {
      console.error("ExperimentRepository error:", error);
      response.withError(500, "Internal Server Error");
    }

    return response;
  }

  private buildNameFilter(filter: ExperimentFilter): WhereOptions {
    const where: WhereOptions = {};

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

  private async ensureExperimentPermission(
    experimentId: string,
    userId: string,
    allowedRoles: ExperimentRoleEnum[],
    transaction?: Transaction
  ): Promise<void> {
    const permission = await OrmExperimentUser.findOne({
      where: {
        experimentId,
        userId,
        role: allowedRoles,
      },
      transaction,
    });

    if (!permission) {
      throw new Error("You do not have permission to perform this action.");
    }
  }

  private async validatePublishExperiment(id: string): Promise<OrmExperiment> {
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
    });

    if (!experiment) {
        throw new Error("Experiment not found");
    }

    if (!experiment.scenarios || experiment.scenarios.length === 0) {
        throw new Error("An experiment must contain at least one scenario before publishing");
    }

    if (!experiment.metrics || experiment.metrics.length === 0) {
        throw new Error("An experiment must contain at least one metric before publishing");
    }

    return experiment;
  }

  async getUserExperiments(
    request: RequestModel<ExperimentFilter>
  ): Promise<ResponseModel<Experiment[]>> {

    const { data: filter = new ExperimentFilter() } = request;

    const where = {
      ...this.buildNameFilter(filter),
      status: {
        [Op.ne]: "archived",
      },
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
      status: {
        [Op.ne]: "archived",
      },
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
      status: {
        [Op.ne]: "archived",
      },
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
      this.buildUserInclude(filter.userId!, ["owner"])
    );
  }

  
  async getExperimentDetailed( id: string, userId: string ): Promise<ExperimentDetailed | null> {

      await this.ensureExperimentPermission(
        id,
        userId,
        [ExperimentRoleEnum.VIEWER, ExperimentRoleEnum.EDITOR, ExperimentRoleEnum.DIRECTOR, ExperimentRoleEnum.OWNER]
      );

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
              model: OrmModel,
              as: "model",
            },
          ],
        },
        {
          model: OrmMetric,
          as: "metrics",
        },
      ],
    });

    const userRole = ormExperiment?.users?.find( (user) => user.userId === userId)?.role ?? ExperimentRoleEnum.VIEWER;

    if (!ormExperiment) {
      return null;
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

    experiment.scenarios = (ormExperiment.scenarios ?? []).map(
      (scenario) =>
        new Scenario(
          scenario.id,
          scenario.experimentId,
          scenario.modelId,
          scenario.model 
            ? ModelEntity.fromOrm(scenario.model)
            : undefined,
          scenario.solverConfig,
        )
    );

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

    experiment.author = owner?.user?.name ?? "";

    console.log("Experiment detailed:", experiment); 
    return experiment;
  }

  async saveExperiment(experiment: ExperimentDetailed, userId: string) {
    if (!experiment.name?.trim()) {
      throw new Error("Experiment name is required.");
    }
    const transaction = await sequelize.transaction();
    console.log("Saving experiment:", experiment);
    try {
      const createdExperiment = await OrmExperiment.create(
        {
          id: experiment.id,
          name: experiment.name,
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          version: experiment.version,
          labels: experiment.labels,
          status: experiment.status,
          isTemplate: experiment.isTemplate,
          isBenchmark: experiment.isBenchmark,
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

      if (experiment.scenarios?.length) {
        await OrmScenario.bulkCreate(
          experiment.scenarios.map((scenario) => ({
            id: scenario.id,
            experimentId,
            modelId: scenario.modelId,
            solverConfig: scenario.solverConfig,
          })),
          { transaction }
        );
      }

      if (experiment.metrics?.length) {
        await OrmExperimentMetric.bulkCreate(
          experiment.metrics.map((metric) => ({
            experimentId,
            metricId: metric.id,
          })),
          { transaction }
        );
      }

      await OrmExperimentHistory.create(
        {
          experimentId,
          experimentVersion: 1,
          userId,
          eventType: "experiment_created",
          newValue: {
            name: experiment.name,
            description: experiment.description,
            hypothesis: experiment.hypothesis,
            labels: experiment.labels,
            metrics: experiment.metrics?.map((m) => m.id) ?? [],
            scenarios:
              experiment.scenarios?.map((s) => ({
                id: s.id,
                modelId: s.modelId,
                solverConfig: s.solverConfig,
              })) ?? [],
            status: experiment.status,
            isTemplate: experiment.isTemplate,
            isBenchmark: experiment.isBenchmark,
          },
        },
        { transaction }
      );

      await transaction.commit();

      return this.getExperimentDetailed(experimentId, userId);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async updateExperiment(experiment: ExperimentDetailed, userId: string): Promise<ExperimentDetailed | null> {
    const transaction = await sequelize.transaction();

    try {
      await this.ensureExperimentPermission(
        experiment.id,
        userId,
        [
          ExperimentRoleEnum.OWNER,
          ExperimentRoleEnum.DIRECTOR,
          ExperimentRoleEnum.EDITOR,
        ],
        transaction
      );

      const previousExperiment = await this.getExperimentDetailed(
        experiment.id,
        userId
      );

      if (!previousExperiment) {
        throw new Error("Experiment not found.");
      }

      const nextVersion = previousExperiment.version + 1;

      const history: ExperimentHistoryCreationAttributes[] = [];

      // Experiment fields

      if (previousExperiment.name !== experiment.name) {
        history.push({
          experimentId: experiment.id,
          experimentVersion: nextVersion,
          userId,
          eventType: "name_updated",
          oldValue: previousExperiment.name,
          newValue: experiment.name,
        });
      }

      if (
        previousExperiment.description !== experiment.description
      ) {
        history.push({
          experimentId: experiment.id,
          experimentVersion: nextVersion,
          userId,
          eventType: "description_updated",
          oldValue: previousExperiment.description,
          newValue: experiment.description,
        });
      }

      if (
        previousExperiment.hypothesis !== experiment.hypothesis
      ) {
        history.push({
          experimentId: experiment.id,
          experimentVersion: nextVersion,
          userId,
          eventType: "hypothesis_updated",
          oldValue: previousExperiment.hypothesis,
          newValue: experiment.hypothesis,
        });
      }

      if (
        JSON.stringify(
          [...(previousExperiment.labels ?? [])].sort()
        ) !==
        JSON.stringify(
          [...(experiment.labels ?? [])].sort()
        )
      ) {
        history.push({
          experimentId: experiment.id,
          experimentVersion: nextVersion,
          userId,
          eventType: "labels_updated",
          oldValue: previousExperiment.labels,
          newValue: experiment.labels,
        });
      }

      // Metrics

      const previousMetricIds = previousExperiment.metrics
        .map((m) => m.id)
        .sort();

      const currentMetricIds = experiment.metrics
        .map((m) => m.id)
        .sort();

      if (
        JSON.stringify(previousMetricIds) !==
        JSON.stringify(currentMetricIds)
      ) {
        history.push({
          experimentId: experiment.id,
          experimentVersion: nextVersion,
          userId,
          eventType: "metrics_updated",
          oldValue: previousMetricIds,
          newValue: currentMetricIds,
        });
      }
      // Scenarios

      const previousScenarioIds = previousExperiment.scenarios.map(
        (s) => s.id
      );

      const currentScenarioIds = experiment.scenarios.map(
        (s) => s.id
      );
      
      console.log("Previous", previousExperiment.scenarios.map(s => s.id));
      console.log("Current", experiment.scenarios.map(s => s.id));

      const addedScenarios = currentScenarioIds.filter(
        (id) => !previousScenarioIds.includes(id)
      );

      const removedScenarios = previousScenarioIds.filter(
        (id) => !currentScenarioIds.includes(id)
      );

      for (const scenarioId of addedScenarios) {
        const scenario = experiment.scenarios.find(
          (s) => s.id === scenarioId
        );

        history.push({
          experimentId: experiment.id,
          scenarioId,
          experimentVersion: nextVersion,
          userId,
          eventType: "scenario_added",
          newValue: {
            modelId: scenario?.modelId,
            solverConfig: scenario?.solverConfig,
          },
        });
      }

      for (const scenarioId of removedScenarios) {
        const scenario = previousExperiment.scenarios.find(
          (s) => s.id === scenarioId
        );

        history.push({
          experimentId: experiment.id,
          scenarioId,
          experimentVersion: nextVersion,
          userId,
          eventType: "scenario_removed",
          oldValue: {
            modelId: scenario?.modelId,
            solverConfig: scenario?.solverConfig,
          },
        });
      }

      for (const scenario of experiment.scenarios) {
        const previousScenario =
          previousExperiment.scenarios.find(
            (s) => s.id === scenario.id
          );

        if (!previousScenario) {
          continue;
        }

        if (
          previousScenario.modelId !== scenario.modelId
        ) {
          history.push({
            experimentId: experiment.id,
            scenarioId: scenario.id,
            experimentVersion: nextVersion,
            userId,
            eventType: "scenario_model_updated",
            oldValue: previousScenario.modelId,
            newValue: scenario.modelId,
          });
        }

        if (
          JSON.stringify(previousScenario.solverConfig) !==
          JSON.stringify(scenario.solverConfig)
        ) {
          history.push({
            experimentId: experiment.id,
            scenarioId: scenario.id,
            experimentVersion: nextVersion,
            userId,
            eventType: "scenario_solver_config_updated",
            oldValue: previousScenario.solverConfig,
            newValue: scenario.solverConfig,
          });
        }
      }

      // Update experiment

      const [updated] = await OrmExperiment.update(
        {
          name: experiment.name,
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          version: nextVersion,
          labels: experiment.labels,
          status: experiment.status,
          isTemplate: experiment.isTemplate,
          isBenchmark: experiment.isBenchmark,
        },
        {
          where: {
            id: experiment.id,
          },
          transaction,
        }
      );

      if (updated === 0) {
        throw new Error("Experiment not found.");
      }

      // Delete removed scenarios
      await OrmScenario.destroy({
        where: {
          experimentId: experiment.id,
          id: {
            [Op.in]: previousScenarioIds.filter(
              id => !currentScenarioIds.includes(id)
            ),
          },
        },
        transaction,
      });

      // Update existing scenarios / Create new ones
      for (const scenario of experiment.scenarios) {
        console.log(
          scenario.id,
          previousScenarioIds.includes(scenario.id)
        );
        const exists = previousScenarioIds.includes(scenario.id);

        if (exists) {
          await OrmScenario.update(
            {
              modelId: scenario.modelId,
              solverConfig: scenario.solverConfig,
            },
            {
              where: {
                id: scenario.id,
              },
              transaction,
            }
          );
        } else {
          await OrmScenario.create(
            {
              id: scenario.id,
              experimentId: experiment.id,
              modelId: scenario.modelId,
              solverConfig: scenario.solverConfig,
            },
            { transaction }
          );
        }
      }

      // Replace metrics

      await OrmExperimentMetric.destroy({
        where: {
          experimentId: experiment.id,
        },
        transaction,
      });

      if (experiment.metrics.length > 0) {
        await OrmExperimentMetric.bulkCreate(
          experiment.metrics.map((metric) => ({
            experimentId: experiment.id,
            metricId: metric.id,
          })),
          { transaction }
        );
      }

      // Save history

      if (history.length > 0) {
        await OrmExperimentHistory.bulkCreate(history, {
          transaction,
        });
      }

      await transaction.commit();

      return this.getExperimentDetailed(
        experiment.id,
        userId
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteExperiment(id: string, userId: string) {
    const transaction = await sequelize.transaction();

    try {
      await this.ensureExperimentPermission(
        id,
        userId,
        [ExperimentRoleEnum.OWNER],
        transaction
      );

      await OrmExperimentUser.destroy({
        where: {
          experimentId: id,
        },
        transaction,
      });

      await OrmScenario.destroy({
        where: {
          experimentId: id,
        },
        transaction,
      });

      await OrmExperimentMetric.destroy({
        where: {
          experimentId: id,
        },
        transaction,
      });

      const deleted = await OrmExperiment.destroy({
        where: {
          id,
        },
        transaction,
      });

      if (deleted === 0) {
        throw new Error("Experiment not found.");
      }

      await transaction.commit();

      return true;

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async archiveExperiment(id: string, userId: string) {
    const transaction = await sequelize.transaction();

    try {
      await this.ensureExperimentPermission(
        id,
        userId,
        [ExperimentRoleEnum.OWNER],
        transaction
      );

      const [updated] = await OrmExperiment.update(
        {
          status: "archived",
        },
        {
          where: {
            id,
          },
          transaction,
        }
      );

    if (updated === 0) {
      throw new Error("Experiment not found.");
    }
    await transaction.commit();

    return this.getExperimentDetailed(id, userId);
  }
  catch (error) {
    await transaction.rollback();
    throw error;
  }
}

  async restoreExperiment(id: string, userId: string) {
    const transaction = await sequelize.transaction();

    try {
      await this.ensureExperimentPermission(
        id,
        userId,
        [ExperimentRoleEnum.OWNER],
        transaction
      );

      const [updated] = await OrmExperiment.update(
        {
        status: "draft",
        },
        {
          where: {
            id,
          },
          transaction,
        }
      );
      
      if (updated === 0) {
        throw new Error("Experiment not found.");
      }
    }
    catch (error) {
      await transaction.rollback();
      throw error;
    }
    await transaction.commit();
    return this.getExperimentDetailed(id, userId);
  }

  async shareExperiment(
    experimentId: string,
    userEmail: string,
    role: ExperimentRoleEnum,
    userId: string
  ) {
    const transaction = await sequelize.transaction();

    try {
      await this.ensureExperimentPermission(
        experimentId,
        userId,
        [ExperimentRoleEnum.OWNER, ExperimentRoleEnum.DIRECTOR],
        transaction
      );

      if (
        role === ExperimentRoleEnum.OWNER ||
        role === ExperimentRoleEnum.DIRECTOR
      ) {
        throw new Error(
          "Owner and Director roles cannot be assigned through sharing."
        );
      }

      const user = await OrmUser.findOne({
        where: {
          email: userEmail,
        },
        transaction,
      });

      if (!user) {
        throw new Error("User not found.");
      }

      const existingPermission = await OrmExperimentUser.findOne({
        where: {
          experimentId,
          userId: user.getDataValue("id"),
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
        throw new Error(
          "Owner and Director roles cannot be modified."
        );
      }

      await OrmExperimentUser.upsert(
        {
          experimentId,
          userId: user.getDataValue("id"),
          role,
        },
        {
          transaction,
        }
      );

      await transaction.commit();

      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async copyExperiment( experimentId: string, userId: string ) {
    const transaction = await sequelize.transaction();

    try {
      await this.ensureExperimentPermission(
        experimentId,
        userId,
        [ExperimentRoleEnum.OWNER, ExperimentRoleEnum.DIRECTOR, ExperimentRoleEnum.EDITOR, ExperimentRoleEnum.VIEWER],
        transaction
      );
      const source = await this.getExperimentDetailed(experimentId, userId);

      if (!source) {
        throw new Error("Experiment not found.");
      }

      const newExperiment = await OrmExperiment.create(
        {
          name: `${source.name} (copy)`,
          description: source.description,
          hypothesis: source.hypothesis,
          version: 1,
          labels: source.labels,
          status: "draft",
          isTemplate: false,
          isBenchmark: false,
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


      // Copy scenarios
      const createdScenarios =
        source.scenarios.length > 0
          ? await OrmScenario.bulkCreate(
              source.scenarios.map(scenario => ({
                experimentId: newExperiment.id!,
                modelId: scenario.modelId,
                solverConfig: scenario.solverConfig,
              })),
              {
                transaction,
                returning: true,
              }
            )
          : [];


      if (source.metrics.length > 0) {
        await OrmExperimentMetric.bulkCreate(
          source.metrics.map((metric) => ({
            experimentId: newExperiment.id!,
            metricId: metric.id,
          })),
          {
            transaction,
          }
        );
      }

      await OrmExperimentHistory.create(
      {
        experimentId: newExperiment.id,
        experimentVersion: 1,
        userId,
        eventType: "experiment_copied",
        oldValue: {
          sourceExperimentId: source.id,
        },
        newValue: {
          name: newExperiment.name,
          description: source.description,
          hypothesis: source.hypothesis,
          labels: source.labels,
          metrics: source.metrics.map(m => ({
            id: m.id,
            name: m.name,
            formula: m.formula,
            unit: m.unit,
            script: m.script,
            description: m.description,
            userId: m.userId,
          })),
          scenarios: createdScenarios.map(s => ({
            id: s.id,
            modelId: s.modelId,
            solverConfig: s.solverConfig,
          })),
          status: "draft",
          isTemplate: false,
          isBenchmark: false,
        },
      },
      { transaction }
    );

      await transaction.commit();

      return this.getExperimentDetailed(newExperiment.id!, userId);

    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
    
  async publishAsTemplate(
      id: string,
      userId: string
    ): Promise<Experiment | null> {

      await this.ensureExperimentPermission(
          id,
          userId,
          [ExperimentRoleEnum.OWNER]
      );

      const experiment = await this.validatePublishExperiment(id);

      experiment.isTemplate = true;
      experiment.isBenchmark = false;

      await experiment.save();

      return this.getExperimentDetailed(id, userId);
  }

  async publishAsBenchmark(
      id: string,
      userId: string
  ): Promise<Experiment | null> {

      await this.ensureExperimentPermission(
          id,
          userId,
          [ExperimentRoleEnum.OWNER]
      );

      const experiment = await this.validatePublishExperiment(id);

      experiment.isTemplate = false;
      experiment.isBenchmark = true;

      await experiment.save();

      return this.getExperimentDetailed(id, userId);
  }

  async getExperimentHistory(
    experimentId: string,
    userId: string
  ): Promise<ExperimentHistory[]> {
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
      userName: row.user?.name ?? "Unknown User",
      experimentVersion: row.experimentVersion,
      eventType: row.eventType,
      oldValue: row.oldValue,
      newValue: row.newValue,
      createdAt: row.createdAt,
    }));
  }

  async getExperimentVersion(
    experimentId: string,
    version: number
  ): Promise<ExperimentDetailed> {

    const history = await OrmExperimentHistory.findAll({
      where: {
        experimentId,
        experimentVersion: {
          [Op.lte]: version,
        },
      },
      order: [
        ["experimentVersion", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    const snapshotEvent = history.find(
      h =>
        h.eventType === "experiment_created" ||
        h.eventType === "experiment_copied"
    );

    if (!snapshotEvent?.newValue) {
      throw new Error("No snapshot found");
    }

    const snapshot = structuredClone(snapshotEvent.newValue);

    for (const event of history) {

      switch (event.eventType) {

        case "name_updated":
          snapshot.name = event.newValue;
          break;

        case "description_updated":
          snapshot.description = event.newValue;
          break;

        case "hypothesis_updated":
          snapshot.hypothesis = event.newValue;
          break;

        case "labels_updated":
          snapshot.labels = event.newValue;
          break;

        case "metrics_updated":
          snapshot.metrics = event.newValue;
          break;

        case "scenario_added":
          snapshot.scenarios.push({
            id: event.scenarioId,
            ...event.newValue,
          });
          break;

        case "scenario_removed":
          snapshot.scenarios = snapshot.scenarios.filter(
            (s: any) => s.id !== event.scenarioId
          );
          break;

        case "scenario_model_updated": {
          const scenario = snapshot.scenarios.find(
            (s: any) => s.id === event.scenarioId
          );

          if (scenario) {
            scenario.modelId = event.newValue;
          }
          break;
        }

        case "scenario_solver_config_updated": {
          const scenario = snapshot.scenarios.find(
            (s: any) => s.id === event.scenarioId
          );

          if (scenario) {
            scenario.solverConfig = event.newValue;
          }
          break;
        }
      }
    }

    const experiment = new ExperimentDetailed(
      experimentId,
      snapshot.name,
      version,
      snapshot.labels ?? [],
      snapshot.status,
      ExperimentRoleEnum.VIEWER,
      snapshot.isTemplate,
      snapshot.isBenchmark,
      snapshot.description,
      snapshot.hypothesis,
      new Date(),
      new Date()
    );

  experiment.scenarios = (snapshot.scenarios ?? []).map(
    (scenario: any) =>
      new Scenario(
        scenario.id,
        experimentId,
        scenario.modelId,
        scenario.model
          ? ModelEntity.fromOrm(scenario.model)
          : undefined,
        scenario.solverConfig
      )
  );

  experiment.metrics = (snapshot.metrics ?? []).map(
    (metric: any) =>
      new Metric(
        metric.id,
        metric.name,
        metric.formula,
        metric.unit,
        metric.script,
        metric.description,
        metric.userId
      )
  );

  experiment.author = snapshot.author ?? "";
  experiment.userRole = ExperimentRoleEnum.VIEWER;

  return experiment;
}

  public async getCollaborators(
    experimentId: string,
    userId: string
  ): Promise<Collaborator[]> {
    await this.ensureExperimentPermission(
      experimentId,
      userId,
      [
        ExperimentRoleEnum.OWNER,
        ExperimentRoleEnum.DIRECTOR,
        ExperimentRoleEnum.EDITOR,
        ExperimentRoleEnum.VIEWER,
      ]
    );

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
      id: collaborator.user!.id,
      name: collaborator.user!.name,
      email: collaborator.user!.email,
      role: collaborator.role!,
    }));
  }

  public async removeCollaborator(
    experimentId: string,
    collaboratorId: string,
    userId: string
  ): Promise<void> {
    await this.ensureExperimentPermission(
      experimentId,
      userId,
      [
        ExperimentRoleEnum.OWNER,
        ExperimentRoleEnum.DIRECTOR,
      ]
    );

    const collaborator = await OrmExperimentUser.findOne({
      where: {
        experimentId,
        userId: collaboratorId,
      },
    });

    if (!collaborator) {
      throw new Error("Collaborator not found.");
    }

    if (collaborator.role === ExperimentRoleEnum.OWNER) {
      throw new Error("Owner cannot be removed.");
    }

    await collaborator.destroy();
  }

}