import type { IOdbcConnection, ISqlQueryProvider } from "@deltacore/shared";
import type { ISchemaResolver } from "../ports/ISchemaResolver.js";
import { catalogSchemaName } from "../catalogRow.js";
import { quoteSchemaList } from "../sqlLiterals.js";

export class SchemaResolverService implements ISchemaResolver {
  constructor(private readonly queryProvider: ISqlQueryProvider) {}

  async resolveTableSchema(
    connection: IOdbcConnection,
    tableName: string,
    searchPath: string[],
  ): Promise<string> {
    if (!searchPath || searchPath.length === 0) {
      throw new Error("No search path (*LIBL) defined for this data source.");
    }

    for (const schema of searchPath) {
      const sql = this.queryProvider.buildQuery(
        connection.getEngineType(),
        "find_table_schemas",
        { tableName, schemaList: quoteSchemaList([schema]) },
      );
      const foundSchema = (
        await connection.query<Record<string, unknown>>(sql)
      )
        .map((row) => catalogSchemaName(row))
        .find((name) => name.toUpperCase() === schema.toUpperCase());

      if (foundSchema) {
        return foundSchema;
      }
    }

    throw new Error(
      `Table ${tableName} not found in path: ${searchPath.join(", ")}`,
    );
  }
}

export function parseSearchPath(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    const legacyList = raw.match(/^\[\s*([^\]]*?)\s*\]$/);
    if (!legacyList) {
      throw new Error("search_path must be a JSON array of strings");
    }

    parsed = legacyList[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("search_path must be a JSON array of strings");
  }
  return parsed;
}
