import { Router } from "express";
import { hasLaboratoryAccess } from "./laboratoryAccess";
import RunUseCase from "../Domain/Laboratory/RunUseCase";
import { sendError } from "./sendError";

/** P2: runs of an experiment, under /experiments/:id/runs. */
const router = Router({ mergeParams: true });
const runUseCase = new RunUseCase();

export const RUNS_ROUTE = "/experiments/:id/runs";

// LAB-RUN-01, LAB-RUN-03: the run executes in the background; follow it with GET
router.post("/", hasLaboratoryAccess, async (req, res) => {
  try {
    res.status(202).json(await runUseCase.startRun(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "startRun", error);
  }
});

router.get("/", hasLaboratoryAccess, async (req, res) => {
  try {
    res.json(await runUseCase.listRuns(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "listRuns", error);
  }
});

// LAB-RP-02: the run with its provenance, scenario runs and attempts
router.get("/:runId", hasLaboratoryAccess, async (req, res) => {
  try {
    res.json(await runUseCase.getRun(req.params.id, req.params.runId, req.user?.id!));
  } catch (error) {
    sendError(res, "getRun", error);
  }
});

// LAB-RP-01
router.get("/:runId/package", hasLaboratoryAccess, async (req, res) => {
  try {
    const { file, sha256, persistentId } = await runUseCase.package(req.params.id, req.params.runId, req.user?.id!);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${persistentId}.zip"`);
    res.setHeader("X-Content-SHA256", sha256);
    res.send(file);
  } catch (error) {
    sendError(res, "getRunPackage", error);
  }
});

// LAB-RUN-04
router.post("/:runId/cancel", hasLaboratoryAccess, async (req, res) => {
  try {
    res.json(await runUseCase.cancelRun(req.params.id, req.params.runId, req.user?.id!));
  } catch (error) {
    sendError(res, "cancelRun", error);
  }
});

export default router;
