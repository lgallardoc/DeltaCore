PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sys_users (
  id TEXT PRIMARY KEY,
  sso_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sys_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sys_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sys_role_permissions (
  role_id TEXT NOT NULL REFERENCES sys_roles (id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES sys_modules (id) ON DELETE CASCADE,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_read INTEGER NOT NULL DEFAULT 0,
  can_write INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, module_id)
);

CREATE TABLE IF NOT EXISTS sys_user_roles (
  user_id TEXT NOT NULL REFERENCES sys_users (id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES sys_roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sys_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES sys_users (id),
  action TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS biz_data_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('db2', 'oracle', 'sqlserver')),
  odbc_dsn TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  search_path TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS biz_table_patterns (
  id TEXT PRIMARY KEY,
  regex_rule TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES biz_data_sources (id),
  target_id TEXT NOT NULL REFERENCES biz_data_sources (id)
);

CREATE TABLE IF NOT EXISTS biz_comparison_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (
    status IN ('PENDING', 'SUCCESS', 'DIFFERENCE', 'ERROR')
  ),
  run_date TEXT
);
