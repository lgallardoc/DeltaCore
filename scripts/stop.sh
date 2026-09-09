#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/load-env.sh"

KEEP_AZ7=0
[[ "${1:-}" == "--keep-az7" ]] && KEEP_AZ7=1

echo "Stopping Keycloak..."
docker compose --env-file "${ROOT}/.env" -f "${ROOT}/infrastructure/sso/docker-compose.yml" stop || true

if [[ "${KEEP_AZ7}" -eq 0 ]]; then
  echo "Stopping db2-az7..."
  docker stop db2-az7 >/dev/null 2>&1 || true
fi

echo "Node apps (Vite/Express) stop with Ctrl+C in the terminal where npm start / npm run dev is running."
echo "Stopped infrastructure."
