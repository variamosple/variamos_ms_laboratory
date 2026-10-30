import { initKeyStore } from "@variamosple/variamos-security";
import { Config } from "../../Config";
import { app } from "../../app";
import RunUseCase from "../Laboratory/RunUseCase";

async function init() {
  try {
    await initKeyStore();

    // Runs left by a previous process cannot resume: their queue was in memory
    const interrupted = await new RunUseCase().failInterruptedRuns();
    if (interrupted > 0) console.log(`Runs interrupted by the last stop: ${interrupted}, marked failed.`);

    await app.listen(Config.PORT);

    console.log("Server on port", "http://localhost:" + Config.PORT);
    console.log("Version", Config.VERSION);
    // Said at every start: with the mock, every result is simulated
    console.log("Reasoning gateway", Config.GATEWAYS.REASONING, "- notification gateway", Config.GATEWAYS.NOTIFICATIONS);
    console.log("Keystore initialized.");
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

init();