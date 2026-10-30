import fs from "fs";
import path from "path";
import sequelize from "./VariamosORM";
import { migrate } from "./migrate";

const SCHEMA = "variamos_laboratory_internship";

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
  await sequelize.close();
});

test("the migrations adopt the tables of the first version without losing data", async () => {
  const applied = await migrate(sequelize, SCHEMA);
  expect(applied).toHaveLength(fs.readdirSync(path.resolve(__dirname, "../../../migrations")).length);

  const [models] = await sequelize.query(`SELECT scenario_id, position, model_id FROM ${SCHEMA}.scenario_model`);
  expect(models).toEqual([
    {
      scenario_id: "33333333-3333-4333-8333-333333333333",
      position: 0,
      model_id: "44444444-4444-4444-8444-444444444444",
    },
  ]);

  const [scenarios] = await sequelize.query(`SELECT solver_configs FROM ${SCHEMA}.scenario`);
  expect(scenarios).toEqual([{ solver_configs: { z3: { timeOut: 60 } } }]);

  const [owners] = await sequelize.query(`SELECT role FROM ${SCHEMA}.experiment_user`);
  expect(owners).toEqual([{ role: "owner" }]);

  await expect(
    sequelize.query(`INSERT INTO ${SCHEMA}.metric (id, name, formula, user_id) VALUES (gen_random_uuid(), 'm', 'f', 'not-a-uuid')`)
  ).resolves.toBeDefined();
});
