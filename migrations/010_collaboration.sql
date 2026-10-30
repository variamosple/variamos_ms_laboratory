-- P5: LAB-COL-01 read, write and execute given separately; LAB-COL-03 comments.

-- Owners and directors may do everything; a shared user has the flags given.
-- Before this migration an editor wrote and executed, a viewer only read.
ALTER TABLE __SCHEMA__.experiment_user ADD COLUMN IF NOT EXISTS can_write BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE __SCHEMA__.experiment_user ADD COLUMN IF NOT EXISTS can_execute BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE __SCHEMA__.experiment_user SET can_write = TRUE, can_execute = TRUE WHERE role IN ('owner', 'director', 'editor');

-- Comments and annotations on an experiment, a scenario, a run, or the result of a
-- scenario run (optionally one of its metrics). The label is kept for elements
-- removed later (a scenario deleted by an edit).
CREATE TABLE IF NOT EXISTS __SCHEMA__.comment (
  id            UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES __SCHEMA__.experiment(id),
  target_type   TEXT NOT NULL CHECK (target_type IN ('experiment', 'scenario', 'run', 'scenario_run')),
  target_id     TEXT NOT NULL,
  metric_id     UUID,
  target_label  TEXT NOT NULL,
  body          TEXT NOT NULL,
  author        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at     TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  deleted_by    TEXT
);

CREATE INDEX IF NOT EXISTS comment_experiment_idx ON __SCHEMA__.comment (experiment_id, created_at);
