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
    const rows = await this.conn.query<T>(sql);
    return [...rows];
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
