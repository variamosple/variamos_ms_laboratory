-- Minimal copy of the platform tables the Laboratory reads (owned by the
-- Administration module and vms_projects), for the integration tests only.
-- Columns follow VariaMosAdmin tests/db/VariamosDB.sql.

CREATE SCHEMA IF NOT EXISTS variamos;

CREATE TABLE IF NOT EXISTS variamos."user" (
  id         TEXT PRIMARY KEY,
  "user"     TEXT,
  name       TEXT,
  email      TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS variamos.model (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL,
  product_line_id  TEXT NOT NULL,
  engineering_type TEXT NOT NULL,
  name             TEXT,
  type             TEXT,
  language_id      INTEGER NOT NULL,
  description      TEXT,
  author           TEXT,
  source           TEXT,
  model            JSONB NOT NULL,
  is_deleted       BOOLEAN DEFAULT FALSE,
  model_level      TEXT DEFAULT 'domain',
  is_public        BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS variamos.project (
  id       TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project  JSON,
  name     TEXT,
  template BOOLEAN,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS variamos.user_project (
  user_id    TEXT NOT NULL,
  project_id TEXT NOT NULL,
  role       TEXT DEFAULT '',
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS variamos.language (
  id         INTEGER PRIMARY KEY,
  name       TEXT,
  type       TEXT,
  semantics  JSONB DEFAULT '{}'::jsonb
);
