import { createApp } from "./createApp.js";
import { createJwtVerifier } from "./jwt.js";
import { createBackendRuntime } from "../../composition/createBackendRuntime.js";

const runtime = createBackendRuntime();
const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const keycloakRealm = process.env.KEYCLOAK_REALM ?? "DeltaCoreRealm";
const issuer =
  process.env.KEYCLOAK_ISSUER ?? `${keycloakUrl}/realms/${keycloakRealm}`;
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

const app = createApp({
  engine: runtime.engine,
  openConnection: runtime.openConnection,
  rbac: runtime.rbac,
  catalog: runtime.catalog,
  dictionaries: runtime.dictionaries,
  listDataSources: (search) => runtime.dataSources.list(search),
  saveDataSource: (input) => runtime.dataSources.save(input),
  deleteDataSource: (id) => runtime.dataSources.remove(id),
  verifyToken: createJwtVerifier(issuer),
  corsOrigin,
});

app.listen(port, () => {
  console.info(
    `DeltaCore API :${port} catalog=${process.env.DB2_CATALOG ?? "luw"} ` +
      `issuer=${issuer} cors=${corsOrigin}`,
  );
});
