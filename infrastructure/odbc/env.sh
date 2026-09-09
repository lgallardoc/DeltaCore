# Resolve repo root; do not hardcode a developer machine path.
ODBC_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${ODBC_SCRIPT_DIR}/../.." && pwd)"

export IBM_DB_HOME="${IBM_DB_HOME:-${REPO_ROOT}/infrastructure/odbc/clidriver}"
export DB2_CLI_DRIVER_INSTALL_PATH="${DB2_CLI_DRIVER_INSTALL_PATH:-$IBM_DB_HOME}"

CLI_LIB="${IBM_DB_HOME}/lib"
case "$(uname -s)" in
  Darwin)
    export DYLD_LIBRARY_PATH="${CLI_LIB}${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
    ;;
  *)
    export LD_LIBRARY_PATH="${CLI_LIB}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
esac

# Driver Manager INI files live in the repo. unixODBC's *install prefix* can
# be anywhere; these two variables tell isql and Node where to read DSNs.
export ODBCINI="${ODBCINI:-${ODBC_SCRIPT_DIR}/odbc.ini}"
export ODBCSYSINI="${ODBCSYSINI:-${ODBC_SCRIPT_DIR}}"

# Optional: directory that contains libodbc.dylib / libodbc.so when it is not
# on the default linker path (another Homebrew prefix, /usr/local/lib, PASE).
if [[ -n "${UNIXODBC_LIB_DIR:-}" ]]; then
  case "$(uname -s)" in
    Darwin)
      export DYLD_LIBRARY_PATH="${UNIXODBC_LIB_DIR}${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
      ;;
    *)
      export LD_LIBRARY_PATH="${UNIXODBC_LIB_DIR}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
      ;;
  esac
fi
