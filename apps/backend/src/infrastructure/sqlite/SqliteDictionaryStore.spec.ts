import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SqliteDictionaryStore } from "./SqliteDictionaryStore.js";

const schemaSql = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../sql-dialects/sqlite/init-schema.sql",
  ),
  "utf8",
);

describe("SqliteDictionaryStore", () => {
  it("saves columns and key flags, then finds by table name", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(schemaSql);
    const store = new SqliteDictionaryStore(db);

    store.save({
      schema: "azbaswqa",
      table: "acctx",
      sourceDsn: "AZ7DB",
      columns: [
        {
          columnNo: "1",
          columnName: "CTXFUE",
          description: "Fuente",
          dataType: "CHAR",
          length: "3",
          scale: "0",
          nullable: "N",
          isKey: true,
        },
        {
          columnNo: "2",
          columnName: "CTXCTX",
          description: "Codigo transaccion",
          dataType: "CHAR",
          length: "6",
          scale: "0",
          nullable: "N",
          isKey: true,
        },
        {
          columnNo: "3",
          columnName: "CTXDSC",
          description: "Descripcion",
          dataType: "CHAR",
          length: "30",
          scale: "0",
          nullable: "Y",
          isKey: false,
        },
      ],
    });

    const found = store.get("AZBASWQA", "ACCTX");
    expect(found?.origin).toBe("sqlite");
    expect(found?.keyColumns).toEqual(["CTXFUE", "CTXCTX"]);
    expect(found?.columns[2]?.description).toBe("Descripcion");
    expect(store.get("", "ACCTX")?.schema).toBe("AZBASWQA");
  });
});
