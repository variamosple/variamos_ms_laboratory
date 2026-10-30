-- P2, execution. A run executes one exact version of an experiment (LAB-RUN-01);
-- it holds one scenario run per scenario and solver (LAB-CF-03), and each
-- scenario run keeps every attempt made (LAB-RUN-06).
-- The provenance of the run is frozen when it starts (LAB-RP-02).
-- Scenario runs do not reference the scenario table: editing an experiment
-- rewrites its scenarios, while past runs keep what was executed.

CREATE TABLE IF NOT EXISTS __SCHEMA__.run (
  id                 UUID PRIMARY KEY,
  experiment_id      UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  number             INTEGER NOT NULL,
  experiment_version INTEGER NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_by         TEXT NOT NULL,
  provenance         JSONB NOT NULL,
  failure_reason     TEXT,
  cancelled_by       TEXT,
  cancelled_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  UNIQUE (experiment_id, number)
);

CREATE INDEX IF NOT EXISTS run_experiment_idx ON __SCHEMA__.run (experiment_id, number DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.scenario_run (
  id             UUID PRIMARY KEY,
  run_id         UUID NOT NULL REFERENCES __SCHEMA__.run(id),
  position       INTEGER NOT NULL,
  scenario_id    UUID NOT NULL,
  scenario_name  TEXT,
  solver_id      TEXT NOT NULL,
  solver_version TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  job_id         TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  result         JSONB,
  error          TEXT,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  UNIQUE (run_id, position)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.run_attempt (
  scenario_run_id UUID NOT NULL REFERENCES __SCHEMA__.scenario_run(id),
  attempt         INTEGER NOT NULL,
  job_id          TEXT,
  outcome         TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'transient_error', 'cancelled', 'resource_limit')),
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scenario_run_id, attempt)
);

-- The pinned model copies a run executes, by SHA-256 hash: the run uses them
-- even after the experiment is edited or the model changes in vms_projects.
CREATE TABLE IF NOT EXISTS __SCHEMA__.model_snapshot (
  hash        TEXT PRIMARY KEY,
  model_id    TEXT NOT NULL,
  language_id INTEGER,
  snapshot    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LAB-R-01: run data is never deleted, a finished run or scenario run is never
-- changed, and attempts are only added. Checked by the database, whatever the client.
CREATE OR REPLACE FUNCTION __SCHEMA__.protect_run_data() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Run data cannot be deleted (LAB-R-01)';
  END IF;
  -- Attempts and model copies are only added
  IF TG_TABLE_NAME IN ('run_attempt', 'model_snapshot') THEN
    RAISE EXCEPTION 'Run data cannot be changed (LAB-R-01)';
  END IF;
  IF OLD.status IN ('completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'A finished run cannot be changed (LAB-R-01)';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS run_protect ON __SCHEMA__.run;
CREATE TRIGGER run_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.run
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_run_data();

DROP TRIGGER IF EXISTS scenario_run_protect ON __SCHEMA__.scenario_run;
CREATE TRIGGER scenario_run_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.scenario_run
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_run_data();

DROP TRIGGER IF EXISTS run_attempt_protect ON __SCHEMA__.run_attempt;
CREATE TRIGGER run_attempt_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.run_attempt
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_run_data();

DROP TRIGGER IF EXISTS model_snapshot_protect ON __SCHEMA__.model_snapshot;
CREATE TRIGGER model_snapshot_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.model_snapshot
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_run_data();
