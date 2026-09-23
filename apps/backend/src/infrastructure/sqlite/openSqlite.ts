import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function openSqlite(): DatabaseSync {
  const dataDir = path.resolve(here, "../../../data");
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "deltacore.db"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(path.resolve(here, "../sql-dialects/sqlite/init-schema.sql"), "utf8"));
  for (const column of ["can_create", "can_edit", "can_delete", "can_save"]) {
    try {
      db.exec(`ALTER TABLE sys_role_permissions ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    } catch {
      // Existing databases already contain the migrated column.
    }
  }
  db.exec(readFileSync(path.resolve(here, "../sql-dialects/sqlite/seed-rbac.sql"), "utf8"));
  db.exec(
    `INSERT OR IGNORE INTO sys_user_roles (user_id, role_id)
     SELECT user_id, 'role-admin' FROM sys_user_roles
     WHERE role_id = 'role-developer'`,
  );
  db.exec(readFileSync(path.resolve(here, "../sql-dialects/sqlite/seed-lab.sql"), "utf8"));
  return db;
}
