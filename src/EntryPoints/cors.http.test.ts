import request from "supertest";

import { app } from "../app";

// The session cookie travels with the requests of the allowed origins only (DEFAULT_CORS_ORIGINS here)
describe("CORS", () => {
  const preflight = (origin: string) =>
    request(app)
      .options("/experiments")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST");

  test("the platform may call the service with its credentials", async () => {
    const response = await preflight("https://app.variamos.com");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.variamos.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("another origin is not allowed, so its browser refuses the answer", async () => {
    const response = await preflight("https://elsewhere.example");

    // The cors package still sends Allow-Credentials; without Allow-Origin, the browser refuses
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
