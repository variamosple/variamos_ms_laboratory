import fs from "fs";
import path from "path";
import { Sequelize } from "sequelize";
import sequelize from "./VariamosORM";
import { Config } from "../../Config";

// src/DataProviders/dataBase and dist/DataProviders/dataBase are both three levels below the root.
export const MIGRATIONS_DIR = path.resolve(__dirname, "../../../migrations");

const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/;

/**
 * Applies the SQL files of migrations/ in name order, once each, and records
 * them in <schema>.schema_migration. Each file runs in its own transaction.
 */
export async function migrate(
  db: Sequelize = sequelize,
  schema: string = Config.DB.SCHEMA,
  dir: string = MIGRATIONS_DIR
): Promise<string[]> {
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }

  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await db.query(
    `CREATE TABLE IF NOT EXISTS ${schema}.schema_migration (
       id TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  const [rows] = await db.query(`SELECT id FROM ${schema}.schema_migration`);
  const applied = new Set((rows as { id: string }[]).map((row) => row.id));

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs
      .readFileSync(path.join(dir, file), "utf8")
      .replace(/__SCHEMA__/g, schema);

    await db.transaction(async (transaction) => {
      await db.query(sql, { transaction });
      await db.query(`INSERT INTO ${schema}.schema_migration (id) VALUES (:id)`, {
        replacements: { id: file },
        transaction,
      });
    });

    newlyApplied.push(file);
  }

  return newlyApplied;
}

if (require.main === module) {
  migrate()
    .then((files) => {
      console.log(files.length ? `Applied: ${files.join(", ")}` : "Schema up to date.");
      return sequelize.close();
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
