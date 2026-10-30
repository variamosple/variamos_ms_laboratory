-- LAB-EX-01: each experiment is associated with a VariaMos project.
-- The project belongs to vms_projects (variamos.project); like model ids, the
-- id is kept as text without a foreign key across services. Experiments created
-- before this migration have no project.

ALTER TABLE __SCHEMA__.experiment ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS experiment_project_idx ON __SCHEMA__.experiment (project_id);
