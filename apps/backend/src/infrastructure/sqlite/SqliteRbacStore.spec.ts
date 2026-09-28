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
  it("records each login session once and lists user activity", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_users (id, sso_id, email) VALUES ('user-audit', 'sso-audit', 'audit@example.com')");
    const store = new SqliteRbacStore(db);

    store.recordLogin("user-audit", "session-1");
    store.recordLogin("user-audit", "session-1");
    store.recordLogin("user-audit", "session-2");
    store.recordActivity("user-audit", "POST", "/api/jobs/42/run", 200, "session-1");
    store.recordActivity("user-audit", "POST", "/api/jobs/43/run", 500, "session-1");

    const entries = store.listAuditLog("user-audit");
    expect(entries).toHaveLength(4);
    expect(entries.filter((entry) => entry.action === "login")).toHaveLength(2);
    expect(entries).toContainEqual(expect.objectContaining({
      email: "audit@example.com",
      action: "POST /api/jobs/42/run",
      payloadJson: JSON.stringify({
        method: "POST",
        route: "/api/jobs/42/run",
        statusCode: 200,
      }),
    }));
    expect(store.getAuditAnalytics({
      from: new Date().toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
      userId: "user-audit",
    })).toMatchObject({
      summary: {
        events: 4,
        sessions: 2,
        pageViews: 0,
        actions: 2,
        activeUsers: 1,
        returningUsers: 1,
        failedActions: 1,
      },
      users: [{ email: "audit@example.com", sessions: 2, actions: 2, activeDays: 1 }],
      modules: [
        { module: "Jobs", actions: 2, activeUsers: 1, failedActions: 1 },
      ],
    });
  });

  it("excludes analytics traffic and paginates functional history", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_users (id, sso_id, email) VALUES ('user-usage', 'sso-usage', 'usage@example.com')");
    const store = new SqliteRbacStore(db);
    const today = new Date().toISOString().slice(0, 10);

    store.recordLogin("user-usage", "session-usage");
    store.recordActivity("user-usage", "PAGE_VIEW", "/compare", 200, "session-usage");
    store.recordActivity("user-usage", "POST", "/api/jobs/:jobId/schema-compare", 200, "session-usage");
    store.recordActivity("user-usage", "PAGE_VIEW", "/activity", 200, "session-usage");
    store.recordActivity("user-usage", "GET", "/api/admin/audit-analytics", 200, "session-usage");

    const analytics = store.getAuditAnalytics({ from: today, to: today });
    expect(analytics.summary).toMatchObject({
      events: 3,
      sessions: 1,
      pageViews: 1,
      actions: 1,
      activeUsers: 1,
      failedActions: 0,
    });
    expect(analytics.modules).toEqual([{
      module: "Comparación",
      pageViews: 1,
      actions: 1,
      activeUsers: 1,
      failedActions: 0,
    }]);

    const firstPage = store.listAuditHistory({ from: today, to: today, offset: 0, limit: 1 });
    const secondPage = store.listAuditHistory({ from: today, to: today, offset: 1, limit: 1 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.entries).toHaveLength(1);
    expect(secondPage.entries).toHaveLength(1);
    expect(firstPage.entries[0].id).not.toBe(secondPage.entries[0].id);
    expect(store.listAuditHistory({
      from: today,
      to: today,
      search: "compare",
      offset: 0,
      limit: 10,
    }).total).toBe(2);
  });

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