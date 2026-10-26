-- Blueprint D1 schema.
-- Apply with: npx wrangler d1 execute blueprint --file worker/schema.sql --remote

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  edit_token   TEXT NOT NULL,
  payload      TEXT NOT NULL,          -- full generated project JSON
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  email        TEXT NOT NULL,
  name         TEXT,
  message      TEXT NOT NULL,
  source       TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_project_idx ON leads (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscribers (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  email         TEXT NOT NULL,
  status        TEXT NOT NULL,          -- pending | confirmed | unsubscribed
  confirm_token TEXT,
  source        TEXT,
  created_at    INTEGER NOT NULL,
  confirmed_at  INTEGER,
  UNIQUE (project_id, email)
);
CREATE INDEX IF NOT EXISTS subscribers_project_idx ON subscribers (project_id, status, created_at DESC);

-- Cache so repeated wizard runs do not hammer the public RDAP / DNS endpoints.
CREATE TABLE IF NOT EXISTS domain_cache (
  domain     TEXT PRIMARY KEY,
  available  INTEGER,                   -- 1 yes, 0 no, NULL unknown
  evidence   TEXT,
  checked_at INTEGER NOT NULL
);
