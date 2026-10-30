import { Router } from "express";
import MetricUseCase from "../Domain/Laboratory/MetricUseCase";
import { hasLaboratoryAccess } from "./laboratoryAccess";
import { sendError } from "./sendError";

const router = Router();
const metricUseCase = new MetricUseCase();

export const METRICS_ROUTE = "/metrics";

router.get("/public", hasLaboratoryAccess, async (req, res) => {
    try {
        res.json(await metricUseCase.getPublicMetrics());
    } catch (error) {
        sendError(res, "getPublicMetrics", error);
    }
});

router.get("/user", hasLaboratoryAccess, async (req, res) => {
    try {
        res.json(await metricUseCase.getMetricsByUserId(req.user?.id!));
    } catch (error) {
        sendError(res, "getUserMetrics", error);
    }
});

router.get("/:id", hasLaboratoryAccess, async (req, res) => {
    try {
        res.json(await metricUseCase.getMetricById(req.params.id, req.user?.id!));
    } catch (error) {
        sendError(res, "getMetric", error);
    }
});

router.post("/", hasLaboratoryAccess, async (req, res) => {
    try {
        res.status(201).json(await metricUseCase.createMetric(req.body, req.user?.id!));
    } catch (error) {
        sendError(res, "createMetric", error);
    }
});

/** Body: a list of metric ids, or of metrics with an id. Registered before /:id. */
router.post("/publish", hasLaboratoryAccess, async (req, res) => {
    try {
        const items: unknown[] = Array.isArray(req.body) ? req.body : req.body?.metricIds ?? [];
        const metricIds = items
            .map((item: any) => (typeof item === "string" ? item : item?.id))
            .filter((id): id is string => typeof id === "string");

        await metricUseCase.publishMetrics(metricIds, req.user?.id!);
        res.status(200).json({ message: "Metrics published successfully" });
    } catch (error) {
        sendError(res, "publishMetrics", error);
    }
});

router.put("/:id", hasLaboratoryAccess, async (req, res) => {
    try {
        res.json(await metricUseCase.updateMetric(req.params.id, req.body, req.user?.id!));
    } catch (error) {
        sendError(res, "updateMetric", error);
    }
});

router.delete("/:id", hasLaboratoryAccess, async (req, res) => {
    try {
        await metricUseCase.deleteMetric(req.params.id, req.user?.id!);
        res.status(204).send();
    } catch (error) {
        sendError(res, "deleteMetric", error);
    }
});

export default router;
