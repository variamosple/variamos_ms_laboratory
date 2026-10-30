-- P4: LAB-RP-03 persistent identifier of each completed run, LAB-RP-01
-- reproducibility package, and the origin of an experiment rebuilt from a package.

ALTER TABLE __SCHEMA__.run ADD COLUMN IF NOT EXISTS persistent_id TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS __SCHEMA__.run_package (
  run_id     UUID PRIMARY KEY REFERENCES __SCHEMA__.run(id),
  file       BYTEA NOT NULL,
  sha256     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS run_package_protect ON __SCHEMA__.run_package;
CREATE TRIGGER run_package_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.run_package
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_append_only();

DROP TRIGGER IF EXISTS run_package_no_truncate ON __SCHEMA__.run_package;
CREATE TRIGGER run_package_no_truncate BEFORE TRUNCATE ON __SCHEMA__.run_package
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();

-- The persistent id of the run whose package rebuilt this experiment
ALTER TABLE __SCHEMA__.experiment ADD COLUMN IF NOT EXISTS reproduced_from TEXT;
