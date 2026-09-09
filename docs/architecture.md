# DeltaCore architecture

## Hexagonal layout

```
Browser  --VITE_DEV_PORT-->  Vite SPA
CLI argv --------------------+
                             v
                    ComparisonEngine / CatalogExplorer
                             |
              unixODBC + SQLite (sys_/biz_)
```

HTTP (`adapters/http`) and CLI (`adapters/cli`) are adapters only. They share `createBackendRuntime()`.

- **`packages/shared`**: ports and DTOs only (`IOdbcConnection`, `ISqlQueryProvider`, `IAuditRepository`, `IComparisonEngine`).
- **`apps/backend`**: application/domain plus adapters (HTTP, CLI, SQLite, SQL files, unixODBC). JWT validation on HTTP only.
- **`apps/frontend`**: React adapters. Auth via Keycloak; API calls go through Vite `/api` proxy in development (`VITE_API_PROXY_TARGET`).
- **Infrastructure**: Keycloak Compose, Db2 AZ7 generator, unixODBC driver under `infrastructure/odbc`.

SQL for engines is not in TypeScript. Load from `apps/backend/src/infrastructure/sql-dialects/<engine>/<feature>.sql` with `{{var}}` interpolation.

Db2 catalog dialect: `DB2_CATALOG=luw` → `db2/` (SYSCAT, Docker AZ7). `DB2_CATALOG=ibmi` → `db2-ibmi/` (QSYS2). IBM i SQL must not live in `db2/` or the LUW lab breaks.

## Comparison data sources

Sources are **ODBC DSNs**, not schemas. Origin and target are chosen per job.

1. **SQLite `biz_data_sources`** (`SqliteDataSourceStore`): `name`, `engine`, `odbc_dsn`, `search_path` (JSON array, IBM i `*LIBL*` order), `is_active`. Seed: `sql-dialects/sqlite/seed-lab.sql` (`AZ7DB`, `AZ7DBPRDCL`).
2. **UI / HTTP**: `GET /api/data-sources` feeds Comparar, Catálogo, and Diccionario. The user selects DSN origen and DSN destino on `/compare`.
3. **CLI**: `--source` / `--target` (default `DB2_ODBC_DSN` or `AZ7DB`; target defaults to source).
4. **unixODBC**: `scripts/apply-odbc-from-env.sh` writes a single DSN (`DB2_ODBC_DSN`) from `DB2_HOSTNAME`, `DB2_HOST_PORT`, `DB2_NAME`, `DB2_USER`, `DB2_PASSWORD`. Additional DSNs need extra `[section]` entries in `odbc.ini`.
5. **Connect string**: if `dsn === DB2_ODBC_DSN`, TCPIP from `.env`; else `DSN=<dsn>;`.
6. **Unknown DSN** (no SQLite row): engine `db2`, search path from `DB2_SEARCH_PATH`.

Schema resolution for unqualified tables uses `search_path` via `SchemaResolverService`. Volume and row compare can override with `--source-schema` / `--target-schema`.

## Dictionary (SQLite)

Tables `biz_data_dictionaries` and `biz_data_dictionary_columns` (`is_key`). Store: `SqliteDictionaryStore`.

- **Write UI**: `/dictionary` only (`PUT /api/dictionary`).
- **Read**: `GET /api/dictionary?table&schema&dsn` — SQLite first, then live `describeTable`.
- **Row compare**: if the request has no `--key`, use SQLite key columns, else catalog PK, else all columns.

## Compare jobs

`CompareJobRunner` posts results through `ComparisonEngine`:

| Mode | What |
| --- | --- |
| schema-compare | Column names/types (`schema-compare.sql`) |
| volume-compare | `COUNT(*)` per side |
| row-compare | Fetch both DSNs, compare in process (`rowCompare.ts`), limit default 10k |

HTTP: `POST /api/jobs/:id/{schema,volume,row}-compare` (JWT).

Frontend: `/compare`, `/dictionary`, `/catalog`, `/jobs`.

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
| Lab `*LIBL*` fallback | `DB2_SEARCH_PATH` |
| Db2 catalog SQL | `DB2_CATALOG` (`luw` \| `ibmi`) |
| Docker publish Db2 | `DB2_HOST_PORT`:`DB2_CONTAINER_PORT` |
| unixODBC install | `UNIXODBC_LIB_DIR`, optional `UNIXODBC_SYSCONF` |
| IBM CLI | `IBM_DB_HOME`, `IBM_DB_LIB` |

Scripts:

- `scripts/start.sh` / `stop.sh` / `status.sh` load `.env` via `scripts/load-env.sh`.
- `scripts/apply-odbc-from-env.sh` rewrites the primary DSN files before start.
- Vite `envDir` is the repo root so `VITE_*` is available to the SPA.
- Backend `tsx --env-file=../../.env`.
- Keycloak Compose `--env-file` at repo root.

Container-internal Keycloak HTTP remains `8080`; only the **host** port is configurable. Same idea for Db2: `DB2_CONTAINER_PORT` is the process inside the image (usually `50000`).

## Runtime notes

- Production target: IBM i PASE; this lab stack is Docker + macOS unixODBC.
- Changing the SPA port without updating Keycloak client redirect URIs will fail OIDC login.
- `GET /health` on the API is unauthenticated and used by `npm run status`.
- SQLite file: `apps/backend/data/deltacore.db` (gitignored). Re-seed with `npm run init:db` on a new file.
