export const CLI_HELP = `DeltaCore CLI (hexagonal adapter; same ComparisonEngine as HTTP)

Usage:
  npm run cli -- <command> [options]

Commands:
  help
  schema-compare   Compare table metadata (--source --target --table)
  volume-compare   Compare row counts (--source --target --table or --pattern)
  row-compare      Compare row values (--source --target --table)
  list-schemas     Schemas assigned to a DSN (*LIBL) and whether they exist
  find-table       Locate a table and list every schema that contains it
  describe-table   Data dictionary (columns) of a table
  list-tables      Tables in the DSN *LIBL* (optional --table filter)

Options:
  --source <dsn>   Source ODBC DSN (default: DB2_ODBC_DSN or AZ7DB)
  --target <dsn>   Target ODBC DSN (default: same as --source)
  --dsn <dsn>      Alias of --source
  --table <name>   Table name (repeatable)
  --schema <name>  Explicit schema for describe-table (otherwise *LIBL* winner)
  --source-schema <name>  Schema on --source for volume/row-compare
  --target-schema <name>  Schema on --target for volume/row-compare
  --key <c1,c2,...>  Composite key for row-compare (comma-separated and/or repeatable)
  --limit <n>      Max rows per side for row-compare (default 10000, max 50000)
  --sample <n>     Diff samples to include in the result (default 25)
  --all-schemas    find-table / list-tables: search the whole catalog, not only *LIBL*
  --pattern <id>   Alias of --table for volume-compare
  --json           Machine-readable JSON

Exit codes: 0 SUCCESS, 2 DIFFERENCE, 1 ERROR or usage error
`;

export type CliCommand =
  | { name: "help" }
  | {
      name: "schema-compare";
      sourceDsn: string;
      targetDsn: string;
      tables: string[];
      json: boolean;
    }
  | {
      name: "volume-compare";
      sourceDsn: string;
      targetDsn: string;
      patternId: string;
      sourceSchema?: string;
      targetSchema?: string;
      json: boolean;
    }
  | {
      name: "row-compare";
      sourceDsn: string;
      targetDsn: string;
      table: string;
      sourceSchema?: string;
      targetSchema?: string;
      keyColumns: string[];
      limit?: number;
      sampleSize?: number;
      json: boolean;
    }
  | {
      name: "list-schemas";
      dsn: string;
      json: boolean;
    }
  | {
      name: "list-tables";
      dsn: string;
      tables: string[];
      allSchemas: boolean;
      json: boolean;
    }
  | {
      name: "find-table";
      dsn: string;
      tables: string[];
      allSchemas: boolean;
      json: boolean;
    }
  | {
      name: "describe-table";
      dsn: string;
      table: string;
      schema?: string;
      json: boolean;
    };

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseCli(argv: string[]): CliCommand {
  const tokens = argv.filter((token) => token !== "--");
  if (tokens.length === 0 || tokens[0] === "help" || tokens[0] === "-h" || tokens[0] === "--help") {
    return { name: "help" };
  }

  const command = tokens[0];
  const rest = tokens.slice(1);
  const flags = parseFlags(rest);
  const json = Boolean(flags.json);
  const allSchemas = Boolean(flags["all-schemas"]);
  const defaultDsn = process.env.DB2_ODBC_DSN ?? "AZ7DB";
  const sourceDsn = first(flags.source) ?? first(flags.dsn) ?? defaultDsn;
  const targetDsn = first(flags.target) ?? sourceDsn;

  if (command === "schema-compare") {
    const tables = Array.isArray(flags.table) ? flags.table : [];
    if (tables.length === 0) {
      throw new CliUsageError("schema-compare requires at least one --table");
    }
    return { name: "schema-compare", sourceDsn, targetDsn, tables, json };
  }

  if (command === "volume-compare") {
    const patternId = first(flags.pattern) ?? first(flags.table);
    if (!patternId) {
      throw new CliUsageError("volume-compare requires --table (or --pattern)");
    }
    const sourceSchema = first(flags["source-schema"]);
    const targetSchema = first(flags["target-schema"]);
    return {
      name: "volume-compare",
      sourceDsn,
      targetDsn,
      patternId,
      json,
      ...(sourceSchema ? { sourceSchema } : {}),
      ...(targetSchema ? { targetSchema } : {}),
    };
  }

  if (command === "row-compare") {
    const table = first(flags.table);
    if (!table) {
      throw new CliUsageError("row-compare requires --table");
    }
    const sourceSchema = first(flags["source-schema"]);
    const targetSchema = first(flags["target-schema"]);
    const limitRaw = first(flags.limit);
    const sampleRaw = first(flags.sample);
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    const sampleSize = sampleRaw === undefined ? undefined : Number(sampleRaw);
    if (limitRaw !== undefined && (!Number.isFinite(limit) || Number(limit) < 1)) {
      throw new CliUsageError("row-compare --limit must be a positive integer");
    }
    if (
      sampleRaw !== undefined &&
      (!Number.isFinite(sampleSize) || Number(sampleSize) < 1)
    ) {
      throw new CliUsageError("row-compare --sample must be a positive integer");
    }
    return {
      name: "row-compare",
      sourceDsn,
      targetDsn,
      table,
      keyColumns: parseKeyColumns(flags.key),
      json,
      ...(sourceSchema ? { sourceSchema } : {}),
      ...(targetSchema ? { targetSchema } : {}),
      ...(limit === undefined ? {} : { limit }),
      ...(sampleSize === undefined ? {} : { sampleSize }),
    };
  }

  if (command === "list-schemas") {
    return { name: "list-schemas", dsn: sourceDsn, json };
  }

  if (command === "list-tables") {
    const tables = Array.isArray(flags.table) ? flags.table : [];
    return { name: "list-tables", dsn: sourceDsn, tables, allSchemas, json };
  }

  if (command === "find-table") {
    const tables = Array.isArray(flags.table) ? flags.table : [];
    if (tables.length === 0) {
      throw new CliUsageError("find-table requires --table");
    }
    return { name: "find-table", dsn: sourceDsn, tables, allSchemas, json };
  }

  if (command === "describe-table") {
    const table = Array.isArray(flags.table) ? flags.table[0] : undefined;
    if (!table) {
      throw new CliUsageError("describe-table requires --table");
    }
    return {
      name: "describe-table",
      dsn: sourceDsn,
      table,
      schema: first(flags.schema),
      json,
    };
  }

  throw new CliUsageError(`Unknown command: ${command}`);
}

function parseFlags(rest: string[]): Record<string, string[] | boolean> {
  const out: Record<string, string[] | boolean> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--json") {
      out.json = true;
      continue;
    }
    if (token === "--all-schemas") {
      out["all-schemas"] = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliUsageError(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = rest[i + 1];
    if (!value || value.startsWith("--")) {
      throw new CliUsageError(`Missing value for --${key}`);
    }
    i += 1;
    const existing = out[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      out[key] = [value];
    }
  }
  return out;
}

function first(values: string[] | boolean | undefined): string | undefined {
  return Array.isArray(values) ? values[0] : undefined;
}

function parseKeyColumns(values: string[] | boolean | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}
