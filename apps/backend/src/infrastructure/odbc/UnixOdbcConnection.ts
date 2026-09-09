import odbc from "odbc";
import type { EngineType, IOdbcConnection } from "@deltacore/shared";
import {
  applyOdbcRuntimeEnv,
  connectionStringForDsn,
  db2TcpipConnectionString,
  ibmCliDriverPath,
} from "./odbcEnv.js";

export class UnixOdbcConnection implements IOdbcConnection {
  constructor(
    private readonly conn: odbc.Connection,
    private readonly engine: EngineType,
    readonly searchPath: string[],
  ) {}

  getEngineType(): EngineType {
    return this.engine;
  }

  async query<T>(sql: string): Promise<T[]> {
    try {
      const rows = await this.conn.query<T>(sql);
      return [...rows].map((row) => lowercaseKeys(row));
    } catch (error) {
      throw wrapOdbcError(error, sql);
    }
  }

  async close(): Promise<void> {
    await this.conn.close();
  }
}

export async function openUnixOdbcConnection(
  dsn: string,
  engine: EngineType,
  searchPath: string[],
): Promise<UnixOdbcConnection> {
  applyOdbcRuntimeEnv();
  const driver = ibmCliDriverPath();
  const attempts = [
    `DSN=${dsn};`,
    connectionStringForDsn(dsn),
    `DRIVER=${driver};${db2TcpipConnectionString()}`,
  ];
  let lastError: unknown;
  for (const connectionString of attempts) {
    try {
      const conn = await odbc.connect(connectionString);
      return new UnixOdbcConnection(conn, engine, searchPath);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`ODBC connect failed for DSN ${dsn}`);
}

function lowercaseKeys<T>(row: T): T {
  if (!row || typeof row !== "object") {
    return row;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    out[key.toLowerCase()] = value;
  }
  return out as T;
}

function wrapOdbcError(error: unknown, sql: string): Error {
  const odbcErrors = (error as { odbcErrors?: Array<{ message?: string; state?: string }> })
    .odbcErrors;
  const detail =
    odbcErrors
      ?.map((item) => `${item.state ?? "?"}: ${item.message ?? ""}`)
      .join("; ")
      .trim() || (error instanceof Error ? error.message : String(error));
  const preview = sql.replace(/\s+/g, " ").slice(0, 240);
  return new Error(`ODBC SQL failed (${detail}) | ${preview}`);
}
