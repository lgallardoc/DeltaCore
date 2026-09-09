import path from "node:path";
import { fileURLToPath } from "node:url";

export function defaultRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
}

export function prependLibraryPath(directory: string): void {
  if (!directory) {
    return;
  }
  const key = process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH";
  const current = process.env[key] ?? "";
  if (current.split(":").includes(directory)) {
    return;
  }
  process.env[key] = current ? `${directory}:${current}` : directory;
}

export function ibmCliLibFileName(): string {
  if (process.env.IBM_DB_LIB) {
    return process.env.IBM_DB_LIB;
  }
  return process.platform === "darwin" ? "libdb2.dylib" : "libdb2.so";
}

export function ibmCliDriverPath(repoRoot?: string): string {
  const root = repoRoot ?? defaultRepoRoot();
  const home =
    process.env.IBM_DB_HOME ?? path.join(root, "infrastructure/odbc/clidriver");
  return path.join(home, "lib", ibmCliLibFileName());
}

/** CLI + unixODBC paths must be set before loading the `odbc` native addon. */
export function applyOdbcRuntimeEnv(repoRoot?: string): void {
  const root = repoRoot ?? defaultRepoRoot();
  const odbcDir = path.join(root, "infrastructure/odbc");
  const cli = process.env.IBM_DB_HOME ?? path.join(odbcDir, "clidriver");
  process.env.IBM_DB_HOME = cli;
  process.env.DB2_CLI_DRIVER_INSTALL_PATH ??= cli;
  process.env.ODBCINI ??= path.join(odbcDir, "odbc.ini");
  process.env.ODBCSYSINI ??= odbcDir;
  prependLibraryPath(path.join(cli, "lib"));
  if (process.env.UNIXODBC_LIB_DIR) {
    prependLibraryPath(process.env.UNIXODBC_LIB_DIR);
  }
}

export function db2TcpipConnectionString(): string {
  const database = process.env.DB2_NAME ?? "AZ7DB";
  const hostname = process.env.DB2_HOSTNAME ?? "127.0.0.1";
  const port = process.env.DB2_HOST_PORT ?? "50000";
  const uid = process.env.DB2_USER ?? "db2inst1";
  const pwd = process.env.DB2_PASSWORD ?? "db2admin";
  return `DATABASE=${database};HOSTNAME=${hostname};PORT=${port};UID=${uid};PWD=${pwd};PROTOCOL=TCPIP`;
}

export function connectionStringForDsn(dsn: string): string {
  const labDsn = process.env.DB2_ODBC_DSN ?? "AZ7DB";
  if (dsn === labDsn) {
    return db2TcpipConnectionString();
  }
  return `DSN=${dsn};`;
}
