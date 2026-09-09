# DeltaCore

Enterprise DB Metadata Reconciliator. Hexagonal / Clean Architecture.

Target runtime is Node.js on IBM i v7.5 (PASE). Local development uses Docker Keycloak, Docker Db2 LUW (AZ7 catalog mock), and unixODBC on the host.

## Architecture

See [docs/architecture.md](docs/architecture.md) for layers, ports, and data flow.

```
apps/frontend     React adapters (Vite, Router, RBAC UI)
apps/backend      Express + unixODBC adapters, SQLite, SQL dialects
packages/shared   Ports and types (no Express, no React)
```

SQLite bounded contexts: `sys_*` (auth, RBAC, audit) and `biz_*` (connections, jobs, patterns).

SQL lives in `apps/backend/src/infrastructure/sql-dialects/<engine>/<feature>.sql` (`db2` | `oracle` | `sqlserver`) with `{{variable}}` interpolation. Shared ports: `IOdbcConnection`, `ISqlQueryProvider`, `IAuditRepository`, `IComparisonEngine`.

## Ports (all from `.env`)

Copy `.env.example` to `.env`. Do not hardcode ports in application code; change them here.

| Layer | Variable | Default | Role |
| --- | --- | --- | --- |
| Vite UI | `VITE_DEV_PORT` | `5173` | Browser origin for the SPA |
| Vite → API | `VITE_API_PROXY_TARGET` | `http://127.0.0.1:4000` | Dev proxy for `/api` |
| Browser CORS | `CORS_ORIGIN` | `http://localhost:5173` | Allowed origin on Express (must match the UI URL) |
| Express API | `PORT` | `4000` | HTTP listen port (`GET /health`) |
| SPA → Keycloak | `VITE_KEYCLOAK_URL` | `http://localhost:8080` | OIDC issuer host used by `keycloak-js` |
| API → Keycloak | `KEYCLOAK_URL` / `KEYCLOAK_REALM` | `8080` / `DeltaCoreRealm` | JWT JWKS / issuer |
| Keycloak Docker | `KEYCLOAK_HTTP_PORT` | `8080` | Host mapping to container `8080` |
| Db2 host | `DB2_HOSTNAME` + `DB2_HOST_PORT` | `127.0.0.1:50000` | unixODBC / CLI |
| Db2 container | `DB2_CONTAINER_PORT` | `50000` | Inside the Db2 image |

Changing `VITE_DEV_PORT` also requires matching redirect URIs in `infrastructure/sso/deltacore-realm.json` (Keycloak import does not expand `.env`).

## Commands

From the repo root (`nodeapp/DeltaCore`). Docker Desktop must be running for Keycloak and Db2.

```bash
npm install
cp .env.example .env   # first time only; start.sh also copies if missing
npm run init:db
npm start              # Keycloak + Db2 (if image exists) + frontend + backend
```

| Command | Effect |
| --- | --- |
| `npm start` | Apply ODBC from `.env`, start Keycloak, start/create `db2-az7`, then `npm run dev` |
| `npm run start:infra` | Same infrastructure only (no Vite/Express) |
| `npm run dev` | Concurrent backend (`PORT`) and frontend (`VITE_DEV_PORT`) |
| `npm run status` | Print configured ports and HTTP/Docker health |
| `npm stop` | Stop Keycloak and `db2-az7` |
| `npm run stop:sso` | Stop Keycloak, leave Db2 running |
| `npm test` | Workspace tests |
| `npm run init:db` | SQLite schema/seed |

Stop the Node processes with **Ctrl+C** in the terminal that ran `npm start` / `npm run dev`. `npm stop` only stops Docker infrastructure.

### Lab Db2 (first time)

```bash
cd infrastructure/db2-az7-generator
npm install
npm run generate
npm run build:docker
# image is started by npm start, or: npm run up  (ports from environment)
```

On Apple Silicon, Db2 must use `--platform linux/amd64` and base image `icr.io/db2_community/db2`.

### unixODBC

DSN files are **not** tied to where unixODBC is installed. `source infrastructure/odbc/env.sh` sets `ODBCINI` / `ODBCSYSINI` to `infrastructure/odbc/`. The Driver Manager (`libodbc`) **is** tied to the prefix used when you ran `npm install odbc`.

If unixODBC lives somewhere else (otro Homebrew, `/usr/local`, PASE):

1. Set `UNIXODBC_LIB_DIR` in `.env` to the directory that contains `libodbc.dylib` or `libodbc.so`.
2. Rebuild the native addon on **that** machine: `npm rebuild odbc -w @deltacore/backend`.
3. Optionally set `IBM_DB_HOME` and `IBM_DB_LIB` if the IBM CLI is not under `infrastructure/odbc/clidriver`.

```bash
source infrastructure/odbc/env.sh
isql -v AZ7DB   # DSN name is DB2_ODBC_DSN
```

`npm start` regenerates `odbc.ini` / `db2dsdriver.cfg` from `.env`. Lab schema lookup uses Db2 LUW `SYSCAT` (not IBM i `QSYS2`). Default compare table: `VITE_SCHEMA_COMPARE_TABLES` (e.g. `ACCCR7`).

### SSO (lab)

Keycloak admin: `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` (defaults `admin` / `admin`). Realm `DeltaCoreRealm`, client `deltacore-frontend-client`, user `developer` / `dev123`.
