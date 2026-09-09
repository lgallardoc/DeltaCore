import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeDataModel } from "./initializeDataModel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(
  here,
  "../sql-dialects/sqlite/init-schema.sql",
);
const dataDir = path.resolve(here, "../../../data");
const dbPath = path.join(dataDir, "deltacore.db");

/**
 * Applies the sys_/biz_ schema. Without a native SQLite binding this writes
 * the concatenated DDL next to the intended DB path for the sqlite3 CLI:
 *   sqlite3 data/deltacore.db < init-schema.sql
 */
async function main(): Promise<void> {
  const schemaSql = await readFile(schemaPath, "utf8");
  await mkdir(dataDir, { recursive: true });

  const statements = { sql: "" };
  await initializeDataModel(
    {
      exec(sql) {
        statements.sql += sql;
      },
    },
    schemaSql,
  );

  await writeFile(path.join(dataDir, "init-schema.applied.sql"), statements.sql);
  process.stdout.write(
    `Schema staged. Apply with:\n  sqlite3 ${dbPath} < ${schemaPath}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
