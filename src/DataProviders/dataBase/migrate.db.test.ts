import fs from "fs";
import path from "path";
import { Sequelize } from "sequelize";
import sequelize from "./VariamosORM";
import { migrate } from "./migrate";
import { Config } from "../../Config";

const SCHEMA = "variamos_laboratory_internship";
const MIGRATION_FILES = fs.readdirSync(path.resolve(__dirname, "../../../migrations")).length;

// As in production: the schema belongs to a role without login, and the service
// connects with an account that acts as that role but has no CREATE on the database.
const OWNER = "lab_it_schema_owner";
const ACCOUNT = "lab_it_service_account";
const ACCOUNT_PASSWORD = "local_test_only";
const OWNED_SCHEMA = "variamos_laboratory_owned";
const MISSING_SCHEMA = "variamos_laboratory_missing";

let account: Sequelize;

async function dropRoles() {
  for (const role of [ACCOUNT, OWNER]) {
    const [found] = await sequelize.query(`SELECT 1 FROM pg_roles WHERE rolname = :role`, {
      replacements: { role },
    });
    if (found.length > 0) {
      await sequelize.query(`DROP OWNED BY ${role} CASCADE`);
      await sequelize.query(`DROP ROLE ${role}`);
    }
  }
}

beforeAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(
    fs
      .readFileSync(path.resolve(__dirname, "../../../test-support/internship_schema.sql"), "utf8")
      .replace(/__SCHEMA__/g, SCHEMA)
  );
});

afterAll(async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await sequelize.query(`DROP SCHEMA IF EXISTS ${MISSING_SCHEMA} CASCADE`);
  await account?.close();
  await dropRoles();
  await sequelize.close();
});

test("the migrations adopt the tables of the first version without losing data", async () => {
  const applied = await migrate(sequelize, SCHEMA);
  expect(applied).toHaveLength(MIGRATION_FILES);

  const [models] = await sequelize.query(`SELECT scenario_id, position, model_id FROM ${SCHEMA}.scenario_model`);
  expect(models).toEqual([
    {
      scenario_id: "33333333-3333-4333-8333-333333333333",
      position: 0,
      model_id: "44444444-4444-4444-8444-444444444444",
    },
  ]);

  const [scenarios] = await sequelize.query(`SELECT solver_configs FROM ${SCHEMA}.scenario WHERE id = '33333333-3333-4333-8333-333333333333'`);
  expect(scenarios).toEqual([{ solver_configs: { z3: { timeOut: 60 } } }]);
  // LAB-CF-05: the predefined templates come next to the adopted experiment
  const [templates] = await sequelize.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.experiment WHERE is_template AND project_id IS NULL`);
  expect(templates).toEqual([{ n: 5 }]);

  const [owners] = await sequelize.query(`SELECT role FROM ${SCHEMA}.experiment_user`);
  expect(owners).toEqual([{ role: "owner" }]);

  await expect(
    sequelize.query(`INSERT INTO ${SCHEMA}.metric (id, name, formula, user_id) VALUES (gen_random_uuid(), 'm', 'f', 'not-a-uuid')`)
  ).resolves.toBeDefined();
});

describe("an account without CREATE on the database", () => {
  beforeAll(async () => {
    await sequelize.query(`DROP SCHEMA IF EXISTS ${MISSING_SCHEMA} CASCADE`);
    await dropRoles();
    await sequelize.query(`CREATE ROLE ${OWNER} NOLOGIN`);
    await sequelize.query(`CREATE ROLE ${ACCOUNT} LOGIN PASSWORD '${ACCOUNT_PASSWORD}' IN ROLE ${OWNER}`);
    await sequelize.query(`ALTER ROLE ${ACCOUNT} SET role = ${OWNER}`);
    await sequelize.query(`CREATE SCHEMA ${OWNED_SCHEMA} AUTHORIZATION ${OWNER}`);

    account = new Sequelize(Config.DB.DATABASE, ACCOUNT, ACCOUNT_PASSWORD, {
      host: Config.DB.HOST,
      port: Number(Config.DB.PORT),
      dialect: "postgres",
      logging: false,
    });
  });

  test("has no CREATE right on the database, under its own name or its owner's", async () => {
    const [rows] = await account.query(
      `SELECT session_user AS login, current_user AS acting,
              has_database_privilege(session_user, current_database(), 'CREATE') AS login_can,
              has_database_privilege(current_user, current_database(), 'CREATE') AS acting_can`
    );
    expect(rows).toEqual([{ login: ACCOUNT, acting: OWNER, login_can: false, acting_can: false }]);
  });

  test("applies every migration in the schema its owner was given, then finds nothing to do", async () => {
    expect(await migrate(account, OWNED_SCHEMA)).toHaveLength(MIGRATION_FILES);
    expect(await migrate(account, OWNED_SCHEMA)).toEqual([]);

    const [owners] = await sequelize.query(
      `SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = :schema`,
      { replacements: { schema: OWNED_SCHEMA } }
    );
    expect(owners).toEqual([{ tableowner: OWNER }]);
  });

  test("is refused when the schema is missing, since it cannot create it", async () => {
    await expect(migrate(account, MISSING_SCHEMA)).rejects.toThrow(/permission denied for database/);
  });
});

test("an account with CREATE on the database creates the schema when it is missing", async () => {
  await sequelize.query(`DROP SCHEMA IF EXISTS ${MISSING_SCHEMA} CASCADE`);
  expect(await migrate(sequelize, MISSING_SCHEMA)).toHaveLength(MIGRATION_FILES);

  const [schemas] = await sequelize.query(`SELECT 1 FROM pg_namespace WHERE nspname = :schema`, {
    replacements: { schema: MISSING_SCHEMA },
  });
  expect(schemas).toHaveLength(1);
});
