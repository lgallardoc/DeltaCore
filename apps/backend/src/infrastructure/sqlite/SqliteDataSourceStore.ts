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
}
