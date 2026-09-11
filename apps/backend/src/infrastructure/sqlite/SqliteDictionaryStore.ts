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
  keyOrder?: number;
};

export type SavedDictionary = {
  id: string;
  schema: string;
  table: string;
  tableDescription: string;
  rowCount: number;
  sourceDsn: string;
  updatedAt: string;
  origin: "saved";
  columns: DictionaryColumn[];
  keyColumns: string[];
};

export class SqliteDictionaryStore {
  constructor(private readonly db: DatabaseSync) {
    this.ensureKeyOrderColumn();
    this.ensureTableDescriptionColumn();
    this.ensureRowCountColumn();
    this.ensureTableScopedDictionaryKey();
  }

  get(schema: string, table: string): SavedDictionary | undefined {
    const tableName = table.trim().toUpperCase();
    if (!tableName) {
      return undefined;
    }
    const row = this.db
      .prepare(
        `SELECT id, schema_name, table_name, table_description, row_count, source_dsn, updated_at
         FROM biz_data_dictionaries
        WHERE table_name = ?
        ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(tableName) as
      | {
          id: string;
          schema_name: string;
          table_name: string;
          table_description: string;
          row_count: number;
          source_dsn: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return undefined;
    }
    return this.hydrate(row);
  }

  list(sourceDsn?: string): SavedDictionary[] {
    const dsn = sourceDsn?.trim() ?? "";
    const rows = this.db
      .prepare(
        `SELECT id, schema_name, table_name, table_description, row_count, source_dsn, updated_at
         FROM biz_data_dictionaries
         WHERE ? = '' OR source_dsn = ?
         ORDER BY table_name`,
      )
      .all(dsn, dsn) as Array<{
      id: string;
      schema_name: string;
      table_name: string;
      table_description: string;
      row_count: number;
      source_dsn: string;
      updated_at: string;
    }>;
    return rows.map((row) => this.hydrate(row));
  }

  delete(schema: string, table: string): boolean {
    const schemaName = schema.trim().toUpperCase();
    const tableName = table.trim().toUpperCase();
    if (!schemaName || !tableName) {
      return false;
    }
    const result = this.db
      .prepare(
        `DELETE FROM biz_data_dictionaries
         WHERE schema_name = ? AND table_name = ?`,
      )
      .run(schemaName, tableName);
    return result.changes > 0;
  }

  deleteAll(sourceDsn: string): number {
    const dsn = sourceDsn.trim();
    if (!dsn) {
      return 0;
    }
    const result = this.db
      .prepare("DELETE FROM biz_data_dictionaries WHERE source_dsn = ?")
      .run(dsn);
    return Number(result.changes);
  }

  save(input: {
    schema: string;
    table: string;
    tableDescription?: string;
    rowCount?: number;
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
        WHERE table_name = ?`,
      )
      .get(table) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db
        .prepare(
          `UPDATE biz_data_dictionaries
            SET schema_name = ?,
                table_description = COALESCE(NULLIF(?, ''), table_description),
              row_count = ?,
                source_dsn = ?,
                updated_at = datetime('now')
           WHERE id = ?`,
        )
          .run(
            schema,
            input.tableDescription?.trim() ?? "",
            input.rowCount ?? 0,
            input.sourceDsn?.trim() ?? "",
            id,
          );
      this.db
        .prepare(`DELETE FROM biz_data_dictionary_columns WHERE dictionary_id = ?`)
        .run(id);
    } else {
      this.db
        .prepare(
           `INSERT INTO biz_data_dictionaries (
              id, schema_name, table_name, table_description, row_count, source_dsn
            ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .run(
            id,
            schema,
            table,
            input.tableDescription?.trim() ?? "",
            input.rowCount ?? 0,
            input.sourceDsn?.trim() ?? "",
          );
    }
    const insert = this.db.prepare(
      `INSERT INTO biz_data_dictionary_columns (
         dictionary_id, column_no, column_name, description, data_type,
         length, scale, nullable, is_key, key_order, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        column.keyOrder ?? null,
        index,
      );
    });
    const saved = this.get("", table);
    if (!saved) {
      throw new Error("failed to save dictionary");
    }
    return saved;
  }

  private ensureTableScopedDictionaryKey(): void {
    this.db.exec(`
      DELETE FROM biz_data_dictionary_columns
      WHERE dictionary_id IN (
        SELECT older.id
        FROM biz_data_dictionaries older
        WHERE EXISTS (
          SELECT 1
          FROM biz_data_dictionaries newer
          WHERE newer.table_name = older.table_name
            AND (
              newer.updated_at > older.updated_at
              OR (newer.updated_at = older.updated_at AND newer.id > older.id)
            )
        )
      );

      DELETE FROM biz_data_dictionaries
      WHERE id IN (
        SELECT older.id
        FROM biz_data_dictionaries older
        WHERE EXISTS (
          SELECT 1
          FROM biz_data_dictionaries newer
          WHERE newer.table_name = older.table_name
            AND (
              newer.updated_at > older.updated_at
              OR (newer.updated_at = older.updated_at AND newer.id > older.id)
            )
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_biz_data_dictionaries_table
        ON biz_data_dictionaries (table_name);
    `);
  }

  private hydrate(row: {
    id: string;
    schema_name: string;
    table_name: string;
    table_description: string;
    row_count: number;
    source_dsn: string;
    updated_at: string;
  }): SavedDictionary {
    const columns = (
      this.db
        .prepare(
           `SELECT column_no, column_name, description, data_type, length, scale,
                    nullable, is_key, key_order
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
        key_order: number | null;
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
      keyOrder: column.key_order ?? undefined,
    }));
    return {
      id: row.id,
      schema: row.schema_name,
      table: row.table_name,
      tableDescription: row.table_description,
      rowCount: row.row_count,
      sourceDsn: row.source_dsn,
      updatedAt: row.updated_at,
      origin: "saved",
      columns,
      keyColumns: columns
        .filter((column) => column.isKey)
        .sort((left, right) =>
          (left.keyOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.keyOrder ?? Number.MAX_SAFE_INTEGER),
        )
        .map((column) => column.columnName),
    };
  }

  private ensureKeyOrderColumn(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(biz_data_dictionary_columns)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "key_order")) {
      this.db.exec("ALTER TABLE biz_data_dictionary_columns ADD COLUMN key_order INTEGER");
    }
  }

  private ensureTableDescriptionColumn(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(biz_data_dictionaries)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "table_description")) {
      this.db.exec(
        "ALTER TABLE biz_data_dictionaries ADD COLUMN table_description TEXT NOT NULL DEFAULT ''",
      );
    }
  }

  private ensureRowCountColumn(): void {
    const columns = this.db
      .prepare("PRAGMA table_info(biz_data_dictionaries)")
      .all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "row_count")) {
      this.db.exec(
        "ALTER TABLE biz_data_dictionaries ADD COLUMN row_count INTEGER NOT NULL DEFAULT 0",
      );
    }
  }
}
