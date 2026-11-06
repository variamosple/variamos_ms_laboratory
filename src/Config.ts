import fs from "fs";
import path from "path";

const dotenv = require('dotenv');

let envPath= "DEVELOPMENT" === process.env.NODE_ENV?.toUpperCase() ? './.env.development' : './.env';

dotenv.config({
  path: envPath
});

/** A numeric setting; a missing or invalid value stops the service instead of being guessed. */
export function setting(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be a number of at least ${min}, not "${raw}".`);
  }
  return value;
}

/** A setting chosen from a list; any other value stops the service. */
export function choice<T extends string>(name: string, fallback: T, allowed: readonly T[], note = ""): T {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}, not "${raw}".${note ? ` ${note}` : ""}`);
  }
  return raw as T;
}

/**
 * A list of web origins (scheme, host and port, comma separated); a value that is not an origin stops the
 * service, so that a typo cannot open or close the access silently.
 */
export function origins(name: string, fallback: readonly string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return [...fallback];
  return raw.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "").map((entry) => {
    let origin = "";
    try {
      origin = new URL(entry).origin;
    } catch {
      // reported below
    }
    if (origin !== entry) {
      throw new Error(`${name} must list origins such as https://app.variamos.com, not "${entry}".`);
    }
    return entry;
  });
}

// The platform, and the development servers of the interface (npm start on 3000, npm run dev on 3003).
// In production the interface is served by the same origin as this service, through the platform proxy.
export const DEFAULT_CORS_ORIGINS = [
  "https://app.variamos.com",
  "http://localhost:3000",
  "http://localhost:3003",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3003",
] as const;

export const Config = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    HOST: process.env.HOST || '127.0.0.1',
    // Free on every platform host (DevOps compose and nginx files, 2026-10-30); 4000 is the Administration module's
    PORT: process.env.PORT || 8002,
    // Origins whose pages may call this service with the session cookie
    CORS_ORIGINS: origins("LAB_CORS_ORIGINS", DEFAULT_CORS_ORIGINS),
    // Recorded in the provenance of each run (LAB-RP-02)
    VERSION: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version as string,
    DB: {
      USER: process.env.DB_USER || "db_user_test",
      HOST: process.env.DB_HOST || "db_host_test",
      PASSWORD: process.env.DB_PASSWORD || "db_password_test",
      DATABASE: process.env.DB_DATABASE || "db_database_test",
      PORT: process.env.DB_PORT || 5433,
      // As variamos_ms_notifications: encrypted, without checking the certificate. "false" for a local database
      SSL: choice("DB_SSL", "true", ["true", "false"] as const) === "true",
      // Schema holding the Laboratory tables; the platform tables (user, model) stay in "variamos".
      SCHEMA: process.env.DB_SCHEMA || "variamos_laboratory",
    },
    // P2 execution: job queue, retries (LAB-RUN-06) and runtime limit (LAB-R-05)
    RUNS: {
      CONCURRENCY: setting("LAB_RUN_CONCURRENCY", 4, 1),
      MAX_RETRIES: setting("LAB_RUN_MAX_RETRIES", 2, 0),
      RETRY_DELAY_MS: setting("LAB_RUN_RETRY_DELAY_MS", 1000, 0),
      POLL_INTERVAL_MS: setting("LAB_RUN_POLL_INTERVAL_MS", 500, 10),
      MAX_RUNTIME_SECONDS: setting("LAB_RUN_MAX_RUNTIME_SECONDS", 3600, 1),
    },
    // Which implementation answers behind each gateway. Only the mocks exist: results are simulated
    GATEWAYS: {
      REASONING: choice("LAB_REASONING_GATEWAY", "mock", ["mock"] as const, "The real gateway waits for the Reasoning API (roadmap Q5)."),
      NOTIFICATIONS: choice("LAB_NOTIFICATION_GATEWAY", "mock", ["mock"] as const, "The real gateway waits for the run template of the notification service."),
    },
}
