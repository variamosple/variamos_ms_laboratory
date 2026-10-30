-- Lifecycle, logical deletion, clone provenance and pinned models.

-- LAB-EX-05: logical deletion. LAB-EX-06: restoring returns to the pre-archive state.
-- LAB-EX-02: a clone keeps a reference to the original experiment and version.
ALTER TABLE __SCHEMA__.experiment
  ADD COLUMN IF NOT EXISTS deleted_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_before_archive     TEXT,
  ADD COLUMN IF NOT EXISTS cloned_from_experiment_id UUID,
  ADD COLUMN IF NOT EXISTS cloned_from_version       INTEGER;

-- LAB-EX-07 states. 'deleted' is kept for rows written before deleted_at existed.
ALTER TABLE __SCHEMA__.experiment DROP CONSTRAINT IF EXISTS experiment_status_check;
ALTER TABLE __SCHEMA__.experiment ADD CONSTRAINT experiment_status_check CHECK (status IN (
  'draft', 'request_changes', 'ready', 'running', 'completed', 'failed', 'cancelled', 'archived', 'deleted'
));

-- Tables created by hand during the internship typed these ids UUID; the
-- platform ids (variamos.user, variamos.model) are text.
ALTER TABLE __SCHEMA__.scenario ALTER COLUMN model_id TYPE TEXT;
ALTER TABLE __SCHEMA__.metric ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE __SCHEMA__.experiment_history ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE __SCHEMA__.experiment_user ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE __SCHEMA__.experiment_user ALTER COLUMN role TYPE TEXT;

-- The interface sends one configuration per solver (solverConfigs); the first
-- version stored a single solver_config that was never filled.
ALTER TABLE __SCHEMA__.scenario RENAME COLUMN solver_config TO solver_configs;

-- LAB-CF-01 / LAB-R-03: vms_projects does not version models, so the model is
-- copied when the experiment becomes Ready and runs use that copy (roadmap Q3, option b).
-- LAB-CF-04: operational context of the scenario.
ALTER TABLE __SCHEMA__.scenario
  ADD COLUMN IF NOT EXISTS name                TEXT,
  ADD COLUMN IF NOT EXISTS position            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operational_context JSONB,
  ADD COLUMN IF NOT EXISTS model_language_id   INTEGER,
  ADD COLUMN IF NOT EXISTS model_snapshot      JSONB,
  ADD COLUMN IF NOT EXISTS model_snapshot_hash TEXT,
  ADD COLUMN IF NOT EXISTS model_pinned_at     TIMESTAMPTZ;

-- LAB-EX-04: full snapshot of the configuration for every version. Replaces the
-- rebuilding of a version from the history events, which lost the metrics.
CREATE TABLE IF NOT EXISTS __SCHEMA__.experiment_version (
  experiment_id UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  version       INTEGER NOT NULL,
  user_id       TEXT,
  config        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, version)
);

CREATE INDEX IF NOT EXISTS experiment_active_idx ON __SCHEMA__.experiment (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metric_user_idx ON __SCHEMA__.metric (user_id);
