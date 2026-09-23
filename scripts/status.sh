#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/load-env.sh"

code() {
  local url="$1"
  curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" || echo "down"
}

echo "Ports (from .env)"
echo "  frontend     ${VITE_DEV_HOST}:${VITE_DEV_PORT}  origin=${CORS_ORIGIN}"
echo "  backend      ${BACKEND_HOST}:${PORT}"
echo "  keycloak     ${KEYCLOAK_BIND_ADDRESS}:${KEYCLOAK_HTTP_PORT}  url=${KEYCLOAK_URL}"
echo "  db2 docker   ${DB2_BIND_ADDRESS}:${DB2_HOST_PORT}->${DB2_CONTAINER_PORT}"
echo "  db2 odbc     ${DB2_HOSTNAME}:${DB2_HOST_PORT}  dsn=${DB2_ODBC_DSN}"
echo
echo "HTTP"
echo "  frontend  $(code "http://127.0.0.1:${VITE_DEV_PORT}/")"
echo "  backend   $(code "http://127.0.0.1:${PORT}/health")"
echo "  keycloak  $(code "http://127.0.0.1:${KEYCLOAK_HTTP_PORT}/")"
echo
echo "Docker"
docker compose --env-file "${ROOT}/.env" -f "${ROOT}/infrastructure/sso/docker-compose.yml" ps || true
docker ps -a --filter name=db2-az7 --format '  db2-az7  {{.Status}}  {{.Ports}}' || true
