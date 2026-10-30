import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import "./Domain/Laboratory/Entities/Associations";
import experimentsRouter, { EXPERIMENTS_ROUTE } from "./EntryPoints/experimentEntryPoints";
import metricsRouter, { METRICS_ROUTE } from "./EntryPoints/MetricEntryPoints";
import catalogRouter, { CATALOG_ROUTE } from "./EntryPoints/catalogEntryPoints";
import runsRouter, { RUNS_ROUTE } from "./EntryPoints/runEntryPoints";
import commentsRouter, { COMMENTS_ROUTE } from "./EntryPoints/commentEntryPoints";
import resultsRouter, { RESULTS_ROUTE } from "./EntryPoints/resultsEntryPoints";
import { REPRODUCTIONS_ROUTE, RUNS_BY_REFERENCE_ROUTE, reproductionsRouter, runsByReferenceRouter } from "./EntryPoints/reproducibilityEntryPoints";
import sequelize from "./DataProviders/dataBase/VariamosORM";
import { Config } from "./Config";

export const app = express();

app.use(cookieParser(""));
// Content-Disposition carries the name of exported files (LAB-MT-05)
app.use(cors({ origin: true, credentials: true, exposedHeaders: ["Content-Disposition", "X-Content-SHA256"] }));
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));

/** Liveness and database check, without authentication; says which gateways answer. */
app.get("/health", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ status: "ok", gateways: { reasoning: Config.GATEWAYS.REASONING, notifications: Config.GATEWAYS.NOTIFICATIONS } });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

app.use(RUNS_ROUTE, runsRouter);
app.use(COMMENTS_ROUTE, commentsRouter);
app.use(RESULTS_ROUTE, resultsRouter);
app.use(RUNS_BY_REFERENCE_ROUTE, runsByReferenceRouter);
app.use(REPRODUCTIONS_ROUTE, reproductionsRouter);
app.use(EXPERIMENTS_ROUTE, experimentsRouter);
app.use(METRICS_ROUTE, metricsRouter);
app.use(CATALOG_ROUTE, catalogRouter);
