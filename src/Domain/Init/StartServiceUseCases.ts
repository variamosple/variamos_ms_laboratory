import { initKeyStore } from "@variamosple/variamos-security";
import { Config } from "../../Config";
import { OrmExperiment } from "../Laboratory/Entities/Experiment";
import { app } from "../../app";

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