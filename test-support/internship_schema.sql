-- Tables as the first version of the service expected them (internship, 2026-08),
-- created by hand without migrations: ids typed UUID, role as an enum.
CREATE SCHEMA __SCHEMA__;
CREATE TYPE __SCHEMA__.enum_experiment_user_role AS ENUM ('owner', 'director', 'editor', 'viewer');

CREATE TABLE __SCHEMA__.experiment (
  id UUID PRIMARY KEY, name TEXT NOT NULL, description TEXT, hypothesis TEXT,
  version INTEGER NOT NULL DEFAULT 1, labels JSONB NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft',
  is_template BOOLEAN NOT NULL DEFAULT FALSE, is_benchmark BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE __SCHEMA__.experiment_user (
  experiment_id UUID NOT NULL, user_id TEXT NOT NULL,
  role __SCHEMA__.enum_experiment_user_role NOT NULL DEFAULT 'viewer', created_at TIMESTAMPTZ,
  PRIMARY KEY (experiment_id, user_id)
);
CREATE TABLE __SCHEMA__.scenario (id UUID PRIMARY KEY, experiment_id UUID NOT NULL, model_id UUID, solver_config JSONB);
CREATE TABLE __SCHEMA__.metric (
  id UUID PRIMARY KEY, name TEXT NOT NULL, formula TEXT NOT NULL, unit TEXT, description TEXT, script TEXT,
  user_id UUID, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE __SCHEMA__.experiment_metric (experiment_id UUID NOT NULL, metric_id UUID NOT NULL, PRIMARY KEY (experiment_id, metric_id));
CREATE TABLE __SCHEMA__.experiment_history (
  id UUID PRIMARY KEY, experiment_id UUID NOT NULL, scenario_id UUID, user_id UUID,
  experiment_version INTEGER NOT NULL, event_type TEXT NOT NULL, old_value JSONB, new_value JSONB, created_at TIMESTAMPTZ
);

INSERT INTO __SCHEMA__.experiment (id, name, status, created_at, updated_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'Internship experiment', 'draft', now(), now());
INSERT INTO __SCHEMA__.experiment_user (experiment_id, user_id, role)
VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'owner');
INSERT INTO __SCHEMA__.scenario (id, experiment_id, model_id, solver_config)
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444', '{"z3": {"timeOut": 60}}');
