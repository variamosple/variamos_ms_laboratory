import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import "./Domain/Laboratory/Entities/Associations";
import experimentsRouter, { EXPERIMENTS_ROUTE } from "./EntryPoints/experimentEntryPoints";
import metricsRouter, { METRICS_ROUTE } from "./EntryPoints/MetricEntryPoints";

export const app = express();

app.use(cookieParser(""));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(EXPERIMENTS_ROUTE, experimentsRouter);
app.use(METRICS_ROUTE, metricsRouter);
