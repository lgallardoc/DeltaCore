#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ENV="${ROOT}/.env.Deltacore"
LOG_DIR="${DELTA_SYNC_LOG_DIR:-${ROOT}/.logs}"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/sync-fdesa01-$(date '+%Y%m%d-%H%M%S').log"
touch "${LOG_FILE}"
chmod 600 "${LOG_FILE}"
exec > >(tee -a "${LOG_FILE}") 2>&1

REMOTE_USER="${DELTA_REMOTE_USER:-cllagc}"
REMOTE_HOST="${DELTA_REMOTE_HOST:-fdesa01.falabella.cl}"
REMOTE_DIR="${DELTA_REMOTE_DIR:-/nodeapp/DeltaCore}"
REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
CONTROL_DIR="$(mktemp -d)"
CONTROL_PATH="${CONTROL_DIR}/ssh-control"
SSH_OPTIONS=(-o BatchMode=yes -o ControlMaster=auto -o ControlPersist=60 -o ControlPath="${CONTROL_PATH}")
if [[ -n "${DELTA_SSH_KEY:-}" ]]; then
  if [[ ! -f "${DELTA_SSH_KEY}" ]]; then
    echo "DELTA_SSH_KEY does not point to a private key: ${DELTA_SSH_KEY}" >&2
    exit 2
  fi
  SSH_OPTIONS+=(-i "${DELTA_SSH_KEY}" -o IdentitiesOnly=yes)
fi
RSYNC_SSH="ssh ${SSH_OPTIONS[*]}"
if rsync --help 2>&1 | grep -q -- '--info'; then
  RSYNC_PROGRESS=(--info=progress2)
else
  RSYNC_PROGRESS=(--progress)
fi

run_rsync() {
  local started_at="${SECONDS}"
  local rsync_pid
  local exit_code

  "$@" &
  rsync_pid=$!
  while kill -0 "${rsync_pid}" 2>/dev/null; do
    printf 'rsync active (%ss elapsed)...\n' "$((SECONDS - started_at))"
    sleep 5
  done
  if wait "${rsync_pid}"; then
    printf 'rsync completed (%ss elapsed).\n' "$((SECONDS - started_at))"
    return 0
  else
    exit_code=$?
    printf 'rsync failed with exit code %s (%ss elapsed).\n' \
      "${exit_code}" "$((SECONDS - started_at))" >&2
    return "${exit_code}"
  fi
}

cleanup() {
  ssh "${SSH_OPTIONS[@]}" -O exit "${REMOTE_TARGET}" >/dev/null 2>&1 || true
  rm -rf "${CONTROL_DIR}"
}
trap cleanup EXIT

echo "Log: ${LOG_FILE}"

if [[ ! -f "${SOURCE_ENV}" ]]; then
  echo "Missing ITG environment file: ${SOURCE_ENV}" >&2
  exit 1
fi

if [[ ! "${REMOTE_DIR}" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "DELTA_REMOTE_DIR must be a safe absolute path" >&2
  exit 2
fi

echo "Checking ${REMOTE_TARGET}:${REMOTE_DIR}..."
ssh "${SSH_OPTIONS[@]}" "${REMOTE_TARGET}" \
  "command -v rsync >/dev/null && command -v tar >/dev/null && test -f \"\$HOME/odbc.tar\" && mkdir -p \"${REMOTE_DIR}/apps/backend/node_modules\"" || {
  echo "Could not connect or remote requires rsync, tar, and \$HOME/odbc.tar" >&2
  exit 1
}

echo "Synchronizing project to ${REMOTE_TARGET}:${REMOTE_DIR}..."
run_rsync rsync -avz --delete --itemize-changes "${RSYNC_PROGRESS[@]}" \
  -e "${RSYNC_SSH}" \
  --exclude '/.git/' \
  --exclude '/.logs/' \
  --exclude '/.env' \
  --exclude '/.env.Deltacore' \
  --exclude 'node_modules/' \
  --exclude '/apps/backend/data/' \
  --exclude '/build/' \
  "${ROOT}/" "${REMOTE_TARGET}:${REMOTE_DIR}/"

echo "Publishing .env.Deltacore as ${REMOTE_DIR}/.env..."
run_rsync rsync -avz --itemize-changes "${RSYNC_PROGRESS[@]}" \
  -e "${RSYNC_SSH}" \
  "${SOURCE_ENV}" "${REMOTE_TARGET}:${REMOTE_DIR}/.env"

echo "Replacing remote apps/backend/node_modules/odbc from \$HOME/odbc.tar..."
ssh "${SSH_OPTIONS[@]}" "${REMOTE_TARGET}" \
  "cd \"${REMOTE_DIR}\" && rm -rf apps/backend/node_modules/odbc && tar -xf \"\$HOME/odbc.tar\" -C apps/backend/node_modules"

echo "Verifying remote project..."
ssh "${SSH_OPTIONS[@]}" "${REMOTE_TARGET}" \
  "test -f \"${REMOTE_DIR}/package.json\" && test -f \"${REMOTE_DIR}/scripts/sync-fdesa01.sh\" && test -f \"${REMOTE_DIR}/.env\" && test -f \"${REMOTE_DIR}/apps/backend/dist/adapters/http/server.js\" && test -f \"${REMOTE_DIR}/apps/frontend/dist/index.html\" && test -d \"${REMOTE_DIR}/apps/backend/node_modules/odbc\""

echo "Synchronization verified: ${REMOTE_TARGET}:${REMOTE_DIR}"