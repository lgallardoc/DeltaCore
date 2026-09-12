#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/load-env.sh"
bash "${ROOT}/scripts/apply-odbc-from-env.sh"

INFRA_ONLY=0
[[ "${1:-}" == "--infra-only" ]] && INFRA_ONLY=1

echo "Starting Keycloak on host port ${KEYCLOAK_HTTP_PORT}..."
docker compose \
  --env-file "${ROOT}/.env" \
  -f "${ROOT}/infrastructure/sso/docker-compose.yml" \
  up -d

if docker image inspect db2-az7:latest >/dev/null 2>&1; then
  if docker ps -a --format '{{.Names}}' | grep -qx db2-az7; then
    echo "Starting existing Db2 container db2-az7..."
    docker start db2-az7 >/dev/null
  else
    echo "Creating Db2 container on host port ${DB2_HOST_PORT}..."
    docker run -d --name db2-az7 --hostname db2server --platform linux/amd64 --privileged=true \
      -p "${DB2_HOST_PORT}:${DB2_CONTAINER_PORT}" \
      -e LICENSE=accept \
      -e "DBNAME=${DB2_NAME}" \
      -e DB2INSTANCE=db2inst1 \
      -e "DB2INST1_PASSWORD=${DB2_PASSWORD}" \
      -e TO_CREATE_SAMPLEDB=false \
      -e PERSISTENT_HOME=false \
      db2-az7:latest >/dev/null
  fi
else
  echo "Image db2-az7:latest not found. Skip Db2. Build with: cd infrastructure/db2-az7-generator && pnpm run build:docker"
fi

if [[ "${INFRA_ONLY}" -eq 1 ]]; then
  echo "Infrastructure is up. Apps: pnpm run dev"
  exit 0
fi

cd "${ROOT}"
exec pnpm run dev
