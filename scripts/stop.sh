#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/load-env.sh"

KEEP_AZ7=0
APPS_ONLY=0
INFRA_ONLY=0
for arg in "$@"; do
  case "${arg}" in
    --keep-az7) KEEP_AZ7=1 ;;
    --apps-only) APPS_ONLY=1 ;;
    --infra-only) INFRA_ONLY=1 ;;
  esac
done

stop_listen() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    echo "${label} (:${port}): not running"
    return
  fi
  echo "Stopping ${label} (:${port}): ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} 2>/dev/null || true
}

stop_orphaned_watchers() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "${pattern}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Stopping orphaned app watchers: ${pids}"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
  fi
}

if [[ "${INFRA_ONLY}" -eq 0 ]]; then
  stop_listen "${VITE_DEV_PORT}" "frontend (Vite)"
  stop_listen "${PORT}" "backend (Express)"
  stop_orphaned_watchers "tsx watch.*src/adapters/http/server.ts"
  stop_orphaned_watchers "vite.*apps/frontend"
fi

if [[ "${APPS_ONLY}" -eq 1 ]]; then
  echo "Stopped Node apps."
  exit 0
fi

echo "Stopping Keycloak..."
docker compose --env-file "${ROOT}/.env" -f "${ROOT}/infrastructure/sso/docker-compose.yml" stop || true

if [[ "${KEEP_AZ7}" -eq 0 ]]; then
  echo "Stopping db2-az7..."
  docker stop db2-az7 >/dev/null 2>&1 || true
fi

echo "Stopped."
