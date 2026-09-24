import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SqliteRbacStore } from "./SqliteRbacStore.js";

const schemaSql = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../sql-dialects/sqlite/init-schema.sql",
  ),
  "utf8",
);

describe("SqliteRbacStore profiles", () => {
  it("registers a new login with the admin profile", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_roles (id, name) VALUES ('role-admin', 'admin')");
    db.exec("INSERT INTO sys_roles (id, name) VALUES ('role-developer', 'developer')");
    const store = new SqliteRbacStore(db);

    const userId = store.ensureUser({
      sub: "sso-new",
      email: "new@example.com",
      preferredUsername: "new-user",
    });

    expect(store.listUsers()).toContainEqual(expect.objectContaining({
      id: userId,
      roles: ["admin"],
    }));
  });

  it("creates profiles and assigns them to users", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_users (id, sso_id, email) VALUES ('user-1', 'sso-1', 'user@example.com')");
    const store = new SqliteRbacStore(db);

    const role = store.saveRole({ name: "catalog-reader" });
    store.setUserRoles("user-1", [role.id]);

    expect(store.listRoles()).toContainEqual(expect.objectContaining(role));
    expect(store.listUsers()).toContainEqual({
      id: "user-1",
      ssoId: "sso-1",
      email: "user@example.com",
      roles: ["catalog-reader"],
    });
  });

  it("persists and resolves the run permission independently", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_users (id, sso_id, email) VALUES ('user-3', 'sso-3', 'runner@example.com')");
    db.exec("INSERT INTO sys_modules (id, name, path) VALUES ('mod-compare', 'COMPARE', '/compare')");
    const store = new SqliteRbacStore(db);
    const role = store.saveRole({ name: "comparison-runner" });
    store.saveRolePermission({
      roleId: role.id,
      moduleId: "mod-compare",
      canView: true,
      canRead: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canSave: false,
      canRun: true,
    });
    store.setUserRoles("user-3", [role.id]);

    expect(store.permissionsFor("user-3", "COMPARE")).toEqual({
      canView: true,
      canRead: true,
      canWrite: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canSave: false,
      canRun: true,
    });
  });

  it("does not delete built-in profiles", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_roles (id, name) VALUES ('role-admin', 'admin')");
    const store = new SqliteRbacStore(db);

    expect(() => store.removeRole("role-admin")).toThrow("Built-in profiles");
  });

  it("forces solo lectura to view-only even with stale stored permissions", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_users (id, sso_id, email) VALUES ('user-2', 'sso-2', 'readonly@example.com')");
    db.exec("INSERT INTO sys_roles (id, name) VALUES ('role-readonly', 'solo lectura')");
    db.exec("INSERT INTO sys_modules (id, name, path) VALUES ('mod-dictionary', 'DICTIONARY', '/dictionary')");
    db.exec("INSERT INTO sys_user_roles (user_id, role_id) VALUES ('user-2', 'role-readonly')");
    db.exec("INSERT INTO sys_role_permissions (role_id, module_id, can_view, can_read, can_write, can_create, can_edit, can_delete, can_save, can_run) VALUES ('role-readonly', 'mod-dictionary', 1, 1, 1, 1, 1, 1, 1, 1)");
    const store = new SqliteRbacStore(db);

    expect(store.permissionsFor("user-2", "DICTIONARY")).toEqual({
      canView: true,
      canRead: true,
      canWrite: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canSave: false,
      canRun: true,
    });
  });
});