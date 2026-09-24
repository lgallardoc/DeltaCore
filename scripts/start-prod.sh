#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${ROOT}/scripts/load-env.sh"

cd "${ROOT}"
exec pm2 start ecosystem.config.cjs --update-env
