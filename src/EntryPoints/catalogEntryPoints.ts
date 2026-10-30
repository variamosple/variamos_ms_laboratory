import { Router } from "express";
import { hasLaboratoryAccess } from "./laboratoryAccess";
import { getReasoningGateway } from "../Domain/Reasoning/ReasoningGateway";
import { sendError } from "./sendError";

const router = Router();

export const CATALOG_ROUTE = "/catalog";

/** LAB-CF-02: solvers offered by the Reasoning module, with versions and parameters. */
router.get("/solvers", hasLaboratoryAccess, async (_req, res) => {
  try {
    res.status(200).json(await getReasoningGateway().listSolvers());
  } catch (error) {
    sendError(res, "listSolvers", error);
  }
});

export default router;
