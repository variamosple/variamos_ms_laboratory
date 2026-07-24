import { initKeyStore } from "@variamosple/variamos-security";
import cookieParser from "cookie-parser";
import express from "express";
import { Config } from "../../Config";
import "../Laboratory/Entities/Associations";
import experimentsRouter, { EXPERIMENTS_ROUTE } from "../../EntryPoints/experimentEntryPoints";
import { OrmExperiment } from "../Laboratory/Entities/Experiment";


const app = express();
app.use(cookieParser(""));
var cors = require("cors");

app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(EXPERIMENTS_ROUTE, experimentsRouter);

async function init() {
  try {
    await initKeyStore();

    await app.listen(Config.PORT);

    console.log("Server on port", "http://localhost:" + Config.PORT);
    console.log("Version", Config.VERSION);
    console.log(OrmExperiment.associations);
    console.log("Keystore initialized.");
    console.log(Config.DB);
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

init();