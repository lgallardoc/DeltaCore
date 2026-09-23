import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RBACPermission } from "@deltacore/shared";
import type { AccessIdentity } from "../../domain/AccessIdentity.js";

export class SqliteRbacStore {
  constructor(private readonly db: DatabaseSync) {}

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
    if (identity.email) {
      this.db
        .prepare("UPDATE sys_users SET sso_id = ?, email = ? WHERE id = ?")
        .run(identity.sub, identity.email, existing.id);
    } else {
      this.db
        .prepare("UPDATE sys_users SET sso_id = ? WHERE id = ?")
        .run(identity.sub, existing.id);
    }
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
    this.grantDefaultRole(id, isAdmin);
    return id;
  }

  permissionsFor(userId: string, moduleName: string): RBACPermission {
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
      return { canView: true, canRead: true, canWrite: true };
    }

    const row = this.db
      .prepare(
        `SELECT
           MAX(p.can_view) AS can_view,
           MAX(p.can_read) AS can_read,
           MAX(p.can_write) AS can_write
         FROM sys_user_roles ur
         JOIN sys_role_permissions p ON p.role_id = ur.role_id
         JOIN sys_modules m ON m.id = p.module_id
         WHERE ur.user_id = ? AND m.name = ?`,
      )
      .get(userId, moduleName) as
      | { can_view: number | null; can_read: number | null; can_write: number | null }
      | undefined;

    return {
      canView: Boolean(row?.can_view),
      canRead: Boolean(row?.can_read),
      canWrite: Boolean(row?.can_write),
    };
  }

  private grantDefaultRole(userId: string, isAdmin: boolean): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, 'role-developer')",
      )
      .run(userId);
    if (isAdmin) {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, 'role-admin')",
        )
        .run(userId);
    }
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
