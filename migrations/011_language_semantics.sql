-- LAB-RP-01, LAB-R-03: the semantics of the language of each input model is
-- pinned at Ready with the model, and kept with the run. The platform stores one
-- semantics per language (variamos.language.semantics) without a version
-- number: the SHA-256 of its canonical JSON identifies the exact semantics used.

ALTER TABLE __SCHEMA__.scenario_model ADD COLUMN IF NOT EXISTS semantics_snapshot JSONB;
ALTER TABLE __SCHEMA__.scenario_model ADD COLUMN IF NOT EXISTS semantics_hash TEXT;

-- The pinned semantics a run executes, by hash, like model_snapshot.
CREATE TABLE IF NOT EXISTS __SCHEMA__.semantics_snapshot (
  hash        TEXT PRIMARY KEY,
  language_id INTEGER NOT NULL,
  snapshot    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LAB-R-01: only added, never changed or deleted
CREATE OR REPLACE FUNCTION __SCHEMA__.protect_run_data() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Run data cannot be deleted (LAB-R-01)';
  END IF;
  -- Attempts, model and semantics copies are only added
  IF TG_TABLE_NAME IN ('run_attempt', 'model_snapshot', 'semantics_snapshot') THEN
    RAISE EXCEPTION 'Run data cannot be changed (LAB-R-01)';
  END IF;
  IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'A finished run cannot be changed (LAB-R-01)';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS semantics_snapshot_protect ON __SCHEMA__.semantics_snapshot;
CREATE TRIGGER semantics_snapshot_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.semantics_snapshot
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_run_data();

DROP TRIGGER IF EXISTS semantics_snapshot_no_truncate ON __SCHEMA__.semantics_snapshot;
CREATE TRIGGER semantics_snapshot_no_truncate BEFORE TRUNCATE ON __SCHEMA__.semantics_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();
