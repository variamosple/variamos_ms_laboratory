import { Router } from "express";
import MetricUseCase from "../Domain/Laboratory/MetricUseCase";
import { isAuthenticated } from "@variamosple/variamos-security";

const router = Router();
const metricUseCase = new MetricUseCase();

export const METRICS_ROUTE = "/metrics";

router.get("/public", isAuthenticated, async (req, res) => {
    try {
        const publicMetrics = await metricUseCase.getPublicMetrics();      
        res.json(publicMetrics);
    } catch (error) {
        console.error("Error fetching public metrics:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/user", isAuthenticated, async (req, res) => {
    try {
        const userMetrics = await metricUseCase.getMetricsByUserId(req.user?.id!);
        res.json(userMetrics);
    } catch (error) {
        console.error(`Error fetching metrics for user ${req.user?.id!}:`, error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/:id", isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        const metric = await metricUseCase.getMetricById(id);
        if (!metric) {
            res.status(404).json({ error: "Metric not found" });
            return;
        }
        res.json(metric);
    } catch (error) {
        console.error(`Error fetching metric with ID ${id}:`, error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/", isAuthenticated, async (req, res) => {
    const metricData = req.body;
    try {
        const newMetric = await metricUseCase.createMetric(metricData);
        res.status(201).json(newMetric);
    } catch (error) {
        console.error("Error creating metric:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.put("/:id", isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const metricData = req.body;
    try {
        const updatedMetric = await metricUseCase.updateMetric(id, metricData);
        if (!updatedMetric) {
            res.status(404).json({ error: "Metric not found" });
            return;
        }
        res.json(updatedMetric);
    } catch (error) {
        console.error(`Error updating metric with ID ${id}:`, error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
    const { id } = req.params;
    try {
        const deleted = await metricUseCase.deleteMetric(id);
        if (!deleted) {
            res.status(404).json({ error: "Metric not found" });
            return;
        }
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting metric with ID ${id}:`, error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post("/publish", isAuthenticated, async (req, res) => {
    const metricsToPublish = req.body;
    try {
        await metricUseCase.publishMetrics(metricsToPublish);
        res.status(200).json({ message: "Metrics published successfully" });
    } catch (error) {
        console.error("Error publishing metrics:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;