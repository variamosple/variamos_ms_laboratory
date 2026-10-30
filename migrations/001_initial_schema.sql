-- Laboratory tables as used by the first version of the service (internship, 2026-08).
-- Until then they were created by hand in a schema named variamos_laboratory_test.
-- __SCHEMA__ is replaced by DB_SCHEMA when the migration runs.

CREATE SCHEMA IF NOT EXISTS __SCHEMA__;

CREATE TABLE IF NOT EXISTS __SCHEMA__.experiment (
  id           UUID PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  hypothesis   TEXT,
  version      INTEGER NOT NULL DEFAULT 1,
  labels       JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'draft',
  is_template  BOOLEAN NOT NULL DEFAULT FALSE,
  is_benchmark BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.experiment_user (
  experiment_id UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  user_id       TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('owner', 'director', 'editor', 'viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, user_id)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.scenario (
  id            UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  -- variamos.model.id is a string in vms_projects
  model_id      TEXT,
  solver_config JSONB
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.metric (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  formula     TEXT NOT NULL,
  unit        TEXT,
  description TEXT,
  script      TEXT,
  -- NULL means the metric is public
  user_id     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.experiment_metric (
  experiment_id UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  metric_id     UUID NOT NULL REFERENCES __SCHEMA__.metric(id),
  PRIMARY KEY (experiment_id, metric_id)
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.experiment_history (
  id                 UUID PRIMARY KEY,
  experiment_id      UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  scenario_id        UUID,
  user_id            TEXT,
  experiment_version INTEGER NOT NULL,
  event_type         TEXT NOT NULL,
  old_value          JSONB,
  new_value          JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experiment_user_user_idx ON __SCHEMA__.experiment_user (user_id, role);
CREATE INDEX IF NOT EXISTS scenario_experiment_idx ON __SCHEMA__.scenario (experiment_id);
CREATE INDEX IF NOT EXISTS experiment_history_experiment_idx
  ON __SCHEMA__.experiment_history (experiment_id, experiment_version);
