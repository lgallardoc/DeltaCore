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

    const sql = this.queryProvider.buildQuery(
      connection.getEngineType(),
      "find_table_schemas",
      { tableName, schemaList: quoteSchemaList(searchPath) },
    );

    const foundSchemas = (
      await connection.query<Record<string, unknown>>(sql)
    )
      .map((row) => catalogSchemaName(row))
      .filter(Boolean);

    if (foundSchemas.length === 0) {
      throw new Error(
        `Table ${tableName} not found in path: ${searchPath.join(", ")}`,
      );
    }

    let winningSchema = foundSchemas[0];
    let highestPriorityIndex = searchPath.length;

    for (const schemaName of foundSchemas) {
      const index = searchPath.findIndex(
        (schema) => schema.toUpperCase() === schemaName.toUpperCase(),
      );
      if (index !== -1 && index < highestPriorityIndex) {
        highestPriorityIndex = index;
        winningSchema = schemaName;
      }
    }

    return winningSchema;
  }
}

export function parseSearchPath(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("search_path must be a JSON array of strings");
  }
  return parsed;
}
