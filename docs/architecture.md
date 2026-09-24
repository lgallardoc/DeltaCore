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

### Production / IBM i topology

In IBM i, Vite is not executed on PASE because its `esbuild` dependency has no
`os400 ppc64` binary. The frontend is built on the development machine with
`npm run build:itg`, synchronized as `apps/frontend/dist`, and served by the
compiled Express process.

The production topology follows the `coreweb` pattern:

```text
Browser
  https://fdesa01.falabella.cl/deltacore/
    |
    v
Nginx :443 (TLS, /deltacore/)
    |
    v
Node/Express 127.0.0.1:30222
  - static SPA
  - /deltacore/api/* -> /api/*
  - JWT validation and RBAC
    |
    v
SQLite + IBM i unixODBC
```

Nginx must forward the `Authorization` header. The Keycloak client must allow
the public redirect URI:
`https://fdesa01.falabella.cl/deltacore/*`.

HTTP (`adapters/http`) and CLI (`adapters/cli`) are adapters only. They share `createBackendRuntime()`.

- **`packages/shared`**: ports and DTOs only (`IOdbcConnection`, `ISqlQueryProvider`, `IAuditRepository`, `IComparisonEngine`).
- **`apps/backend`**: application/domain plus adapters (HTTP, CLI, SQLite, SQL files, unixODBC). JWT validation on HTTP only.
- **`apps/frontend`**: React adapters. Auth via Keycloak; API calls go through Vite `/api` proxy in development (`VITE_API_PROXY_TARGET`).
- **`apps/frontend`**: React adapters. Auth uses Keycloak Authorization Code +
    PKCE. `VITE_HTTP_PREFIX` supplies the production subpath and prefixes API
    calls, so IBM i uses `/deltacore/api` behind Nginx.
- **Infrastructure**: Keycloak Compose, Db2 AZ7 generator, unixODBC driver under `infrastructure/odbc`.

SQL for engines is not in TypeScript. Load from `apps/backend/src/infrastructure/sql-dialects/<engine>/<feature>.sql` with `{{var}}` interpolation.

Db2 catalog dialect: `DB2_CATALOG=luw` → `db2/` (SYSCAT, Docker AZ7). `DB2_CATALOG=ibmi` → `db2-ibmi/` (QSYS2). IBM i SQL must not live in `db2/` or the LUW lab breaks.

## Comparison data sources

Sources are **ODBC DSNs**, not schemas. Origin and target are chosen per job.

1. **SQLite `biz_data_sources`** (`SqliteDataSourceStore`): `name`, `engine`, `odbc_dsn`, `search_path` (JSON array, IBM i `*LIBL*` order), `is_active`. `name` (Nombre asignado) is the logical primary key; saving an existing name updates its DSN and metadata. One DSN can have multiple assigned names. Seed: `sql-dialects/sqlite/seed-lab.sql` (`AZ7DB`, `AZ7DBPRDCL`).
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

`biz_data_dictionaries` persists `schema_name`, `table_name`, `table_description`, `row_count`, `source_dsn`, and update time. `biz_data_dictionary_columns` persists field name, description, type, length, scale, nullability, and key metadata. Existing databases receive missing dictionary metadata columns through conditional store migrations. The API supports deleting an individual dictionary by schema/table and all dictionaries associated with a DSN.

## Compare jobs

`CompareJobRunner` posts results through `ComparisonEngine`:

| Mode | What |
| --- | --- |
| schema-compare | Column names/types (`schema-compare.sql`) |
| volume-compare | `COUNT(*)` and physical table size per side; IBM i reads `QSYS2.SYSTABLESTAT.DATA_SIZE` |
| row-compare | Fetch both DSNs, compare in process (`rowCompare.ts`), limit default 10k; returns full categorized details within the limit |

HTTP: `POST /api/jobs/:id/{schema,volume,row}-compare` (JWT).

### Schema UI flow

The React Schema view submits one table per request so its progress bar reflects completed live comparisons. `ComparisonEngine` produces `schemaComparison`, with one entry per unioned origin/target field and types, lengths, scales, and status (`Igual`, `Solo origen`, `Solo destino`, `Tipo distinto`). The UI aggregates those entries into one summary row per table and calculates integrity as the percentage of entries marked `Igual`.

The summary table description is resolved after analysis from the source DSN's saved dictionary. When unavailable, it falls back to the live source catalog. No local dictionary fields are loaded for the Schema analysis. Selecting **Ver** opens a modal and requests the live `catalog/describe` data for both DSNs; the modal prefers source field descriptions and falls back to target descriptions.

The shared `StatusProvider` renders transient notifications at the viewport bottom. It is the notification channel for frontend info, warnings, API errors, and complete SQL/ODBC diagnostic strings. Notifications close manually or after three seconds.

### Volume and row UI flow

`/compare` loads source-DSN local dictionaries from SQLite and uses them as the selectable table set. It displays table description, column count, and stored key fields. The selected tables are sorted first and the run action is disabled with an empty selection.

Volume results are rendered in a single table, one result row per selected table, with source/target record counts, record delta, physical size per side, and size delta. Row results are rendered in a single table with navigable counts for each difference category. `RowDelta.details` preserves all changed, source-only, and target-only records within the row limit, while `samples` remains available for compatibility.

Row detail pages receive an explicit `SmartBackState.compare` snapshot. They return to `/compare` with mode, DSNs, limit, selected tables, and result rows restored. On entry they refresh the source dictionary and data-source names so the current local descriptions and DSN labels appear in the detail table. Changed cells display source and target values plus a visible difference marker; the key column and header remain pinned during scrolling.

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
| IBM i public deployment | `VITE_HTTP_PREFIX`, `SERVE_FRONTEND`, `BACKEND_HOST`, `PORT`, `CORS_ORIGIN` |
| TLS directly in Node (optional) | `HTTPS_CERT_FILE`, `HTTPS_KEY_FILE` |
| RBAC administration | `RBAC_ADMIN_EMAILS` |
| JWT clock skew workaround | `JWT_CLOCK_TOLERANCE_SECONDS` |

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

## Authentication and RBAC

The browser uses the public Keycloak client configured by `VITE_KEYCLOAK_URL`,
`VITE_KEYCLOAK_REALM`, and `VITE_KEYCLOAK_CLIENT_ID`. The backend validates the
bearer token against the issuer JWKS configured by `KEYCLOAK_URL` and
`KEYCLOAK_REALM`; no client secret is required for incoming JWT validation.

On the first valid authenticated request, `SqliteRbacStore.ensureUser()` creates
the user in `sys_users` with one default profile: `admin` for a new login. An
administrator can later assign exactly one profile from **Usuarios**. The
`solo lectura` profile can view permitted modules but cannot create, edit,
delete, or save; menu entries without `canView` are hidden. A temporary
`JWT_CLOCK_TOLERANCE_SECONDS` can absorb IBM i clock drift, but the IBM i clock
must ultimately be synchronized and the tolerance returned to its normal value.

### Permission matrix

`sys_role_permissions` stores independent actions for every module:
`canView` controls navigation, `canRead` controls queries, `canCreate`
creates resources, `canEdit` updates resources, `canDelete` removes resources,
`canSave` persists forms or dictionary changes, and `canRun` executes
comparisons, jobs, or generates SQL from comparison details. `ProfileView`
exposes all seven actions and the HTTP adapter enforces them instead of relying
only on disabled frontend controls.

The `solo lectura` role has no write permissions but may receive `canRun` when
that action is explicitly enabled in the profile. Shared resources resolve the
owning module from `COMPARE`, `DICTIONARY`, and `CATALOG`, so granular profiles
remain valid across dictionary and catalog workflows.

For IBM i homologation, deploy the built artifacts, run
`node apps/backend/dist/infrastructure/sqlite/init-cli.js` remotely to stage
the schema, and restart the compiled backend. The backend applies conditional
SQLite migrations such as `sys_role_permissions.can_run` when it opens the
database. Verify the health endpoint, static SPA, compiled backend, and
`PRAGMA table_info(sys_role_permissions)` with the remote `sqlite3` CLI. The
database check must preserve existing `biz_*` data while applying missing RBAC
columns and built-in role defaults.
