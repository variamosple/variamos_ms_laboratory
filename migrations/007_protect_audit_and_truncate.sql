-- LAB-NF-06, LAB-EX-04: the audit log and the saved versions are only added to.
-- A run points to an experiment version: changing that version would change
-- what the run claims to have executed (LAB-RP-02).
CREATE OR REPLACE FUNCTION __SCHEMA__.protect_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit data cannot be changed or deleted (LAB-NF-06)';
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS experiment_history_protect ON __SCHEMA__.experiment_history;
CREATE TRIGGER experiment_history_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.experiment_history
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_append_only();

DROP TRIGGER IF EXISTS experiment_version_protect ON __SCHEMA__.experiment_version;
CREATE TRIGGER experiment_version_protect BEFORE UPDATE OR DELETE ON __SCHEMA__.experiment_version
  FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.protect_append_only();

-- LAB-R-01: row triggers do not see TRUNCATE; refuse it on the protected tables.
CREATE OR REPLACE FUNCTION __SCHEMA__.refuse_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % cannot be emptied (LAB-R-01, LAB-NF-06)', TG_TABLE_NAME;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS run_no_truncate ON __SCHEMA__.run;
CREATE TRIGGER run_no_truncate BEFORE TRUNCATE ON __SCHEMA__.run
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();

DROP TRIGGER IF EXISTS scenario_run_no_truncate ON __SCHEMA__.scenario_run;
CREATE TRIGGER scenario_run_no_truncate BEFORE TRUNCATE ON __SCHEMA__.scenario_run
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();

DROP TRIGGER IF EXISTS run_attempt_no_truncate ON __SCHEMA__.run_attempt;
CREATE TRIGGER run_attempt_no_truncate BEFORE TRUNCATE ON __SCHEMA__.run_attempt
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();

DROP TRIGGER IF EXISTS model_snapshot_no_truncate ON __SCHEMA__.model_snapshot;
CREATE TRIGGER model_snapshot_no_truncate BEFORE TRUNCATE ON __SCHEMA__.model_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();

DROP TRIGGER IF EXISTS experiment_history_no_truncate ON __SCHEMA__.experiment_history;
CREATE TRIGGER experiment_history_no_truncate BEFORE TRUNCATE ON __SCHEMA__.experiment_history
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();

DROP TRIGGER IF EXISTS experiment_version_no_truncate ON __SCHEMA__.experiment_version;
CREATE TRIGGER experiment_version_no_truncate BEFORE TRUNCATE ON __SCHEMA__.experiment_version
  FOR EACH STATEMENT EXECUTE FUNCTION __SCHEMA__.refuse_truncate();
