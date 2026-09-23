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
      roles: ["admin", "developer"],
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

  it("does not delete built-in profiles", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    db.exec("INSERT INTO sys_roles (id, name) VALUES ('role-admin', 'admin')");
    const store = new SqliteRbacStore(db);

    expect(() => store.removeRole("role-admin")).toThrow("Built-in profiles");
  });
});