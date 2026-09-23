#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env.Deltacore"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ITG environment file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${ENV_FILE}"
set +a

cd "${ROOT}"
npm run build