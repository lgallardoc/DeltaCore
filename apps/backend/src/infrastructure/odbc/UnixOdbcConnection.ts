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
      const rows = await this.conn.query<T>(stripSqlTerminator(sql));
      return [...rows].map((row) => lowercaseKeys(row));
    } catch (error) {
      throw wrapOdbcError(error, sql);
    }
  }

  async close(): Promise<void> {
    await this.conn.close();
  }
}

export function stripSqlTerminator(sql: string): string {
  return sql.replace(/;\s*$/, "");
}

export async function openUnixOdbcConnection(
  dsn: string,
  engine: EngineType,
  searchPath: string[],
): Promise<UnixOdbcConnection> {
  applyOdbcRuntimeEnv();
  const driver = ibmCliDriverPath();
  const attempts = [
    { label: `DSN ${dsn}`, connectionString: `DSN=${dsn};` },
    { label: `Configuración del DSN ${dsn}`, connectionString: connectionStringForDsn(dsn) },
    { label: "IBM CLI TCP/IP configurado", connectionString: `DRIVER=${driver};${db2TcpipConnectionString()}` },
  ];
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const conn = await odbc.connect(attempt.connectionString);
      return new UnixOdbcConnection(conn, engine, searchPath);
    } catch (error) {
      failures.push(`${attempt.label}: ${formatOdbcError(error)}`);
    }
  }
  throw new Error(
    `No se pudo conectar por ODBC al DSN ${dsn}. Intentos: ${failures.join(" | ")}`,
  );
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
  const detail = formatOdbcError(error);
  const preview = sql.replace(/\s+/g, " ").slice(0, 240);
  return new Error(`ODBC SQL failed (${detail}) | ${preview}`);
}

export function formatOdbcError(error: unknown): string {
  const odbcErrors = (error as { odbcErrors?: Array<{ message?: string; state?: string }> })
    .odbcErrors;
  return (
    odbcErrors
      ?.map((item) => `${item.state ?? "?"}: ${item.message ?? ""}`)
      .join("; ")
      .trim() || (error instanceof Error ? error.message : String(error))
  );
}
