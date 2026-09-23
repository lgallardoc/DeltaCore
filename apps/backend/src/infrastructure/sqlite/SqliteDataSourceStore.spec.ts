import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SqliteDataSourceStore } from "./SqliteDataSourceStore.js";

const schemaSql = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../sql-dialects/sqlite/init-schema.sql",
  ),
  "utf8",
);

describe("SqliteDataSourceStore", () => {
  it("allows multiple assigned names for the same DSN", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    const store = new SqliteDataSourceStore(db);

    const first = store.save({
      name: "QA Chile",
      dsn: "AZ7DB",
      searchPath: ["AZBASWQA"],
    });
    const second = store.save({
      name: "QA Colombia",
      dsn: "AZ7DB",
      searchPath: ["AZCO"] ,
    });

    expect(second.id).not.toBe(first.id);
    expect(store.list()).toEqual([
      expect.objectContaining({ name: "QA Chile", dsn: "AZ7DB" }),
      expect.objectContaining({ name: "QA Colombia", dsn: "AZ7DB" }),
    ]);
  });

  it("updates the catalog identified by the assigned name alone", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(schemaSql);
    const store = new SqliteDataSourceStore(db);

    const first = store.save({
      name: "QA Chile",
      dsn: "OTHER_DSN",
      searchPath: ["AZBASWQA"],
    });
    const updated = store.save({
      name: "QA Chile",
      dsn: "AZ7DB",
      searchPath: ["AZBASWQA", "AZLOSWQACL"],
    });

    expect(updated.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.searchPath).toEqual(["AZBASWQA", "AZLOSWQACL"]);
    expect(store.list()[0]?.dsn).toBe("AZ7DB");
  });
});
