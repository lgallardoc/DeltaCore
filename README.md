# DeltaCore

Enterprise DB Metadata Reconciliator. Hexagonal / Clean Architecture.

Target runtime is Node.js on IBM i v7.5 (PASE). Local development uses Docker Keycloak, Docker Db2 LUW (AZ7 catalog mock), and unixODBC on the host.

## Architecture

See [docs/architecture.md](docs/architecture.md) for layers, ports, data sources, and data flow.

```
apps/frontend     React adapters (Vite, Router, RBAC UI)
apps/backend      Express + CLI + unixODBC adapters, SQLite, SQL dialects
packages/shared   Ports and types (no Express, no React)
```

SQLite bounded contexts: `sys_*` (auth, RBAC, audit) and `biz_*` (connections, jobs, patterns, data dictionary).

SQL lives in `apps/backend/src/infrastructure/sql-dialects/<engine>/<feature>.sql` (`db2` | `db2-ibmi` | `oracle` | `sqlserver`) with `{{variable}}` interpolation. Shared ports: `IOdbcConnection`, `ISqlQueryProvider`, `IAuditRepository`, `IComparisonEngine`.

## Comparison sources (DSN)

A **source** is an ODBC DSN plus metadata in SQLite. You pick **origen** and **destino** on each compare (UI or CLI). They can be two DSNs or the same DSN with different schemas.

| Layer | Where | What it decides |
| --- | --- | --- |
| Logical catalog | SQLite `biz_data_sources` | Name, engine (`db2` / `oracle` / `sqlserver`), ODBC DSN, `*LIBL*` `search_path`, `is_active` |
| Lab seed | `apps/backend/src/infrastructure/sql-dialects/sqlite/seed-lab.sql` | Default rows: `AZ7DB` (AZ7 lab) and `AZ7DBPRDCL` (AZ7 PRDCL) |
| HTTP list | `GET /api/data-sources` | Active rows for the UI datalist |
| Per run | Comparar: DSN origen / DSN destino; CLI `--source` / `--target` | Which DSN is used for that job |
| Physical ODBC | `infrastructure/odbc/odbc.ini` via `scripts/apply-odbc-from-env.sh` | Host, port, database, user for **one** lab DSN (`DB2_ODBC_DSN`) |
| TCPIP shortcut | `connectionStringForDsn()` in `odbcEnv.ts` | If the DSN equals `DB2_ODBC_DSN`, connect with `DB2_*` from `.env`; otherwise `DSN=<name>;` (unixODBC) |
| Fallback | `DB2_SEARCH_PATH` in `.env` | `*LIBL*` when the DSN has **no** row in `biz_data_sources` |

**Add a source**

1. Register the DSN in unixODBC (`odbc.ini` / IBM CLI). `npm start` only writes the DSN named `DB2_ODBC_DSN`; extra DSNs (for example `AZ7DBPRDCL`) must be added to `odbc.ini` by hand or they will not connect.
2. Insert (or update) a row in `biz_data_sources` (`odbc_dsn` must match the unixODBC name). After changing the seed file, run `npm run init:db` on a **new** database, or `INSERT`/`UPDATE` in `apps/backend/data/deltacore.db` (`INSERT OR IGNORE` does not update existing rows).
3. In Comparar, choose the DSN in **DSN origen** and **DSN destino**. In CLI, pass `--source` and `--target`.

Schemas for volume/row compare are **not** the DSN: they are `--source-schema` / `--target-schema` (UI: esquema origen / destino).

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
| `npm stop` | Stop Vite, Express, Keycloak and `db2-az7` |
| `npm run stop:apps` | Stop only frontend (`VITE_DEV_PORT`) and backend (`PORT`) |
| `npm run stop:sso` | Stop Keycloak, leave Db2 and Node apps running |
| `npm test` | Workspace tests |
| `npm run init:db` | SQLite schema/seed |
| `npm run cli -- list-schemas` | Schemas assigned to a DSN (`*LIBL*`) and catalog presence |
| `npm run cli -- list-tables` | Tables in those schemas (`schema.table`) |

Stop Node + Docker with `npm stop`. Only the UI/API: `npm run stop:apps`. Then start again with `npm run dev` (apps) or `npm start` (infra + apps).

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

`npm start` regenerates `odbc.ini` / `db2dsdriver.cfg` from `.env` for **`DB2_ODBC_DSN` only**. Lab catalog SQL uses Db2 LUW `SYSCAT` when `DB2_CATALOG=luw` (`sql-dialects/db2`). IBM i uses `DB2_CATALOG=ibmi` and `sql-dialects/db2-ibmi` (`QSYS2`). Do not put IBM i SQL in the `db2/` folder (it breaks the AZ7 LUW lab). Default schema-compare table in the Jobs UI: `VITE_SCHEMA_COMPARE_TABLES` (e.g. `ACCCR7`).

### UI

Keycloak lab: `http://localhost:5173` (user `developer` / `dev123`).

| Route | Purpose |
| --- | --- |
| `/compare` | Schema, volume, and row compare. Choose DSNs, table, schemas, optional key, limit. Dictionary **save** is not on this page. |
| `/dictionary` | Load catalog columns, mark PK/key, save descriptions and keys in SQLite |
| `/catalog` | List schemas and tables for a DSN |
| `/jobs` | Comparison job list / detail |

Row compare fills **Clave** from SQLite (`GET /api/dictionary`) when keys were saved in Diccionario. If none, the engine uses catalog PK, then all columns. Result headers use dictionary descriptions when present.

HTTP (JWT): `POST /api/jobs/:id/{schema,volume,row}-compare`, `GET /api/catalog/*`, `GET /api/data-sources`, `GET`/`PUT /api/dictionary`.

### CLI (PASE / local operator)

Same `ComparisonEngine` as the HTTP adapter. Does not use Keycloak.

```bash
npm run cli -- help
npm run cli -- schema-compare --table ACCCR7
npm run cli -- schema-compare --source AZ7DB --target AZ7DB --table ACCCR7 --json
npm run cli -- volume-compare --source AZ7DB --target AZ7DBPRDCL --table ACCTX --source-schema AZBASWQA --target-schema AXSW1PDCL --json
npm run cli -- row-compare --source AZ7DB --target AZ7DBPRDCL --table ACCTX --source-schema AZBASWQA --target-schema AXSW1PDCL --key ID,CODE --json
npm run cli -- list-schemas --dsn AZ7DB
npm run cli -- find-table --table AZLHT
npm run cli -- find-table --table AZLHT --all-schemas
npm run cli -- describe-table --table ACCCR7
npm run cli -- describe-table --table ACCCR7 --schema AZBASWQA
```

`--key` is comma-separated (and/or repeatable). `--limit` default 10000 (max 50000). CHAR trailing spaces are trimmed on row compare.

Exit codes: `0` SUCCESS, `2` DIFFERENCE, `1` ERROR or usage error.

### SSO (lab)

Keycloak admin: `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` (defaults `admin` / `admin`). Realm `DeltaCoreRealm`, client `deltacore-frontend-client`, user `developer` / `dev123`. See [infrastructure/sso/README.md](infrastructure/sso/README.md).
