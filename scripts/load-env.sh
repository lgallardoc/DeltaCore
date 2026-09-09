#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ROOT}/.env.example" "${ENV_FILE}"
  echo "Created ${ENV_FILE} from .env.example"
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${VITE_DEV_PORT:=5173}"
: "${VITE_API_PROXY_TARGET:=http://127.0.0.1:4000}"
: "${PORT:=4000}"
: "${CORS_ORIGIN:=http://localhost:5173}"
: "${KEYCLOAK_URL:=http://localhost:8080}"
: "${KEYCLOAK_REALM:=DeltaCoreRealm}"
: "${KEYCLOAK_HTTP_PORT:=8080}"
: "${DB2_HOSTNAME:=127.0.0.1}"
: "${DB2_HOST_PORT:=50000}"
: "${DB2_CONTAINER_PORT:=50000}"
: "${DB2_NAME:=AZ7DB}"
: "${DB2_USER:=db2inst1}"
: "${DB2_PASSWORD:=db2admin}"
: "${DB2_ODBC_DSN:=AZ7DB}"
: "${KEYCLOAK_ISSUER:=${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}}"
