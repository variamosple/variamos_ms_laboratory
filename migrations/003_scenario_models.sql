-- LAB-CF-01: a scenario takes one or more input models. Each model is pinned
-- separately when the experiment becomes Ready (copy, hash, language).

CREATE TABLE IF NOT EXISTS __SCHEMA__.scenario_model (
  scenario_id         UUID NOT NULL REFERENCES __SCHEMA__.scenario(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  model_id            TEXT NOT NULL,
  model_language_id   INTEGER,
  model_snapshot      JSONB,
  model_snapshot_hash TEXT,
  model_pinned_at     TIMESTAMPTZ,
  PRIMARY KEY (scenario_id, position),
  UNIQUE (scenario_id, model_id)
);

INSERT INTO __SCHEMA__.scenario_model
  (scenario_id, position, model_id, model_language_id, model_snapshot, model_snapshot_hash, model_pinned_at)
SELECT id, 0, model_id, model_language_id, model_snapshot, model_snapshot_hash, model_pinned_at
FROM __SCHEMA__.scenario
WHERE model_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE __SCHEMA__.scenario
  DROP COLUMN IF EXISTS model_id,
  DROP COLUMN IF EXISTS model_language_id,
  DROP COLUMN IF EXISTS model_snapshot,
  DROP COLUMN IF EXISTS model_snapshot_hash,
  DROP COLUMN IF EXISTS model_pinned_at;
