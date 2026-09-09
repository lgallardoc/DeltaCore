import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type DictionaryColumn = {
  columnNo: string;
  columnName: string;
  description: string;
  dataType: string;
  length: string;
  scale: string;
  nullable: string;
  isKey: boolean;
};

export type SavedDictionary = {
  id: string;
  schema: string;
  table: string;
  sourceDsn: string;
  updatedAt: string;
  origin: "sqlite";
  columns: DictionaryColumn[];
  keyColumns: string[];
};

export class SqliteDictionaryStore {
  constructor(private readonly db: DatabaseSync) {}

  get(schema: string, table: string): SavedDictionary | undefined {
    const schemaName = schema.trim().toUpperCase();
    const tableName = table.trim().toUpperCase();
    if (!tableName) {
      return undefined;
    }
    const row = this.db
      .prepare(
        `SELECT id, schema_name, table_name, source_dsn, updated_at
         FROM biz_data_dictionaries
         WHERE table_name = ?
           AND (schema_name = ? OR ? = '')
         ORDER BY CASE WHEN schema_name = ? THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1`,
      )
      .get(tableName, schemaName, schemaName, schemaName) as
      | {
          id: string;
          schema_name: string;
          table_name: string;
          source_dsn: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return this.hydrate(row);
  }

  save(input: {
    schema: string;
    table: string;
    sourceDsn?: string;
    columns: DictionaryColumn[];
  }): SavedDictionary {
    const schema = input.schema.trim().toUpperCase();
    const table = input.table.trim().toUpperCase();
    if (!schema || !table) {
      throw new Error("schema and table are required to save a dictionary");
    }
    if (input.columns.length === 0) {
      throw new Error("dictionary must include at least one column");
    }
    const existing = this.db
      .prepare(
        `SELECT id FROM biz_data_dictionaries
         WHERE schema_name = ? AND table_name = ?`,
      )
      .get(schema, table) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db
        .prepare(
          `UPDATE biz_data_dictionaries
           SET source_dsn = ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(input.sourceDsn?.trim() ?? "", id);
      this.db
        .prepare(`DELETE FROM biz_data_dictionary_columns WHERE dictionary_id = ?`)
        .run(id);
    } else {
      this.db
        .prepare(
          `INSERT INTO biz_data_dictionaries (id, schema_name, table_name, source_dsn)
           VALUES (?, ?, ?, ?)`,
        )
        .run(id, schema, table, input.sourceDsn?.trim() ?? "");
    }
    const insert = this.db.prepare(
      `INSERT INTO biz_data_dictionary_columns (
         dictionary_id, column_no, column_name, description, data_type,
         length, scale, nullable, is_key, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.columns.forEach((column, index) => {
      const name = column.columnName.trim().toUpperCase();
      if (!name) {
        return;
      }
      insert.run(
        id,
        column.columnNo ?? "",
        name,
        column.description?.trim() ?? "",
        column.dataType ?? "",
        column.length ?? "",
        column.scale ?? "",
        column.nullable ?? "",
        column.isKey ? 1 : 0,
        index,
      );
    });
    const saved = this.get(schema, table);
    if (!saved) {
      throw new Error("failed to save dictionary");
    }
    return saved;
  }

  private hydrate(row: {
    id: string;
    schema_name: string;
    table_name: string;
    source_dsn: string;
    updated_at: string;
  }): SavedDictionary {
    const columns = (
      this.db
        .prepare(
          `SELECT column_no, column_name, description, data_type, length, scale,
                  nullable, is_key
           FROM biz_data_dictionary_columns
           WHERE dictionary_id = ?
           ORDER BY sort_order, column_name`,
        )
        .all(row.id) as Array<{
        column_no: string;
        column_name: string;
        description: string;
        data_type: string;
        length: string;
        scale: string;
        nullable: string;
        is_key: number;
      }>
    ).map((column) => ({
      columnNo: column.column_no,
      columnName: column.column_name,
      description: column.description,
      dataType: column.data_type,
      length: column.length,
      scale: column.scale,
      nullable: column.nullable,
      isKey: Boolean(column.is_key),
    }));
    return {
      id: row.id,
      schema: row.schema_name,
      table: row.table_name,
      sourceDsn: row.source_dsn,
      updatedAt: row.updated_at,
      origin: "sqlite",
      columns,
      keyColumns: columns.filter((column) => column.isKey).map((column) => column.columnName),
    };
  }
}
