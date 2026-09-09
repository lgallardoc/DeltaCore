import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogExplorer } from "../application/CatalogExplorer.js";
import { ComparisonEngine } from "../application/ComparisonEngine.js";
import { SchemaResolverService } from "../domain/services/SchemaResolverService.js";
import { NodeTextFileReader } from "../infrastructure/fs/NodeTextFileReader.js";
import { applyOdbcRuntimeEnv } from "../infrastructure/odbc/odbcEnv.js";
import {
  openUnixOdbcConnection,
  UnixOdbcConnection,
} from "../infrastructure/odbc/UnixOdbcConnection.js";
import { SqlQueryProvider } from "../infrastructure/sql/SqlQueryProvider.js";
import { openSqlite } from "../infrastructure/sqlite/openSqlite.js";
import { SqliteDataSourceStore } from "../infrastructure/sqlite/SqliteDataSourceStore.js";
import { SqliteDictionaryStore } from "../infrastructure/sqlite/SqliteDictionaryStore.js";
import { SqliteRbacStore } from "../infrastructure/sqlite/SqliteRbacStore.js";
import type { ConnectionFactory } from "../application/CompareJobRunner.js";
import type { IComparisonEngine } from "@deltacore/shared";

export type BackendRuntime = {
  repoRoot: string;
  engine: IComparisonEngine;
  openConnection: ConnectionFactory;
  rbac: SqliteRbacStore;
  catalog: CatalogExplorer;
  dataSources: SqliteDataSourceStore;
  dictionaries: SqliteDictionaryStore;
};

export function createBackendRuntime(): BackendRuntime {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../../../../");
  applyOdbcRuntimeEnv(repoRoot);

  const dialectsRoot = path.resolve(here, "../infrastructure/sql-dialects");
  const db = openSqlite();
  const rbac = new SqliteRbacStore(db);
  const dataSources = new SqliteDataSourceStore(db);
  const queries = new SqlQueryProvider(dialectsRoot, new NodeTextFileReader());
  const schemaResolver = new SchemaResolverService(queries);
  const engine = new ComparisonEngine(
    queries,
    { logAction: async () => undefined },
    () => randomUUID(),
    schemaResolver,
    (connection) =>
      connection instanceof UnixOdbcConnection
        ? connection.searchPath
        : dataSources.lookup(process.env.DB2_ODBC_DSN ?? "AZ7DB").searchPath,
  );

  const openConnection: ConnectionFactory = async (dsn) => {
    const meta = dataSources.lookup(dsn);
    return openUnixOdbcConnection(dsn, meta.engine, meta.searchPath);
  };
  const catalog = new CatalogExplorer(
    queries,
    (dsn) => dataSources.lookup(dsn),
    openConnection,
  );
  const dictionaries = new SqliteDictionaryStore(db);

  return {
    repoRoot,
    engine,
    rbac,
    openConnection,
    catalog,
    dataSources,
    dictionaries,
  };
}
