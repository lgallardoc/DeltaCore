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
    `UPDATE sys_role_permissions
     SET can_view = 0, can_read = 0, can_write = 0,
         can_create = 0, can_edit = 0, can_delete = 0, can_save = 0
     WHERE role_id = 'role-readonly'
       AND module_id IN (SELECT id FROM sys_modules WHERE name IN ('PROFILES', 'USERS'))`,
  );
  db.exec(
    `DELETE FROM sys_user_roles
     WHERE role_id IN ('role-admin', 'role-developer')
       AND user_id IN (
         SELECT ur.user_id FROM sys_user_roles ur
         JOIN sys_roles r ON r.id = ur.role_id
         WHERE r.name = 'solo lectura'
       )`,
  );
  rbacNormalizeUserRoles(db);
  db.exec(readFileSync(path.resolve(here, "../sql-dialects/sqlite/seed-lab.sql"), "utf8"));
  return db;
}

function rbacNormalizeUserRoles(db: DatabaseSync): void {
  const users = db.prepare("SELECT id FROM sys_users").all() as Array<{ id: string }>;
  const roles = db.prepare(
    `SELECT ur.user_id, ur.role_id, r.name
     FROM sys_user_roles ur JOIN sys_roles r ON r.id = ur.role_id
     ORDER BY CASE r.name WHEN 'solo lectura' THEN 0 WHEN 'admin' THEN 1 WHEN 'developer' THEN 2 ELSE 3 END, r.name`,
  ).all() as Array<{ user_id: string; role_id: string; name: string }>;
  const selected = new Map<string, string>();
  for (const role of roles) if (!selected.has(role.user_id)) selected.set(role.user_id, role.role_id);
  const remove = db.prepare("DELETE FROM sys_user_roles WHERE user_id = ? AND role_id <> ?");
  for (const user of users) {
    const roleId = selected.get(user.id);
    if (roleId) remove.run(user.id, roleId);
  }
}
