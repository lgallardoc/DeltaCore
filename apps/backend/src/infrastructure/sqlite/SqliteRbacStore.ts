import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RBACPermission } from "@deltacore/shared";
import type { AccessIdentity } from "../../domain/AccessIdentity.js";

type PermissionRecord = {
  moduleId: string;
  moduleName: string;
  canView: boolean;
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSave: boolean;
  canRun: boolean;
};

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class SqliteRbacStore {
  constructor(private readonly db: DatabaseSync) {
    try {
      db.exec("ALTER TABLE sys_audit_log ADD COLUMN auth_session_id TEXT");
    } catch {
      // Existing databases already contain the session column.
    }
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS sys_audit_login_session
       ON sys_audit_log (user_id, auth_session_id)
       WHERE action = 'login' AND auth_session_id IS NOT NULL`,
    );
  }

  recordLogin(userId: string, sessionId: string | null | undefined): void {
    if (!sessionId) return;
    this.db.prepare(
      `INSERT OR IGNORE INTO sys_audit_log
         (id, user_id, action, payload_json, auth_session_id)
       VALUES (?, ?, 'login', ?, ?)`,
    ).run(randomUUID(), userId, JSON.stringify({ sessionId }), sessionId);
  }

  recordActivity(
    userId: string,
    method: string,
    route: string,
    statusCode: number,
    sessionId?: string | null,
  ): void {
    this.db.prepare(
      `INSERT INTO sys_audit_log
         (id, user_id, action, payload_json, auth_session_id)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      userId,
      `${method} ${route}`.slice(0, 500),
      JSON.stringify({ method, route, statusCode }),
      sessionId ?? null,
    );
  }

  listAuditLog(userId?: string): Array<{
    id: string;
    userId: string;
    email: string;
    action: string;
    timestamp: string;
    payloadJson: string | null;
  }> {
    return this.db.prepare(
      `SELECT a.id, a.user_id AS userId, u.email, a.action, a.timestamp,
              a.payload_json AS payloadJson
       FROM sys_audit_log a
       JOIN sys_users u ON u.id = a.user_id
       WHERE (? IS NULL OR a.user_id = ?)
       ORDER BY a.timestamp DESC, a.id DESC
       LIMIT 500`,
    ).all(userId ?? null, userId ?? null) as Array<{
      id: string;
      userId: string;
      email: string;
      action: string;
      timestamp: string;
      payloadJson: string | null;
    }>;
  }

  getAuditAnalytics(input: {
    from: string;
    to: string;
    userId?: string;
  }): {
    summary: {
      events: number;
      sessions: number;
      pageViews: number;
      actions: number;
      activeUsers: number;
      returningUsers: number;
      failedActions: number;
    };
    comparison: {
      sessions: number;
      pageViews: number;
      actions: number;
      activeUsers: number;
      returningUsers: number;
      failedActions: number;
    };
    daily: Array<{
      date: string;
      sessions: number;
      pageViews: number;
      actions: number;
      activeUsers: number;
    }>;
    modules: Array<{
      module: string;
      pageViews: number;
      actions: number;
      activeUsers: number;
      failedActions: number;
    }>;
    users: Array<{
      userId: string;
      email: string;
      sessions: number;
      pageViews: number;
      actions: number;
      failedActions: number;
      activeDays: number;
      lastSeen: string;
    }>;
  } {
    const rangeFilter = `date(a.timestamp) BETWEEN ? AND ?
      AND (? IS NULL OR a.user_id = ?)`;
    const activityFilter = `(
      (a.action LIKE 'PAGE_VIEW %' AND a.action <> 'PAGE_VIEW /activity')
      OR (a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
        AND a.action NOT LIKE '% /api/admin%'
        AND a.action NOT LIKE '% /api/rbac%'
        AND a.action NOT LIKE '% /api/usage-events%')
    )`;
    const parametersFor = (from: string, to: string) => [
      from,
      to,
      input.userId ?? null,
      input.userId ?? null,
    ];
    const summaryFor = (from: string, to: string) => this.db.prepare(
      `SELECT SUM(CASE WHEN a.action = 'login' OR ${activityFilter} THEN 1 ELSE 0 END) AS events,
         COUNT(DISTINCT CASE WHEN a.action = 'login' THEN a.auth_session_id END) AS sessions,
         SUM(CASE WHEN a.action LIKE 'PAGE_VIEW %'
                    AND a.action <> 'PAGE_VIEW /activity' THEN 1 ELSE 0 END) AS pageViews,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                    AND a.action NOT LIKE '% /api/admin%'
                    AND a.action NOT LIKE '% /api/rbac%'
                    AND a.action NOT LIKE '% /api/usage-events%'
                  THEN 1 ELSE 0 END) AS actions,
         COUNT(DISTINCT CASE WHEN ${activityFilter} THEN a.user_id END) AS activeUsers,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                    AND a.action NOT LIKE '% /api/admin%'
                    AND a.action NOT LIKE '% /api/rbac%'
                    AND a.action NOT LIKE '% /api/usage-events%'
                    AND CAST(json_extract(a.payload_json, '$.statusCode') AS INTEGER) >= 400
                  THEN 1 ELSE 0 END) AS failedActions
       FROM sys_audit_log a WHERE ${rangeFilter}`,
    ).get(...parametersFor(from, to)) as {
      events: number;
      sessions: number | null;
      pageViews: number | null;
      actions: number | null;
      activeUsers: number;
      failedActions: number | null;
    };
    const returningUsersFor = (from: string, to: string) => {
      const result = this.db.prepare(
        `SELECT COUNT(*) AS returningUsers FROM (
           SELECT a.user_id
           FROM sys_audit_log a
           WHERE date(a.timestamp) BETWEEN ? AND ?
             AND (? IS NULL OR a.user_id = ?)
             AND a.action = 'login' AND a.auth_session_id IS NOT NULL
           GROUP BY a.user_id
           HAVING COUNT(DISTINCT a.auth_session_id) > 1
         )`,
      ).get(...parametersFor(from, to)) as { returningUsers: number };
      return result.returningUsers;
    };
    const summary = { ...summaryFor(input.from, input.to), returningUsers: returningUsersFor(input.from, input.to) };
    const rangeDays = Math.floor(
      (Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
    const comparisonTo = shiftIsoDate(input.from, -1);
    const comparisonFrom = shiftIsoDate(comparisonTo, -(rangeDays - 1));
    const comparison = {
      ...summaryFor(comparisonFrom, comparisonTo),
      returningUsers: returningUsersFor(comparisonFrom, comparisonTo),
    };
    const daily = this.db.prepare(
      `SELECT date(a.timestamp) AS date,
         COUNT(DISTINCT CASE WHEN a.action = 'login' THEN a.auth_session_id END) AS sessions,
         SUM(CASE WHEN a.action LIKE 'PAGE_VIEW %'
                    AND a.action <> 'PAGE_VIEW /activity' THEN 1 ELSE 0 END) AS pageViews,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                    AND a.action NOT LIKE '% /api/admin%'
                    AND a.action NOT LIKE '% /api/rbac%'
                    AND a.action NOT LIKE '% /api/usage-events%'
                  THEN 1 ELSE 0 END) AS actions,
         COUNT(DISTINCT CASE WHEN ${activityFilter} THEN a.user_id END) AS activeUsers
       FROM sys_audit_log a WHERE ${rangeFilter}
       GROUP BY date(a.timestamp) ORDER BY date(a.timestamp)`,
    ).all(...parametersFor(input.from, input.to)) as Array<{
      date: string;
      sessions: number;
      pageViews: number;
      actions: number;
      activeUsers: number;
    }>;
    const moduleExpr = `CASE
      WHEN a.action LIKE 'PAGE_VIEW /compare%' OR a.action LIKE '% /api/compare%'
        OR a.action LIKE '% /api/jobs/%-compare%' THEN 'Comparación'
      WHEN a.action LIKE 'PAGE_VIEW /catalog%' OR a.action LIKE '% /api/catalog%'
        OR a.action LIKE '% /api/data-sources%' THEN 'Catálogo'
      WHEN a.action LIKE 'PAGE_VIEW /dictionary%' OR a.action LIKE '% /api/dictionaries%'
        THEN 'Diccionario'
      WHEN a.action LIKE 'PAGE_VIEW /jobs%' OR a.action LIKE '% /api/jobs%' THEN 'Jobs'
      WHEN a.action LIKE 'PAGE_VIEW /profiles%' OR a.action LIKE 'PAGE_VIEW /users%' THEN 'Administración'
      WHEN a.action LIKE 'PAGE_VIEW /release%' THEN 'Novedades'
      ELSE 'Otros'
    END`;
    const modules = this.db.prepare(
      `SELECT ${moduleExpr} AS module,
         SUM(CASE WHEN a.action LIKE 'PAGE_VIEW %' THEN 1 ELSE 0 END) AS pageViews,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                  THEN 1 ELSE 0 END) AS actions,
         COUNT(DISTINCT CASE WHEN ${activityFilter} THEN a.user_id END) AS activeUsers,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                    AND CAST(json_extract(a.payload_json, '$.statusCode') AS INTEGER) >= 400
                  THEN 1 ELSE 0 END) AS failedActions
       FROM sys_audit_log a WHERE ${rangeFilter} AND ${activityFilter}
       GROUP BY module ORDER BY actions + pageViews DESC, module`,
    ).all(...parametersFor(input.from, input.to)) as Array<{
      module: string;
      pageViews: number;
      actions: number;
      activeUsers: number;
      failedActions: number;
    }>;
    const users = this.db.prepare(
      `SELECT a.user_id AS userId, u.email,
         COUNT(DISTINCT CASE WHEN a.action = 'login' THEN a.auth_session_id END) AS sessions,
         SUM(CASE WHEN a.action LIKE 'PAGE_VIEW %'
                    AND a.action <> 'PAGE_VIEW /activity' THEN 1 ELSE 0 END) AS pageViews,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                    AND a.action NOT LIKE '% /api/admin%'
                    AND a.action NOT LIKE '% /api/rbac%'
                    AND a.action NOT LIKE '% /api/usage-events%'
                  THEN 1 ELSE 0 END) AS actions,
         SUM(CASE WHEN a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
                    AND a.action NOT LIKE '% /api/admin%'
                    AND a.action NOT LIKE '% /api/rbac%'
                    AND a.action NOT LIKE '% /api/usage-events%'
                    AND CAST(json_extract(a.payload_json, '$.statusCode') AS INTEGER) >= 400
                  THEN 1 ELSE 0 END) AS failedActions,
         COUNT(DISTINCT CASE WHEN ${activityFilter} THEN date(a.timestamp) END) AS activeDays,
         MAX(a.timestamp) AS lastSeen
       FROM sys_audit_log a JOIN sys_users u ON u.id = a.user_id
       WHERE ${rangeFilter} AND (a.action = 'login' OR ${activityFilter})
      GROUP BY a.user_id, u.email
      ORDER BY sessions + pageViews + actions DESC, u.email`,
    ).all(...parametersFor(input.from, input.to)) as Array<{
      userId: string;
      email: string;
      sessions: number;
      pageViews: number;
      actions: number;
      failedActions: number;
      activeDays: number;
      lastSeen: string;
    }>;
    return {
      summary: {
        events: summary.events,
        sessions: summary.sessions ?? 0,
        pageViews: summary.pageViews ?? 0,
        actions: summary.actions ?? 0,
        activeUsers: summary.activeUsers,
        returningUsers: summary.returningUsers,
        failedActions: summary.failedActions ?? 0,
      },
      comparison: {
        sessions: comparison.sessions ?? 0,
        pageViews: comparison.pageViews ?? 0,
        actions: comparison.actions ?? 0,
        activeUsers: comparison.activeUsers,
        returningUsers: comparison.returningUsers,
        failedActions: comparison.failedActions ?? 0,
      },
      daily,
      modules,
      users,
    };
  }

  listAuditHistory(input: {
    from: string;
    to: string;
    userId?: string;
    search?: string;
    offset: number;
    limit: number;
  }): {
    entries: Array<{
      id: string;
      userId: string;
      email: string;
      action: string;
      timestamp: string;
      payloadJson: string | null;
    }>;
    total: number;
    offset: number;
    limit: number;
  } {
    const filter = `date(a.timestamp) BETWEEN ? AND ?
      AND (? IS NULL OR a.user_id = ?)
      AND (a.action = 'login'
        OR (a.action LIKE 'PAGE_VIEW %' AND a.action <> 'PAGE_VIEW /activity')
        OR (a.action <> 'login' AND a.action NOT LIKE 'PAGE_VIEW %'
          AND a.action NOT LIKE '% /api/admin%'
          AND a.action NOT LIKE '% /api/rbac%'
          AND a.action NOT LIKE '% /api/usage-events%'))
      AND (? = '' OR instr(lower(u.email || ' ' || a.action), lower(?)) > 0)`;
    const parameters = [
      input.from,
      input.to,
      input.userId ?? null,
      input.userId ?? null,
      input.search?.trim() ?? "",
      input.search?.trim() ?? "",
    ];
    const total = this.db.prepare(
      `SELECT COUNT(*) AS total
       FROM sys_audit_log a JOIN sys_users u ON u.id = a.user_id
       WHERE ${filter}`,
    ).get(...parameters) as { total: number };
    const entries = this.db.prepare(
      `SELECT a.id, a.user_id AS userId, u.email, a.action, a.timestamp,
              a.payload_json AS payloadJson
       FROM sys_audit_log a JOIN sys_users u ON u.id = a.user_id
       WHERE ${filter}
       ORDER BY a.timestamp DESC, a.id DESC LIMIT ? OFFSET ?`,
    ).all(...parameters, input.limit, input.offset) as Array<{
      id: string;
      userId: string;
      email: string;
      action: string;
      timestamp: string;
      payloadJson: string | null;
    }>;
    return { entries, total: total.total, offset: input.offset, limit: input.limit };
  }

  listUsers(): Array<{ id: string; ssoId: string; email: string; roles: string[] }> {
    const users = this.db
      .prepare("SELECT id, sso_id, email FROM sys_users ORDER BY email")
      .all() as Array<{ id: string; sso_id: string; email: string }>;
    const roleQuery = this.db.prepare(
      `SELECT r.id, r.name
       FROM sys_user_roles ur
       JOIN sys_roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.name`,
    );
    return users.map((user) => ({
      id: user.id,
      ssoId: user.sso_id,
      email: user.email,
      roles: (roleQuery.all(user.id) as Array<{ id: string; name: string }>).map(
        (role) => role.name,
      ),
    }));
  }

  listRoles(): Array<{ id: string; name: string; permissions: PermissionRecord[] }> {
    const roles = this.db
      .prepare("SELECT id, name FROM sys_roles ORDER BY name")
      .all() as Array<{ id: string; name: string }>;
    const permissionQuery = this.db.prepare(
      `SELECT m.id AS module_id, m.name AS module_name,
         p.can_view, p.can_read, p.can_create, p.can_edit, p.can_delete, p.can_save, p.can_run
       FROM sys_modules m
       LEFT JOIN sys_role_permissions p ON p.module_id = m.id AND p.role_id = ?
       ORDER BY m.name`,
    );
    return roles.map((role) => ({
      ...role,
      permissions: (permissionQuery.all(role.id) as Array<Record<string, unknown>>).map(
        (permission) => ({
          moduleId: String(permission.module_id),
          moduleName: String(permission.module_name),
          canView: Boolean(permission.can_view),
          canRead: Boolean(permission.can_read),
          canCreate: Boolean(permission.can_create),
          canEdit: Boolean(permission.can_edit),
          canDelete: Boolean(permission.can_delete),
          canSave: Boolean(permission.can_save),
          canRun: Boolean(permission.can_run),
        }),
      ),
    }));
  }

  listModules(): Array<{ id: string; name: string; path: string }> {
    return this.db
      .prepare("SELECT id, name, path FROM sys_modules ORDER BY name")
      .all() as Array<{ id: string; name: string; path: string }>;
  }

  updateUser(userId: string, email: string): { id: string; email: string } {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("A valid email is required");
    }
    const result = this.db
      .prepare("UPDATE sys_users SET email = ? WHERE id = ?")
      .run(normalizedEmail, userId);
    if (result.changes === 0) {
      throw new Error("User not found");
    }
    return { id: userId, email: normalizedEmail };
  }

  saveRole(input: { id?: string; name: string }): { id: string; name: string } {
    const name = input.name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9 _-]{1,39}$/.test(name)) {
      throw new Error("Profile name must contain 2-40 lowercase letters, numbers, _ or -");
    }
    const existing = input.id
      ? (this.db.prepare("SELECT id FROM sys_roles WHERE id = ?").get(input.id) as
          | { id: string }
          | undefined)
      : undefined;
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db.prepare("UPDATE sys_roles SET name = ? WHERE id = ?").run(name, id);
    } else {
      this.db.prepare("INSERT INTO sys_roles (id, name) VALUES (?, ?)").run(id, name);
    }
    return { id, name };
  }

  saveRolePermission(input: {
    roleId: string;
    moduleId: string;
    canView: boolean;
    canRead: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canSave: boolean;
    canRun: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO sys_role_permissions
           (role_id, module_id, can_view, can_read, can_write, can_create, can_edit, can_delete, can_save, can_run)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(role_id, module_id) DO UPDATE SET
           can_view = excluded.can_view,
           can_read = excluded.can_read,
           can_write = excluded.can_view OR excluded.can_create OR excluded.can_edit OR excluded.can_delete OR excluded.can_save OR excluded.can_run,
           can_create = excluded.can_create,
           can_edit = excluded.can_edit,
           can_delete = excluded.can_delete,
           can_save = excluded.can_save,
           can_run = excluded.can_run`,
      )
      .run(
        input.roleId,
        input.moduleId,
        Number(input.canView),
        Number(input.canRead),
        Number(input.canView || input.canCreate || input.canEdit || input.canDelete || input.canSave),
        Number(input.canCreate),
        Number(input.canEdit),
        Number(input.canDelete),
        Number(input.canSave),
        Number(input.canRun),
      );
  }

  removeRole(id: string): boolean {
    const role = this.db.prepare("SELECT name FROM sys_roles WHERE id = ?").get(id) as
      | { name: string }
      | undefined;
    if (role?.name === "admin" || role?.name === "developer") {
      throw new Error("Built-in profiles cannot be deleted");
    }
    const result = this.db.prepare("DELETE FROM sys_roles WHERE id = ?").run(id);
    return result.changes > 0;
  }

  setUserRoles(userId: string, roleIds: string[]): string[] {
    const user = this.db.prepare("SELECT id FROM sys_users WHERE id = ?").get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length !== 1) {
      throw new Error("A user must have exactly one profile");
    }
    const placeholders = uniqueRoleIds.map(() => "?").join(",");
    if (uniqueRoleIds.length > 0) {
      const count = this.db
        .prepare(`SELECT COUNT(*) AS count FROM sys_roles WHERE id IN (${placeholders})`)
        .get(...uniqueRoleIds) as { count: number };
      if (count.count !== uniqueRoleIds.length) {
        throw new Error("One or more profiles do not exist");
      }
    }
    const readonlyRole = this.db
      .prepare("SELECT id FROM sys_roles WHERE name = 'solo lectura' LIMIT 1")
      .get() as { id: string } | undefined;
    const effectiveRoleIds = readonlyRole && uniqueRoleIds.includes(readonlyRole.id)
      ? uniqueRoleIds.filter((roleId) => roleId !== "role-admin" && roleId !== "role-developer")
      : uniqueRoleIds;
    this.db.prepare("DELETE FROM sys_user_roles WHERE user_id = ?").run(userId);
    const insert = this.db.prepare(
      "INSERT INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
    );
    for (const roleId of effectiveRoleIds) {
      insert.run(userId, roleId);
    }
    return effectiveRoleIds;
  }

  normalizeUserRoles(): void {
    const users = this.db.prepare("SELECT id FROM sys_users").all() as Array<{ id: string }>;
    const roles = this.db.prepare(
      `SELECT ur.user_id, ur.role_id, r.name
       FROM sys_user_roles ur JOIN sys_roles r ON r.id = ur.role_id
       ORDER BY CASE r.name WHEN 'solo lectura' THEN 0 WHEN 'admin' THEN 1 WHEN 'developer' THEN 2 ELSE 3 END, r.name`,
    ).all() as Array<{ user_id: string; role_id: string; name: string }>;
    const rolesByUser = new Map<string, string>();
    for (const role of roles) {
      if (!rolesByUser.has(role.user_id)) rolesByUser.set(role.user_id, role.role_id);
    }
    const remove = this.db.prepare("DELETE FROM sys_user_roles WHERE user_id = ? AND role_id <> ?");
    for (const user of users) {
      const roleId = rolesByUser.get(user.id);
      if (roleId) remove.run(user.id, roleId);
    }
  }

  isAdmin(userId: string): boolean {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 FROM sys_user_roles ur
           JOIN sys_roles r ON r.id = ur.role_id
           WHERE ur.user_id = ? AND r.name = 'admin' LIMIT 1`,
        )
        .get(userId),
    );
  }

  ensureUser(identity: AccessIdentity): string {
    const adminIdentifiers = this.adminEmails();
    const isAdmin = [identity.email, identity.preferredUsername]
      .filter((value): value is string => Boolean(value))
      .some((value) => adminIdentifiers.has(value.trim().toLowerCase()));
    const existing = this.db
      .prepare(
        `SELECT id FROM sys_users
         WHERE sso_id = ? OR email = ? LIMIT 1`,
      )
      .get(identity.sub, identity.email ?? "") as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare("UPDATE sys_users SET sso_id = ? WHERE id = ?")
        .run(identity.sub, existing.id);
      this.grantDefaultRole(existing.id, isAdmin);
      return existing.id;
    }

    const id = randomUUID();
    const email =
      identity.email ??
      `${identity.preferredUsername ?? identity.sub}@deltacore.local`;
    this.db
      .prepare("INSERT INTO sys_users (id, sso_id, email) VALUES (?, ?, ?)")
      .run(id, identity.sub, email);
    this.grantDefaultRole(id, true);
    return id;
  }

  permissionsFor(userId: string, moduleName: string): RBACPermission {
    const isReadonly = this.db
      .prepare(
        `SELECT 1 FROM sys_user_roles ur
         JOIN sys_roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND r.name = 'solo lectura' LIMIT 1`,
      )
      .get(userId);
    if (isReadonly) {
      const canView = moduleName !== "PROFILES" && moduleName !== "USERS";
      const readonlyPermission = this.db
        .prepare(
          `SELECT MAX(p.can_run) AS can_run
           FROM sys_user_roles ur
           JOIN sys_role_permissions p ON p.role_id = ur.role_id
           JOIN sys_modules m ON m.id = p.module_id
           WHERE ur.user_id = ? AND m.name = ?`,
        )
        .get(userId, moduleName) as { can_run: number | null } | undefined;
      return {
        canView,
        canRead: canView,
        canWrite: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canSave: false,
        canRun: Boolean(readonlyPermission?.can_run),
      };
    }
    const isAdmin = this.db
      .prepare(
        `SELECT 1
         FROM sys_user_roles ur
         JOIN sys_roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND r.name = 'admin'
         LIMIT 1`,
      )
      .get(userId);
    if (isAdmin) {
      return {
        canView: true,
        canRead: true,
        canWrite: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canSave: true,
        canRun: true,
      };
    }

    const row = this.db
      .prepare(
        `SELECT
           MAX(p.can_view) AS can_view,
           MAX(p.can_read) AS can_read,
           MAX(p.can_write) AS can_write,
           MAX(p.can_create) AS can_create,
           MAX(p.can_edit) AS can_edit,
           MAX(p.can_delete) AS can_delete,
           MAX(p.can_save) AS can_save,
           MAX(p.can_run) AS can_run
         FROM sys_user_roles ur
         JOIN sys_role_permissions p ON p.role_id = ur.role_id
         JOIN sys_modules m ON m.id = p.module_id
         WHERE ur.user_id = ? AND m.name = ?`,
      )
      .get(userId, moduleName) as
      | {
          can_view: number | null;
          can_read: number | null;
          can_write: number | null;
          can_create: number | null;
          can_edit: number | null;
          can_delete: number | null;
          can_save: number | null;
          can_run: number | null;
        }
      | undefined;

    return {
      canView: Boolean(row?.can_view),
      canRead: Boolean(row?.can_read),
      canWrite: Boolean(row?.can_write),
      canCreate: Boolean(row?.can_create),
      canEdit: Boolean(row?.can_edit),
      canDelete: Boolean(row?.can_delete),
      canSave: Boolean(row?.can_save),
      canRun: Boolean(row?.can_run),
    };
  }

  private grantDefaultRole(userId: string, isAdmin: boolean): void {
    if (isAdmin) {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, 'role-admin')",
        )
        .run(userId);
      return;
    }
    const hasRole = this.db
      .prepare("SELECT 1 FROM sys_user_roles WHERE user_id = ? LIMIT 1")
      .get(userId);
    if (hasRole) {
      return;
    }
    this.db
      .prepare(
        "INSERT OR IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, 'role-developer')",
      )
      .run(userId);
  }

  private adminEmails(): Set<string> {
    return new Set(
      (process.env.RBAC_ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }
}
