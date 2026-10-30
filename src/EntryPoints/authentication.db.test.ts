import fs from "fs";
import os from "os";
import path from "path";
import { generateKeyPairSync } from "crypto";
import request from "supertest";

// No mock: the real VariaMos session middleware, with a key pair made for the test.
const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "lab-keys-"));
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
fs.writeFileSync(path.join(keyDir, "private.pem"), privateKey);
fs.writeFileSync(path.join(keyDir, "public.pem"), publicKey);
process.env.VARIAMOS_PRIVATE_KEY_PATH = path.join(keyDir, "private.pem");
process.env.VARIAMOS_PUBLIC_KEY_PATH = path.join(keyDir, "public.pem");

import { createJwt, initKeyStore } from "@variamosple/variamos-security";
import { app } from "../app";
import sequelize from "../DataProviders/dataBase/VariamosORM";
import { migrate } from "../DataProviders/dataBase/migrate";
import { Config } from "../Config";
import { checkContract } from "../test-support/contract";

const SCHEMA = Config.DB.SCHEMA;
const user = { id: "user-carol", name: "Carol", user: "carol", email: "carol@example.org", roles: ["Researcher"] };

/** A token signed like the Administration module signs them. */
async function tokenFor(sessionUser = user, expiresInSeconds?: number) {
  const previous = process.env.VARIAMOS_JWT_EXP_IN_SECONDS;
  if (expiresInSeconds !== undefined) process.env.VARIAMOS_JWT_EXP_IN_SECONDS = String(expiresInSeconds);
  try {
    return String(await createJwt(sessionUser));
  } finally {
    // Assigning undefined would store the string "undefined"
    if (previous === undefined) delete process.env.VARIAMOS_JWT_EXP_IN_SECONDS;
    else process.env.VARIAMOS_JWT_EXP_IN_SECONDS = previous;
  }
}

beforeAll(async () => {
  await initKeyStore();
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS variamos CASCADE`);
  await sequelize.query(
    fs.readFileSync(path.resolve(__dirname, "../../test-support/platform_stub.sql"), "utf8")
  );
  await sequelize.query(
    `INSERT INTO variamos."user" (id, "user", name, email) VALUES ('${user.id}', 'carol', 'Carol', '${user.email}')`
  );
  await sequelize.query(`INSERT INTO variamos.project (id, owner_id, name) VALUES ('project-carol', '${user.id}', 'Carol project')`);
  await migrate();
});

afterAll(async () => {
  await sequelize.close();
  fs.rmSync(keyDir, { recursive: true, force: true });
});

describe("VariaMos session (LAB-NF-05)", () => {
  test("without a token the request is refused", async () => {
    expect((await request(app).get("/experiments")).status).toBe(401);
  });

  test("a token signed with another key is refused", async () => {
    const forged = (await tokenFor()).split(".").slice(0, 2).join(".") + ".c2lnbmF0dXJl";
    const response = await request(app).get("/experiments").set("Authorization", `Bearer ${forged}`);
    expect(response.status).toBe(401);
    checkContract("get", "/experiments", response.status, response.body);
  });

  test("an expired token is refused", async () => {
    const expired = await tokenFor(user, -60);
    const response = await request(app).get("/experiments").set("Authorization", `Bearer ${expired}`);
    expect(response.status).toBe(401);
  });

  test("the token is accepted from the Authorization header and from the authToken cookie", async () => {
    const token = await tokenFor();

    const byHeader = await request(app).get("/experiments").set("Authorization", `Bearer ${token}`);
    const byCookie = await request(app).get("/experiments").set("Cookie", `authToken=${token}`);

    expect(byHeader.status).toBe(200);
    expect(byCookie.status).toBe(200);
    checkContract("get", "/experiments", byHeader.status, byHeader.body);
  });

  test("the experiment owner is the user of the session", async () => {
    const token = await tokenFor();

    const created = await request(app)
      .post("/experiments")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Signed in for real", projectId: "project-carol" });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ userRole: "owner", author: "Carol" });
  });
});
