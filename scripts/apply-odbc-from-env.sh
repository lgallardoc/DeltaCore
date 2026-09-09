#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/load-env.sh"

ODBC_DIR="${ROOT}/infrastructure/odbc"
IBM_DB_HOME="${IBM_DB_HOME:-${ODBC_DIR}/clidriver}"

resolve_cli_driver() {
  local name="${IBM_DB_LIB:-}"
  if [[ -z "${name}" ]]; then
    if [[ -f "${IBM_DB_HOME}/lib/libdb2.dylib" ]]; then
      name="libdb2.dylib"
    elif [[ -f "${IBM_DB_HOME}/lib/libdb2.so" ]]; then
      name="libdb2.so"
    else
      name="libdb2.dylib"
    fi
  fi
  printf '%s\n' "${IBM_DB_HOME}/lib/${name}"
}

DRIVER="$(resolve_cli_driver)"

cat > "${ODBC_DIR}/odbc.ini" <<EOF
[${DB2_ODBC_DSN}]
Description=DeltaCore Autoriza7 lab (Db2 LUW in Docker)
Driver=IBM DB2 ODBC DRIVER
Database=${DB2_NAME}
Hostname=${DB2_HOSTNAME}
Port=${DB2_HOST_PORT}
Protocol=TCPIP
Uid=${DB2_USER}
Pwd=${DB2_PASSWORD}
EOF

if [[ -f "${DRIVER}" ]]; then
  cat > "${ODBC_DIR}/odbcinst.ini" <<EOF
[IBM DB2 ODBC DRIVER]
Description=IBM Data Server Driver for ODBC and CLI
Driver=${DRIVER}
FileUsage=1
DontDLClose=1
Threading=0
EOF
  mkdir -p "${ODBC_DIR}/clidriver/cfg"
  cat > "${ODBC_DIR}/clidriver/cfg/db2dsdriver.cfg" <<EOF
<configuration>
  <dsncollection>
    <dsn alias="${DB2_ODBC_DSN}" name="${DB2_NAME}" host="${DB2_HOSTNAME}" port="${DB2_HOST_PORT}"/>
  </dsncollection>
  <databases>
    <database name="${DB2_NAME}" host="${DB2_HOSTNAME}" port="${DB2_HOST_PORT}"/>
  </databases>
</configuration>
EOF
  cat > "${ODBC_DIR}/clidriver/cfg/db2cli.ini" <<EOF
[${DB2_ODBC_DSN}]
Database=${DB2_NAME}
Protocol=TCPIP
Hostname=${DB2_HOSTNAME}
Servicename=${DB2_HOST_PORT}
uid=${DB2_USER}
pwd=${DB2_PASSWORD}
EOF
fi

cp "${ODBC_DIR}/odbc.ini" "${HOME}/.odbc.ini" 2>/dev/null || true

# Optional copy into the unixODBC *system* etc dir (only needed if you run
# isql without sourcing env.sh). Default: skip. Set UNIXODBC_SYSCONF to
# e.g. $(brew --prefix unixodbc)/etc or /usr/local/etc.
if [[ -n "${UNIXODBC_SYSCONF:-}" && -d "${UNIXODBC_SYSCONF}" ]]; then
  cp "${ODBC_DIR}/odbc.ini" "${UNIXODBC_SYSCONF}/odbc.ini" 2>/dev/null || true
  [[ -f "${ODBC_DIR}/odbcinst.ini" ]] && cp "${ODBC_DIR}/odbcinst.ini" "${UNIXODBC_SYSCONF}/odbcinst.ini" 2>/dev/null || true
fi
