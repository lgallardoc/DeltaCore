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

1. Register the DSN in unixODBC (`odbc.ini` / IBM CLI). `pnpm start` only writes the DSN named `DB2_ODBC_DSN`; extra DSNs (for example `AZ7DBPRDCL`) must be added to `odbc.ini` by hand or they will not connect.
2. Insert (or update) a row in `biz_data_sources` (`odbc_dsn` must match the unixODBC name). After changing the seed file, run `pnpm run init:db` on a **new** database, or `INSERT`/`UPDATE` in `apps/backend/data/deltacore.db` (`INSERT OR IGNORE` does not update existing rows).
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
pnpm install
cp .env.example .env   # first time only; start.sh also copies if missing
pnpm run init:db
pnpm start              # Keycloak + Db2 (if image exists) + frontend + backend
```

Package manager: **pnpm** (workspace defined in `pnpm-workspace.yaml`). `pnpm install` may prompt to approve native build scripts (`odbc`, `esbuild`) on first run; they are pre-approved via `allowBuilds` in `pnpm-workspace.yaml`.

| Command | Effect |
| --- | --- |
| `pnpm start` | Apply ODBC from `.env`, start Keycloak, start/create `db2-az7`, then `pnpm run dev` |
| `pnpm run start:infra` | Same infrastructure only (no Vite/Express) |
| `pnpm run dev` | Concurrent backend (`PORT`) and frontend (`VITE_DEV_PORT`) |
| `pnpm run status` | Print configured ports and HTTP/Docker health |
| `pnpm stop` | Stop Vite, Express, Keycloak and `db2-az7` |
| `pnpm run stop:apps` | Stop only frontend (`VITE_DEV_PORT`) and backend (`PORT`) |
| `pnpm run stop:sso` | Stop Keycloak, leave Db2 and Node apps running |
| `pnpm test` | Workspace tests (`pnpm -r --if-present run test`) |
| `pnpm run init:db` | SQLite schema/seed |
| `pnpm run cli -- list-schemas` | Schemas assigned to a DSN (`*LIBL*`) and catalog presence |
| `pnpm run cli -- list-tables` | Tables in those schemas (`schema.table`) |

Stop Node + Docker with `pnpm stop`. Only the UI/API: `pnpm run stop:apps`. Then start again with `pnpm run dev` (apps) or `pnpm start` (infra + apps).

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

DSN files are **not** tied to where unixODBC is installed. `source infrastructure/odbc/env.sh` sets `ODBCINI` / `ODBCSYSINI` to `infrastructure/odbc/`. The Driver Manager (`libodbc`) **is** tied to the prefix used when you ran `pnpm install` (which builds the native `odbc` addon).

If unixODBC lives somewhere else (otro Homebrew, `/usr/local`, PASE):

1. Set `UNIXODBC_LIB_DIR` in `.env` to the directory that contains `libodbc.dylib` or `libodbc.so`.
2. Rebuild the native addon on **that** machine: `pnpm --filter @deltacore/backend rebuild odbc`.
3. Optionally set `IBM_DB_HOME` and `IBM_DB_LIB` if the IBM CLI is not under `infrastructure/odbc/clidriver`.

```bash
source infrastructure/odbc/env.sh
isql -v AZ7DB   # DSN name is DB2_ODBC_DSN
```

`pnpm start` regenerates `odbc.ini` / `db2dsdriver.cfg` from `.env` for **`DB2_ODBC_DSN` only**. Lab catalog SQL uses Db2 LUW `SYSCAT` when `DB2_CATALOG=luw` (`sql-dialects/db2`). IBM i uses `DB2_CATALOG=ibmi` and `sql-dialects/db2-ibmi` (`QSYS2`). Do not put IBM i SQL in the `db2/` folder (it breaks the AZ7 LUW lab). Default schema-compare table in the Jobs UI: `VITE_SCHEMA_COMPARE_TABLES` (e.g. `ACCCR7`).

### UI

Keycloak lab: `http://localhost:5173` (user `developer` / `dev123`).

| Route | Purpose |
| --- | --- |
| `/compare` | Schema, volume, and row compare. Choose origin/target DSNs, then select one or more saved local dictionaries from the origin. |
| `/dictionary` | Manage saved dictionaries by DSN: load local/catalog entries, edit fields/keys, and remove one table or all dictionaries for a DSN. |
| `/catalog` | List schemas and tables for a DSN |
| `/jobs` | Comparison job list / detail |

The comparison selector lists local dictionaries from the origin DSN with their table descriptions, column counts, and saved keys. Selected tables are placed first in the list and the execution button remains disabled until at least one table is selected. Row compare uses the saved key for each selected table; if no key is saved, the engine uses catalog PK, then all columns. Result headers use dictionary descriptions when present.

### Schema comparison UI

Schema comparison analyzes each requested table sequentially against the live origin and target catalogs. The progress bar reports the current table and the number completed.

The summary displays one row per table: table name, description, integrity percentage, final status, and **Ver**. The description comes from the saved dictionary for the origin DSN; if it is absent, the application queries the live origin catalog. The summary does not load local column dictionaries.

**Ver** opens a modal that fetches `GET /api/catalog/describe` from both DSNs on demand. It shows field descriptions (origin first, target as fallback), data types, lengths, decimal scales, and the field comparison status.

### Volume and row comparison UI

Volume returns a consolidated table with one row per selected table: description, origin and target record counts, record delta, origin and target physical sizes, and size delta. IBM i physical size comes from `QSYS2.SYSTABLESTAT.DATA_SIZE` and is presented using Chilean numeric formatting.

Row comparison returns a consolidated table with record counts and links for changed rows, rows only in origin, and rows only in target. Each link opens a detail page for that table and category. Changed-row details display the origin value on the first line and target value on the second line; changed cells carry an alert marker. The first key column remains fixed while scrolling. Detail pages resolve the local source dictionary and source metadata again so current table/field descriptions and assigned DSN names are visible.

Every detail page with **Volver** returns to `/compare` with the original mode, DSNs, limit, selected tables, and results restored.

All temporary success, warning, and error notices use the global bottom banner. It has a close button and closes automatically after three seconds. ODBC and SQL errors are displayed in full, including available driver diagnostics.

HTTP (JWT): `POST /api/jobs/:id/{schema,volume,row}-compare`, `GET /api/catalog/*`, `GET /api/data-sources`, `GET`/`PUT`/`DELETE /api/dictionary`.

### CLI (PASE / local operator)

Same `ComparisonEngine` as the HTTP adapter. Does not use Keycloak.

```bash
pnpm run cli -- help
pnpm run cli -- schema-compare --table ACCCR7
pnpm run cli -- schema-compare --source AZ7DB --target AZ7DB --table ACCCR7 --json
pnpm run cli -- volume-compare --source AZ7DB --target AZ7DBPRDCL --table ACCTX --source-schema AZBASWQA --target-schema AXSW1PDCL --json
pnpm run cli -- row-compare --source AZ7DB --target AZ7DBPRDCL --table ACCTX --source-schema AZBASWQA --target-schema AXSW1PDCL --key ID,CODE --json
pnpm run cli -- list-schemas --dsn AZ7DB
pnpm run cli -- find-table --table AZLHT
pnpm run cli -- find-table --table AZLHT --all-schemas
pnpm run cli -- describe-table --table ACCCR7
pnpm run cli -- describe-table --table ACCCR7 --schema AZBASWQA
```

`--key` is comma-separated (and/or repeatable). `--limit` default 10000 (max 50000). CHAR trailing spaces are trimmed on row compare.

Exit codes: `0` SUCCESS, `2` DIFFERENCE, `1` ERROR or usage error.

### SSO (lab)

Keycloak admin: `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` (defaults `admin` / `admin`). Realm `DeltaCoreRealm`, client `deltacore-frontend-client`, user `developer` / `dev123`. See [infrastructure/sso/README.md](infrastructure/sso/README.md).
