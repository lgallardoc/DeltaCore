# DeltaCore architecture

## Hexagonal layout

```
Browser  --VITE_DEV_PORT-->  Vite SPA
   |                              |
   |  /api (proxy)                |  OIDC (VITE_KEYCLOAK_URL)
   v                              v
Express API (PORT)  --JWKS-->  Keycloak (KEYCLOAK_HTTP_PORT)
   |
   |  unixODBC (DB2_HOSTNAME:DB2_HOST_PORT)
   v
Db2 LUW lab (Docker)     SQLite (sys_* / biz_*)
```

- **`packages/shared`**: ports and DTOs only (`IOdbcConnection`, `ISqlQueryProvider`, `IAuditRepository`, `IComparisonEngine`).
- **`apps/backend`**: application/domain plus adapters (HTTP, SQLite, SQL files, future unixODBC). JWT validation against Keycloak issuer.
- **`apps/frontend`**: React adapters. Auth via Keycloak; API calls go through Vite `/api` proxy in development (`VITE_API_PROXY_TARGET`).
- **Infrastructure**: Keycloak Compose, Db2 AZ7 generator, unixODBC driver under `infrastructure/odbc`.

SQL for engines is not in TypeScript. Load from `apps/backend/src/infrastructure/sql-dialects/<engine>/<feature>.sql` with `{{var}}` interpolation.

## Parameterized connections

Single source of truth: repository-root `.env` (see `.env.example`).

| Hop | Env vars |
| --- | --- |
| Browser → SPA | `VITE_DEV_PORT`, `CORS_ORIGIN` |
| SPA → API (dev) | `VITE_API_PROXY_TARGET`, `PORT` |
| SPA → Keycloak | `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` |
| API → Keycloak | `KEYCLOAK_URL`, `KEYCLOAK_REALM`, optional `KEYCLOAK_ISSUER` |
| Host → Keycloak container | `KEYCLOAK_HTTP_PORT` (maps to container 8080) |
| Host / ODBC → Db2 | `DB2_HOSTNAME`, `DB2_HOST_PORT`, `DB2_NAME`, `DB2_USER`, `DB2_PASSWORD`, `DB2_ODBC_DSN` |
| Docker publish Db2 | `DB2_HOST_PORT`:`DB2_CONTAINER_PORT` |
| unixODBC install | `UNIXODBC_LIB_DIR`, optional `UNIXODBC_SYSCONF` |
| IBM CLI | `IBM_DB_HOME`, `IBM_DB_LIB` |

Scripts:

- `scripts/start.sh` / `stop.sh` / `status.sh` load `.env` via `scripts/load-env.sh`.
- `scripts/apply-odbc-from-env.sh` rewrites DSN files before start.
- Vite `envDir` is the repo root so `VITE_*` is available to the SPA.
- Backend `tsx --env-file=../../.env`.
- Keycloak Compose `--env-file` at repo root.

Container-internal Keycloak HTTP remains `8080`; only the **host** port is configurable. Same idea for Db2: `DB2_CONTAINER_PORT` is the process inside the image (usually `50000`).

## Runtime notes

- Production target: IBM i PASE; this lab stack is Docker + macOS unixODBC.
- Changing the SPA port without updating Keycloak client redirect URIs will fail OIDC login.
- `GET /health` on the API is unauthenticated and used by `npm run status`.
