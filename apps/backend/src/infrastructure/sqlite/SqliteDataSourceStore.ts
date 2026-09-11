import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { EngineType } from "@deltacore/shared";
import { parseSearchPath } from "../../domain/services/SchemaResolverService.js";

export type DataSourceMeta = {
  engine: EngineType;
  searchPath: string[];
};

const DEFAULT_ENGINE: EngineType = "db2";

export function defaultLabSearchPath(): string[] {
  const raw = process.env.DB2_SEARCH_PATH;
  if (raw) {
    return parseSearchPath(raw);
  }
  return ["AZBASWQA", "AZLOSWQACL", "AXSWQACL"];
}

export class SqliteDataSourceStore {
  constructor(private readonly db: DatabaseSync) {}

  lookup(dsn: string): DataSourceMeta {
    const row = this.db
      .prepare(
        `SELECT engine, search_path FROM biz_data_sources
         WHERE odbc_dsn = ? AND is_active = 1 LIMIT 1`,
      )
      .get(dsn) as { engine: string; search_path: string } | undefined;

    if (!row) {
      return { engine: DEFAULT_ENGINE, searchPath: defaultLabSearchPath() };
    }

    const engine = row.engine as EngineType;
    return {
      engine:
        engine === "oracle" || engine === "sqlserver" || engine === "db2"
          ? engine
          : DEFAULT_ENGINE,
      searchPath: parseSearchPath(row.search_path),
    };
  }

  list(search = ""): Array<{
    id: string;
    dsn: string;
    name: string;
    engine: EngineType;
    searchPath: string[];
  }> {
    const term = search.trim().toUpperCase();
    const rows = this.db
      .prepare(
        `SELECT id, name, engine, odbc_dsn, search_path
         FROM biz_data_sources
         WHERE is_active = 1
           AND (? = '' OR UPPER(name) LIKE '%' || ? || '%' OR UPPER(odbc_dsn) LIKE '%' || ? || '%')
         ORDER BY name`,
      )
      .all(term, term, term) as Array<{
      id: string;
      name: string;
      engine: string;
      odbc_dsn: string;
      search_path: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      dsn: row.odbc_dsn,
      engine:
        row.engine === "oracle" || row.engine === "sqlserver" || row.engine === "db2"
          ? row.engine
          : DEFAULT_ENGINE,
      searchPath: parseSearchPath(row.search_path),
    }));
  }

  save(input: {
    id?: string;
    name: string;
    dsn: string;
    engine?: EngineType;
    searchPath: string[];
  }): {
    id: string;
    dsn: string;
    name: string;
    engine: EngineType;
    searchPath: string[];
  } {
    const name = input.name.trim();
    const dsn = input.dsn.trim();
    if (!name || !dsn) {
      throw new Error("name and dsn are required");
    }
    const engine = input.engine ?? DEFAULT_ENGINE;
    const searchPath = input.searchPath.filter(Boolean);
    const existing = input.id
      ? (this.db
          .prepare("SELECT id FROM biz_data_sources WHERE id = ? LIMIT 1")
          .get(input.id) as { id: string } | undefined)
      : (this.db
          .prepare("SELECT id FROM biz_data_sources WHERE odbc_dsn = ? LIMIT 1")
          .get(dsn) as { id: string } | undefined);
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db
        .prepare(
          `UPDATE biz_data_sources
           SET name = ?, engine = ?, search_path = ?, is_active = 1
           WHERE id = ?`,
        )
        .run(name, engine, JSON.stringify(searchPath), id);
    } else {
      this.db
        .prepare(
          `INSERT INTO biz_data_sources
             (id, name, engine, odbc_dsn, is_active, search_path)
           VALUES (?, ?, ?, ?, 1, ?)`,
        )
        .run(id, name, engine, dsn, JSON.stringify(searchPath));
    }
    return { id, dsn, name, engine, searchPath };
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare("UPDATE biz_data_sources SET is_active = 0 WHERE id = ? AND is_active = 1")
      .run(id);
    return result.changes > 0;
  }
}
