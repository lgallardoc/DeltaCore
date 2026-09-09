import { ComparisonEngine } from "../../application/ComparisonEngine.js";
import { SchemaResolverService } from "../../domain/services/SchemaResolverService.js";
import { NodeTextFileReader } from "../../infrastructure/fs/NodeTextFileReader.js";
import { applyOdbcRuntimeEnv } from "../../infrastructure/odbc/odbcEnv.js";
import { openUnixOdbcConnection, UnixOdbcConnection } from "../../infrastructure/odbc/UnixOdbcConnection.js";
import { SqlQueryProvider } from "../../infrastructure/sql/SqlQueryProvider.js";
import { openSqlite } from "../../infrastructure/sqlite/openSqlite.js";
import { SqliteDataSourceStore } from "../../infrastructure/sqlite/SqliteDataSourceStore.js";
import { SqliteRbacStore } from "../../infrastructure/sqlite/SqliteRbacStore.js";
import { createApp } from "./createApp.js";
import { createJwtVerifier } from "./jwt.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
applyOdbcRuntimeEnv(repoRoot);

const dialectsRoot = path.resolve(here, "../../infrastructure/sql-dialects");
const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const keycloakRealm = process.env.KEYCLOAK_REALM ?? "DeltaCoreRealm";
const issuer =
  process.env.KEYCLOAK_ISSUER ?? `${keycloakUrl}/realms/${keycloakRealm}`;
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

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

const app = createApp({
  engine,
  openConnection: async (dsn) => {
    const meta = dataSources.lookup(dsn);
    return openUnixOdbcConnection(dsn, meta.engine, meta.searchPath);
  },
  rbac,
  verifyToken: createJwtVerifier(issuer),
  corsOrigin,
});

app.listen(port, () => {
  console.info(
    `DeltaCore API :${port} issuer=${issuer} cors=${corsOrigin}`,
  );
});
