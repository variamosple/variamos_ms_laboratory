import { Request, Response, Router } from "express";
import ExperimentUseCase from "../Domain/Laboratory/ExperimentUseCase";
import { isAuthenticated } from "@variamosple/variamos-security";
import { Experiment } from "../Domain/Laboratory/Entities/Experiment";
import { ExperimentFilter } from "../Domain/Laboratory/Entities/ExperimentFilter";

import { RequestModel } from "../Domain/Core/Entities/RequestModel";
import { ResponseModel } from "../Domain/Core/Entities/ResponseModel";
import { sendError } from "./sendError";

const router = Router();
const experimentUseCase = new ExperimentUseCase();

export const EXPERIMENTS_ROUTE = "/experiments";

const positiveInt = (value: unknown): number | undefined => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/** Paged list of experiments for the signed-in user, filtered by name and project. */
const listRoute =
  (
    transactionId: string,
    query: (request: RequestModel<ExperimentFilter>) => Promise<ResponseModel<Experiment[]>>
  ) =>
  async (req: Request, res: Response) => {
    const { pageNumber, pageSize, name, projectId, researcher, status, createdFrom, createdTo, type } = req.query;
    const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

    try {
      const filter = ExperimentFilter.builder()
        .setUserId(req.user?.id!)
        .setName(typeof name === "string" ? name : "")
        .setPageNumber(positiveInt(pageNumber)!)
        .setPageSize(positiveInt(pageSize)!)
        .setProjectId(text(projectId))
        .setFilters({
          researcher: text(researcher),
          status: text(status),
          createdFrom: text(createdFrom) && !Number.isNaN(Date.parse(String(createdFrom))) ? String(createdFrom) : undefined,
          createdTo: text(createdTo) && !Number.isNaN(Date.parse(String(createdTo))) ? String(createdTo) : undefined,
          type: ["experiment", "template", "benchmark"].includes(String(type)) ? (type as any) : undefined,
        })
        .build();

      const response = await query(new RequestModel<ExperimentFilter>(transactionId, filter));

      res.status(response.errorCode || 200).json(response);
    } catch (error) {
      sendError(res, transactionId, error);
    }
  };

router.get("/", isAuthenticated, listRoute("getUserExperiments", (r) => experimentUseCase.getUserExperiments(r)));
router.get("/shared", isAuthenticated, listRoute("getSharedExperiments", (r) => experimentUseCase.getSharedExperiments(r)));
router.get("/groups", isAuthenticated, listRoute("getGroupExperiments", (r) => experimentUseCase.getGroupExperiments(r)));
router.get("/templates", isAuthenticated, listRoute("getTemplateExperiments", (r) => experimentUseCase.getTemplateExperiments(r)));
router.get("/benchmarks", isAuthenticated, listRoute("getTemplateBenchmarks", (r) => experimentUseCase.getTemplateBenchmarks(r)));
router.get("/archived", isAuthenticated, listRoute("getArchivedExperiments", (r) => experimentUseCase.getArchivedExperiments(r)));

router.post("/", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json(await experimentUseCase.saveExperiment(req.body ?? {}, req.user?.id!));
  } catch (error) {
    sendError(res, "createExperiment", error);
  }
});

router.get("/:id/detailed", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.getExperimentDetailed(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "getExperimentDetailed", error);
  }
});

/** LAB-EX-07: Draft -> Ready, with the validation of LAB-RUN-01. */
router.put("/:id/ready", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.markReady(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "markExperimentReady", error);
  }
});

router.put("/:id/archive", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.archiveExperiment(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "archiveExperiment", error);
  }
});

router.put("/:id/restore", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.restoreExperiment(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "restoreExperiment", error);
  }
});

router.put("/:id", isAuthenticated, async (req, res) => {
  try {
    const experiment = { ...(req.body ?? {}), id: req.params.id };
    res.status(200).json(await experimentUseCase.updateExperiment(experiment, req.user?.id!));
  } catch (error) {
    sendError(res, "updateExperiment", error);
  }
});

router.post("/:id/share", isAuthenticated, async (req, res) => {
  try {
    const { userEmail, role, permissions } = req.body ?? {};
    res.status(200).json(
      await experimentUseCase.shareExperiment(
        req.params.id,
        userEmail,
        role,
        req.user?.id!,
        permissions && typeof permissions === "object" ? { write: permissions.write === true, execute: permissions.execute === true } : undefined
      )
    );
  } catch (error) {
    sendError(res, "shareExperiment", error);
  }
});

router.post("/:id/copy", isAuthenticated, async (req, res) => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
    res.status(201).json(await experimentUseCase.copyExperiment(req.params.id, req.user?.id!, projectId));
  } catch (error) {
    sendError(res, "copyExperiment", error);
  }
});

router.post("/:id/publish/template", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.publishAsTemplate(req.params.id, req.user!.id));
  } catch (error) {
    sendError(res, "publishAsTemplate", error);
  }
});

router.post("/:id/publish/benchmark", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.publishAsBenchmark(req.params.id, req.user!.id));
  } catch (error) {
    sendError(res, "publishAsBenchmark", error);
  }
});

/** LAB-EX-05: logical deletion; an experiment with completed executions is archived instead. */
router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    const result = await experimentUseCase.deleteExperiment(req.params.id, req.user?.id!);
    res.status(200).json({
      result,
      message: result === "archived"
        ? "The experiment has completed executions: it was archived instead of deleted."
        : "Experiment deleted successfully.",
    });
  } catch (error) {
    sendError(res, "deleteExperiment", error);
  }
});

router.get("/:id/history", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.getExperimentHistory(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "getExperimentHistory", error);
  }
});

router.get("/:id/version/:version", isAuthenticated, async (req, res) => {
  try {
    const version = Number.parseInt(req.params.version, 10);
    res.status(200).json(
      await experimentUseCase.getExperimentVersion(req.params.id, version, req.user?.id!)
    );
  } catch (error) {
    sendError(res, "getExperimentVersion", error);
  }
});

router.post("/:id/version/:version/restore", isAuthenticated, async (req, res) => {
  try {
    const version = Number.parseInt(req.params.version, 10);
    res.status(200).json(
      await experimentUseCase.restoreExperimentVersion(req.params.id, version, req.user?.id!)
    );
  } catch (error) {
    sendError(res, "restoreExperimentVersion", error);
  }
});

router.get("/:id/collaborators", isAuthenticated, async (req, res) => {
  try {
    res.status(200).json(await experimentUseCase.getCollaborators(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "getCollaborators", error);
  }
});

router.delete("/:id/collaborators/:collaboratorId", isAuthenticated, async (req, res) => {
  try {
    await experimentUseCase.removeCollaborator(req.params.id, req.params.collaboratorId, req.user?.id!);
    res.status(200).json({ message: "Collaborator removed successfully." });
  } catch (error) {
    sendError(res, "removeCollaborator", error);
  }
});

export default router;
