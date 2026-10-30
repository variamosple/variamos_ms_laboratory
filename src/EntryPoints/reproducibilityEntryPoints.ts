import express, { Router } from "express";
import { hasLaboratoryAccess } from "./laboratoryAccess";
import RunUseCase from "../Domain/Laboratory/RunUseCase";
import { sendError } from "./sendError";

const runUseCase = new RunUseCase();

/** P4: runs by persistent id (LAB-RP-03) and side by side (LAB-RP-04). */
export const runsByReferenceRouter = Router();
export const RUNS_BY_REFERENCE_ROUTE = "/runs";

// ?runId=a&runId=b: ids or persistent ids, of one experiment or several
runsByReferenceRouter.get("/compare", hasLaboratoryAccess, async (req, res) => {
  try {
    const value = req.query.runId;
    const references = (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(String);
    res.json(await runUseCase.compare(references, req.user?.id!));
  } catch (error) {
    sendError(res, "compareRuns", error);
  }
});

runsByReferenceRouter.get("/:persistentId", hasLaboratoryAccess, async (req, res) => {
  try {
    res.json(await runUseCase.resolve(req.params.persistentId, req.user?.id!));
  } catch (error) {
    sendError(res, "resolveRun", error);
  }
});

/** P4: an experiment rebuilt from a reproducibility package (LAB-RP-01). */
export const reproductionsRouter = Router();
export const REPRODUCTIONS_ROUTE = "/reproductions";

reproductionsRouter.post("/", hasLaboratoryAccess, express.raw({ type: ["application/zip", "application/octet-stream"], limit: "60mb" }), async (req, res) => {
  try {
    const file = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(await runUseCase.reproduce(file, String(req.query.projectId ?? ""), req.user?.id!));
  } catch (error) {
    sendError(res, "reproduceRun", error);
  }
});
