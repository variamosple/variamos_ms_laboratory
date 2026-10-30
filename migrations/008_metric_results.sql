-- P3: LAB-MT-03 metric values, computed when a scenario run ends and kept
-- with its result; LAB-VIS-01 progress of a running scenario run.

ALTER TABLE __SCHEMA__.scenario_run ADD COLUMN IF NOT EXISTS progress REAL;

CREATE TABLE IF NOT EXISTS __SCHEMA__.metric_result (
  run_id          UUID NOT NULL REFERENCES __SCHEMA__.run(id),
  scenario_run_id UUID NOT NULL REFERENCES __SCHEMA__.scenario_run(id),
  metric_id       UUID NOT NULL,
  -- NULL when the metric could not be computed; `reason` then says why
  value           DOUBLE PRECISION,
  reason          TEXT,
  -- The figures the value was computed from (LAB-MT-03: values consistent with the input data)
  inputs          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- True when an input came from a simulated Reasoning answer (mock gateway)
  simulated       BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scenario_run_id, metric_id),
  CHECK ((value IS NULL) <> (reason IS NULL))
);

CREATE INDEX IF NOT EXISTS metric_result_run_idx ON __SCHEMA__.metric_result (run_id);

-- LAB-R-01: metric results of a run are only added
DROP TRIGGER IF EXISTS metric_result_protect ON __SCHEMA__.metric_result;
CREATE TRIGGER metric_result_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.metric_result
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_append_only();

DROP TRIGGER IF EXISTS metric_result_no_truncate ON __SCHEMA__.metric_result;
CREATE TRIGGER metric_result_no_truncate BEFORE TRUNCATE ON __SCHEMA__.metric_result
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();
