import { Request, Router } from "express";
import { isAuthenticated } from "@variamosple/variamos-security";
import RunUseCase from "../Domain/Laboratory/RunUseCase";
import { ExportFormat } from "../Domain/Results/results";
import { ValidationError } from "../Domain/Core/Entities/Errors";
import { sendError } from "./sendError";

/** P3: results of the runs of an experiment, under /experiments/:id. */
const router = Router({ mergeParams: true });
const runUseCase = new RunUseCase();

export const RESULTS_ROUTE = "/experiments/:id";

/** ?runId=a&runId=b: the runs to use; all of them when absent. */
const runIdsOf = (req: Request): string[] => {
  const value = req.query.runId;
  return (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(String);
};

// LAB-MT-04, LAB-VIS-01, LAB-VIS-02
router.get("/results", isAuthenticated, async (req, res) => {
  try {
    res.json(await runUseCase.results(req.params.id, req.user?.id!, runIdsOf(req)));
  } catch (error) {
    sendError(res, "getResults", error);
  }
});

// LAB-MT-05
router.get("/export", isAuthenticated, async (req, res) => {
  try {
    const format = String(req.query.format ?? "");
    if (!["csv", "json", "xlsx"].includes(format)) {
      throw new ValidationError("The format must be csv, json or xlsx.");
    }
    const file = await runUseCase.export(req.params.id, req.user?.id!, runIdsOf(req), format as ExportFormat);
    const name = `${file.experimentName.replace(/[^\w.-]+/g, "_").slice(0, 60) || "experiment"}-results.${file.extension}`;
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(file.body);
  } catch (error) {
    sendError(res, "exportResults", error);
  }
});

// LAB-MT-06
router.get("/benchmark", isAuthenticated, async (req, res) => {
  try {
    res.json(await runUseCase.benchmark(req.params.id, req.user?.id!, runIdsOf(req)));
  } catch (error) {
    sendError(res, "getBenchmark", error);
  }
});

export default router;
