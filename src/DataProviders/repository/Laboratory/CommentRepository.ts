import { randomUUID } from "crypto";
import { OrmComment, CommentTargetType, CommentView } from "../../../Domain/Laboratory/Entities/Comment";
import { OrmScenario } from "../../../Domain/Laboratory/Entities/Scenario";
import { OrmRun, OrmScenarioRun } from "../../../Domain/Laboratory/Entities/Run";
import { OrmUser } from "../../../Domain/Session/Entities/User";
import { ForbiddenError, NotFoundError, ValidationError } from "../../../Domain/Core/Entities/Errors";
import ExperimentRepository from "./ExperimentRepository";

const TARGETS: CommentTargetType[] = ["experiment", "scenario", "run", "scenario_run"];
const MAX_LENGTH = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CommentInput {
  targetType?: string;
  targetId?: string;
  metricId?: string | null;
  body?: string;
}

/**
 * LAB-COL-03: comments and annotations on an experiment, its scenarios, its
 * runs and the results of its scenario runs. Everyone who can read the
 * experiment reads and writes them; the author edits; the author, the owner
 * and the director delete.
 */
export default class CommentRepository {
  private readonly experiments = new ExperimentRepository();

  async list(experimentId: string, userId: string): Promise<CommentView[]> {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "read", undefined, true);
    const comments = await OrmComment.findAll({ where: { experimentId }, order: [["createdAt", "ASC"]] });
    return this.views(comments);
  }

  async add(experimentId: string, input: CommentInput, userId: string): Promise<CommentView> {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "read", undefined, true);
    const body = this.bodyOf(input.body);
    const targetType = input.targetType as CommentTargetType;
    if (!TARGETS.includes(targetType)) throw new ValidationError(`A comment is about one of: ${TARGETS.join(", ")}.`);
    const targetId = String(input.targetId ?? "");
    const targetLabel = await this.labelOf(experimentId, targetType, targetId, input.metricId ?? null);

    const comment = await OrmComment.create({
      id: randomUUID(),
      experimentId,
      targetType,
      targetId,
      metricId: input.metricId ?? null,
      targetLabel,
      body,
      author: userId,
    });
    return (await this.views([comment]))[0];
  }

  async edit(experimentId: string, commentId: string, input: CommentInput, userId: string): Promise<CommentView> {
    const comment = await this.find(experimentId, commentId, userId);
    if (comment.author !== userId) throw new ForbiddenError("Only the author can edit a comment.");
    if (comment.deletedAt) throw new NotFoundError("Comment not found.");
    await comment.update({ body: this.bodyOf(input.body), editedAt: new Date() });
    return (await this.views([comment]))[0];
  }

  async remove(experimentId: string, commentId: string, userId: string): Promise<CommentView> {
    const comment = await this.find(experimentId, commentId, userId);
    if (comment.author !== userId) {
      // The owner and the director moderate the discussion
      await this.experiments.ensureExperimentPermission(experimentId, userId, "manage");
    }
    if (!comment.deletedAt) await comment.update({ deletedAt: new Date(), deletedBy: userId });
    return (await this.views([comment]))[0];
  }

  private async find(experimentId: string, commentId: string, userId: string) {
    await this.experiments.ensureExperimentPermission(experimentId, userId, "read", undefined, true);
    const comment = UUID_PATTERN.test(commentId) ? await OrmComment.findOne({ where: { id: commentId, experimentId } }) : null;
    if (!comment) throw new NotFoundError("Comment not found.");
    return comment;
  }

  private bodyOf(body: unknown): string {
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) throw new ValidationError("A comment cannot be empty.");
    if (text.length > MAX_LENGTH) throw new ValidationError(`A comment has at most ${MAX_LENGTH} characters.`);
    return text;
  }

  /** The element must belong to the experiment; its label is kept with the comment. */
  private async labelOf(experimentId: string, type: CommentTargetType, targetId: string, metricId: string | null): Promise<string> {
    const unknown = () => new ValidationError(`The ${type.replace("_", " ")} is not part of this experiment.`);
    if (metricId !== null && type !== "scenario_run") throw new ValidationError("Only the result of a scenario run can be annotated per metric.");

    switch (type) {
      case "experiment":
        if (targetId !== experimentId) throw unknown();
        return "Experiment";
      case "scenario": {
        const scenario = UUID_PATTERN.test(targetId) ? await OrmScenario.findOne({ where: { id: targetId, experimentId } }) : null;
        if (!scenario) throw unknown();
        return `Scenario ${scenario.name ?? ""}`.trim();
      }
      case "run": {
        const run = UUID_PATTERN.test(targetId) ? await OrmRun.findOne({ where: { id: targetId, experimentId } }) : null;
        if (!run) throw unknown();
        return `Run ${run.number}`;
      }
      case "scenario_run": {
        const scenarioRun = UUID_PATTERN.test(targetId) ? await OrmScenarioRun.findByPk(targetId) : null;
        const run = scenarioRun ? await OrmRun.findOne({ where: { id: scenarioRun.runId, experimentId } }) : null;
        if (!scenarioRun || !run) throw unknown();
        let label = `Run ${run.number} · ${scenarioRun.scenarioName} · ${scenarioRun.solverId}`;
        if (metricId !== null) {
          const metric = run.provenance.metrics.find((m) => m.id === metricId);
          if (!metric) throw new ValidationError("This metric is not part of the run.");
          label += ` · ${metric.name}`;
        }
        return label;
      }
    }
  }

  private async views(comments: OrmComment[]): Promise<CommentView[]> {
    const names = new Map(
      (await OrmUser.findAll({ where: { id: [...new Set(comments.map((c) => c.author))] }, attributes: ["id", "name"] })).map((u: any) => [u.id, u.name as string])
    );
    return comments.map((c) => ({
      id: c.id,
      targetType: c.targetType,
      targetId: c.targetId,
      metricId: c.metricId ?? null,
      targetLabel: c.targetLabel,
      body: c.deletedAt ? null : c.body,
      author: c.author,
      authorName: names.get(c.author) ?? null,
      createdAt: c.createdAt ?? null,
      editedAt: c.editedAt ?? null,
      deleted: !!c.deletedAt,
    }));
  }
}
