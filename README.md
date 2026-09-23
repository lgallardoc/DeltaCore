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
3. In Catálogo, save each catalog using **Nombre asignado** and DSN. **Nombre
	asignado** is the logical primary key: saving an existing name updates its
	DSN and metadata, while the same DSN may be registered under different names.
	In Diccionario and Comparar, select/search by Nombre asignado; the backend
	resolves it to the physical DSN. In Comparar, choose
	the DSN in **DSN origen** and **DSN destino**. In CLI, pass `--source` and
	`--target`.

Schemas for volume/row compare are **not** the DSN: they are `--source-schema` / `--target-schema` (UI: esquema origen / destino).

## Network configuration (single source: `.env`)

Copy `.env.example` to `.env`. Configure host/IP, port and public URL in the
repo-root `.env`; do not hardcode them in application or Compose files.

All `npm start`, `npm run dev`, `npm run status` and stop scripts load only
the repo-root `.env`. `.env.Deltacore` is the ITG profile and is not loaded
automatically; copy its intended values into `.env` before starting that
environment. Never commit either file because they can contain credentials.

| Layer | Bind address | Port / URL | Role |
| --- | --- | --- | --- |
| Vite UI | `VITE_DEV_HOST=127.0.0.1` | `VITE_DEV_PORT=5173` | SPA listener |
| Vite → API | n/a | `VITE_API_PROXY_TARGET=http://127.0.0.1:4000` | Dev proxy destination for `/api` |
| Express API | `BACKEND_HOST=127.0.0.1` | `PORT=4000` | API listener (`GET /health`) |
| Browser CORS | n/a | `CORS_ORIGIN=http://localhost:5173` | Allowed SPA origin; must match its browser URL |
| Keycloak Docker | `KEYCLOAK_BIND_ADDRESS=127.0.0.1` | `KEYCLOAK_HTTP_PORT=8080` | Host-to-container `8080` mapping |
| SPA → Keycloak | n/a | `VITE_KEYCLOAK_URL=http://localhost:8080` | Browser-visible OIDC base URL |
| API → Keycloak | n/a | `KEYCLOAK_URL` + `KEYCLOAK_REALM` | JWT issuer and JWKS base |
| Db2 Docker | `DB2_BIND_ADDRESS=127.0.0.1` | `DB2_HOST_PORT=50000` → `DB2_CONTAINER_PORT=50000` | Published container port |
| Db2 client | `DB2_HOSTNAME=127.0.0.1` | `DB2_HOST_PORT=50000` | unixODBC destination |

For IBM i/ITG, the public URL is `https://fdesa01.falabella.cl/deltacore/`.
Nginx terminates TLS on port 443 and proxies `/deltacore/` to the private
Express listener on `127.0.0.1:30222`. The frontend is built with
`VITE_HTTP_PREFIX=/deltacore`, and Nginx must forward `Authorization`.

Changing `VITE_DEV_PORT` also requires matching redirect URIs in `infrastructure/sso/deltacore-realm.json` (Keycloak import does not expand `.env`).

Use `0.0.0.0` only when another machine must reach a listener. Also update
`CORS_ORIGIN`, Keycloak redirect URIs/web origins, firewall rules and the
browser-visible URLs. Run `npm run status` to display the effective endpoints.

## Commands

From the repo root (`nodeapp/DeltaCore`). Docker Desktop must be running for Keycloak and Db2.

```bash
npm install
cp .env.example .env   # first time only; start.sh also copies if missing
npm run init:db
npm start              # Keycloak + Db2 (if image exists) + frontend + backend
```

Package manager: **npm**. Workspaces are declared in the root `package.json`, and
`package-lock.json` is the only dependency lockfile.

| Command | Effect |
| --- | --- |
| `npm start` | Apply ODBC from `.env`, start Keycloak, start/create `db2-az7`, then `npm run dev` |
| `npm run start:infra` | Same infrastructure only (no Vite/Express) |
| `npm run dev` | Concurrent backend (`PORT`) and frontend (`VITE_DEV_PORT`) |
| `npm run start:backend` | Start the compiled backend and frontend from Express |
| `npm run start:prod` | Start the compiled backend with PM2 for proxy-based deployment |
| `npm run frontend` | Start only the Vite frontend (`VITE_DEV_PORT`) |
| `npm run build` | Build the frontend and backend for deployment |
| `npm run build:itg` | Build using `.env.Deltacore` for IBM i/ITG deployment |
| `npm run status` | Print configured ports and HTTP/Docker health |
| `npm stop` | Stop Vite, Express, Keycloak and `db2-az7` |
| `npm run stop:apps` | Stop only frontend (`VITE_DEV_PORT`) and backend (`PORT`) |
| `npm run stop:sso` | Stop Keycloak, leave Db2 and Node apps running |
| `npm test` | Workspace tests |
| `npm run init:db` | SQLite schema/seed |
| `npm run cli -- list-schemas` | Schemas assigned to a DSN (`*LIBL*`) and catalog presence |
| `npm run cli -- list-tables` | Tables in those schemas (`schema.table`) |
| `npm run sync:fdesa01` | Sync the project to IBM i and restore `apps/backend/node_modules/odbc` from `$HOME/odbc.tar` |

Stop Node + Docker with `npm stop`. Only the UI/API: `npm run stop:apps`. Then start again with `npm run dev` (apps) or `npm start` (infra + apps).

### IBM i synchronization

Run `npm run sync:fdesa01` from the repository root. The script performs these
steps in order:

1. Verifies SSH access plus remote `rsync`, `tar` and `$HOME/odbc.tar`.
2. Synchronizes the local project to
	`cllagc@fdesa01.falabella.cl:/nodeapp/DeltaCore`.
3. Copies local `.env.Deltacore` to remote `/nodeapp/DeltaCore/.env`.
4. Removes remote `/nodeapp/DeltaCore/apps/backend/node_modules/odbc`.
5. Extracts remote `$HOME/odbc.tar` into the backend workspace dependencies.

The sync uses `--delete` but does not copy any local `node_modules` directory;
it preserves remote `.env`, `.env.Deltacore`, all remote `node_modules`
directories, backend data and generated build directories. It then replaces
remote `apps/backend/node_modules/odbc` with the PASE build from
`$HOME/odbc.tar`. Install the remaining dependencies on IBM i. Each execution
writes a timestamped local log under `.logs/`; logs are not synchronized or
committed. `rsync` reports processed files (`-v`), itemized changes and total
progress (`--info=progress2`); older/openrsync installations automatically use
`--progress` instead. During file-list generation or comparison, when
openrsync does not emit progress, the script prints an activity line every five
seconds with the elapsed time. Override the SSH
user, host or home-relative destination when needed. The connection is
non-interactive and does not store a password:

```bash
DELTA_REMOTE_USER=cllagc \
DELTA_REMOTE_HOST=fdesa01.falabella.cl \
DELTA_REMOTE_DIR=/nodeapp/DeltaCore \
npm run sync:fdesa01
```

For passwordless local sync, configure an SSH public key for `cllagc` on
`fdesa01.falabella.cl`. Ed25519 is preferred; RSA is also supported when
required by the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deltacore-fdesa01
ssh-copy-id -i ~/.ssh/deltacore-fdesa01.pub cllagc@fdesa01.falabella.cl
DELTA_SSH_KEY=~/.ssh/deltacore-fdesa01 npm run sync:fdesa01
```

### Frontend en IBM i

Vite se usa para desarrollo local y no se ejecuta en IBM i porque `esbuild`
no tiene binario para `os400 ppc64`. Para ejecutar frontend y backend juntos en
IBM i, construye el frontend localmente y activa el servidor estático de
Express:

```bash
# En la máquina local, desde la raíz
npm run build:itg
npm run sync:fdesa01
```

En `.env.Deltacore`, usado como `.env` remoto, configura:

```bash
SERVE_FRONTEND=true
BACKEND_HOST=0.0.0.0
```

En el despliegue actual con Nginx usa:

```dotenv
VITE_HTTP_PREFIX=/deltacore
SERVE_FRONTEND=true
BACKEND_HOST=127.0.0.1
PORT=30222
CORS_ORIGIN=https://fdesa01.falabella.cl:30222
VITE_KEYCLOAK_URL=https://qa-access-key-corp.falabella.tech/auth
VITE_KEYCLOAK_REALM=corp
VITE_KEYCLOAK_CLIENT_ID=switch-spa
RBAC_ADMIN_EMAILS=lagallardoc@falabella.cl,lagallardoc
```

Después del sincronizado, el backend sirve la SPA y la API desde `PORT`.
Instala solo las dependencias runtime del backend y restaura el módulo PASE de
ODBC:

```bash
cd /nodeapp/DeltaCore/apps/backend
npm install --production --ignore-scripts --no-package-lock
cd ../..
rm -rf apps/backend/node_modules/odbc
tar -xf "$HOME/odbc.tar" -C apps/backend/node_modules
npm run start:backend
```

Para el despliegue con la arquitectura de `coreweb`, configura el proxy TLS de
IBM i para publicar `/deltacore/` y reenviar la ruta a
`http://127.0.0.1:30222/`. Debe reenviar también el header `Authorization`.
El backend usa:

```bash
SERVE_FRONTEND=true
BACKEND_HOST=127.0.0.1
PORT=30222
CORS_ORIGIN=https://fdesa01.falabella.cl
```

Si el certificado debe terminar directamente en DeltaCore, configura en `.env`
del IBM i los dos archivos TLS y usa el mismo `PORT` para HTTPS:

```bash
HTTPS_CERT_FILE=/ruta/segura/fullchain.pem
HTTPS_KEY_FILE=/ruta/segura/privkey.pem
```

Ambos archivos son obligatorios juntos y no deben sincronizarse ni versionarse.

Después inicia el proceso con `npm run start:prod`. El navegador debe abrir la
URL HTTPS del proxy en `/deltacore/`, no el puerto interno de Node. El cliente OIDC toma el
protocolo, host y puerto actuales para `redirect_uri`, igual que `coreweb`.

El cliente `switch-spa` debe autorizar:

```text
https://fdesa01.falabella.cl/deltacore/*
```

Si el JWT es rechazado por `exp`, revisar el reloj del IBM i frente a Keycloak.
`JWT_CLOCK_TOLERANCE_SECONDS=7200` es solo una mitigación temporal; una vez
corregido NTP debe volver a `360`.

The script also works with a key already loaded in `ssh-agent`; in that case
`DELTA_SSH_KEY` can be omitted. It uses `BatchMode=yes`, so it fails instead
of prompting for a password when key authentication is unavailable. A token
cannot be used by `rsync` over SSH unless the remote SSH service explicitly
provides token-based authentication.

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

DSN files are **not** tied to where unixODBC is installed. `source infrastructure/odbc/env.sh` sets `ODBCINI` / `ODBCSYSINI` to `infrastructure/odbc/`. The Driver Manager (`libodbc`) **is** tied to the prefix used when you ran `npm install` (which builds the native `odbc` addon).

If unixODBC lives somewhere else (otro Homebrew, `/usr/local`, PASE):

1. Set `UNIXODBC_LIB_DIR` in `.env` to the directory that contains `libodbc.dylib` or `libodbc.so`.
2. Rebuild the native addon on **that** machine: `npm rebuild odbc --workspace @deltacore/backend`.
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


🛠️ Paso 1: Levantar el túnel desde tu Computadora (Local)

Necesitas tener acceso SSH a tu IBM i desde tu PC (a través del puerto SSH por defecto de la máquina, usualmente el 22).

Abre la terminal de tu computadora (PowerShell en Windows, Terminal en Mac/Linux) y ejecuta el siguiente comando:
bash

ssh -R 1080 -N -f cllagc@fdesa01.falabella.cl

🛠️ Paso 2: Configurar las herramientas en el IBM i

Ahora que el puerto 1080 de tu IBM i está escuchando y reenviando tráfico a tu computadora, debes decirle a tus aplicaciones de Open Source en el iSeries que utilicen este proxy.

Conéctate a tu terminal del IBM i (por ejemplo, en VS Code "Code for IBM i" o SSH normal) y configura las variables de entorno de red de tu sesión PASE:
1. Para comandos generales (curl, git, etc.)

Ejecuta esto en tu terminal del IBM i:
bash

export http_proxy=socks5h://127.0.0.1:1080
export https_proxy=socks5h://127.0.0.1:1080

💡 Nota: El prefijo socks5h:// es crucial porque le dice al IBM i que incluso la resolución de nombres DNS debe delegarse a tu computadora local (evitando fallos de DNS en la red interna del iSeries).