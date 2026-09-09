#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/load-env.sh"
# shellcheck disable=SC1091
source "${ROOT}/infrastructure/odbc/env.sh"
# unixODBC / Node 24: dependency still calls url.parse (DEP0169).
# node:sqlite is experimental. Keep CLI output to the catalog result.
export NODE_NO_WARNINGS=1
cd "${ROOT}"
exec npx tsx --env-file="${ROOT}/.env" apps/backend/src/adapters/cli/main.ts "$@"
