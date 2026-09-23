import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "./createApp.js";
import { createJwtVerifier } from "./jwt.js";
import { createBackendRuntime } from "../../composition/createBackendRuntime.js";

const runtime = createBackendRuntime();
const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
const keycloakRealm = process.env.KEYCLOAK_REALM ?? "DeltaCoreRealm";
const issuer =
  process.env.KEYCLOAK_ISSUER ?? `${keycloakUrl}/realms/${keycloakRealm}`;
const host = process.env.BACKEND_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const jwtClockToleranceSeconds = Number(process.env.JWT_CLOCK_TOLERANCE_SECONDS ?? 360);
const frontendDistDir = process.env.SERVE_FRONTEND === "true"
  ? path.resolve(process.env.FRONTEND_DIST_DIR ?? "../frontend/dist")
  : undefined;
const httpsCertificateFile = process.env.HTTPS_CERT_FILE;
const httpsKeyFile = process.env.HTTPS_KEY_FILE;

if (Boolean(httpsCertificateFile) !== Boolean(httpsKeyFile)) {
  throw new Error("HTTPS_CERT_FILE and HTTPS_KEY_FILE must be configured together");
}

const app = createApp({
  engine: runtime.engine,
  openConnection: runtime.openConnection,
  rbac: runtime.rbac,
  catalog: runtime.catalog,
  dictionaries: runtime.dictionaries,
  listDataSources: (search) => runtime.dataSources.list(search),
  saveDataSource: (input) => runtime.dataSources.save(input),
  deleteDataSource: (id) => runtime.dataSources.remove(id),
  verifyToken: createJwtVerifier(issuer, jwtClockToleranceSeconds),
  corsOrigin,
  frontendDistDir,
});

const server = httpsCertificateFile && httpsKeyFile
  ? createServer(
      {
        cert: readFileSync(path.resolve(httpsCertificateFile)),
        key: readFileSync(path.resolve(httpsKeyFile)),
      },
      app,
    )
  : app;

server.listen(port, host, () => {
  console.info(
    `DeltaCore API ${httpsCertificateFile ? "https" : "http"}://${host}:${port} ` +
      `catalog=${process.env.DB2_CATALOG ?? "luw"} ` +
      `issuer=${issuer} cors=${corsOrigin}`,
  );
});
