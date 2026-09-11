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
      tableDescription: "Contextos de transacción",
      rowCount: 42,
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
    expect(found?.origin).toBe("saved");
    expect(found?.tableDescription).toBe("Contextos de transacción");
    expect(found?.rowCount).toBe(42);
    expect(found?.keyColumns).toEqual(["CTXFUE", "CTXCTX"]);
    expect(found?.columns[2]?.description).toBe("Descripcion");
    expect(store.get("", "ACCTX")?.schema).toBe("AZBASWQA");
  });

  it("replaces a dictionary for the same table regardless of schema", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(schemaSql);
    const store = new SqliteDictionaryStore(db);
    const column = {
      columnNo: "1",
      columnName: "ID",
      description: "Updated description",
      dataType: "INTEGER",
      length: "4",
      scale: "0",
      nullable: "N",
      isKey: false,
    };

    store.save({ schema: "FIRST", table: "ACCTX", columns: [column] });
    store.save({ schema: "SECOND", table: "ACCTX", columns: [column] });

    const found = store.get("FIRST", "ACCTX");
    expect(found?.schema).toBe("SECOND");
    expect(found?.columns[0]?.description).toBe("Updated description");
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM biz_data_dictionaries WHERE table_name = ?")
        .get("ACCTX"),
    ).toEqual({ count: 1 });
  });

  it("keeps the table description when an update does not provide one", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(schemaSql);
    const store = new SqliteDictionaryStore(db);
    const column = {
      columnNo: "1",
      columnName: "ID",
      description: "Identifier",
      dataType: "INTEGER",
      length: "4",
      scale: "0",
      nullable: "N",
      isKey: true,
    };

    store.save({
      schema: "AZBASWQA",
      table: "ACCTX",
      tableDescription: "Contextos de transacción",
      columns: [column],
    });
    store.save({ schema: "AZBASWQA", table: "ACCTX", columns: [column] });

    expect(store.get("AZBASWQA", "ACCTX")?.tableDescription).toBe(
      "Contextos de transacción",
    );
  });

  it("deletes a dictionary by schema and table", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(schemaSql);
    const store = new SqliteDictionaryStore(db);
    const column = {
      columnNo: "1",
      columnName: "ID",
      description: "Identifier",
      dataType: "INTEGER",
      length: "4",
      scale: "0",
      nullable: "N",
      isKey: true,
    };

    store.save({ schema: "AZBASWQA", table: "ACCTX", columns: [column] });

    expect(store.delete("azbaswqa", "acctx")).toBe(true);
    expect(store.get("AZBASWQA", "ACCTX")).toBeUndefined();
  });

  it("deletes all dictionaries for a data source", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(schemaSql);
    const store = new SqliteDictionaryStore(db);
    const column = {
      columnNo: "1",
      columnName: "ID",
      description: "Identifier",
      dataType: "INTEGER",
      length: "4",
      scale: "0",
      nullable: "N",
      isKey: true,
    };

    store.save({ schema: "ONE", table: "FIRST", sourceDsn: "AZ7DB", columns: [column] });
    store.save({ schema: "TWO", table: "SECOND", sourceDsn: "AZ7DB", columns: [column] });
    store.save({ schema: "THREE", table: "THIRD", sourceDsn: "OTHER", columns: [column] });

    expect(store.deleteAll("AZ7DB")).toBe(2);
    expect(store.list("AZ7DB")).toEqual([]);
    expect(store.list("OTHER")).toHaveLength(1);
  });
});
