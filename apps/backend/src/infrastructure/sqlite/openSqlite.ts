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
  db.exec(readFileSync(path.resolve(here, "../sql-dialects/sqlite/seed-rbac.sql"), "utf8"));
  db.exec(readFileSync(path.resolve(here, "../sql-dialects/sqlite/seed-lab.sql"), "utf8"));
  return db;
}
