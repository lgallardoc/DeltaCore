import type { IOdbcConnection, ISqlQueryProvider } from "@deltacore/shared";
import type { ISchemaResolver } from "../ports/ISchemaResolver.js";

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

    const schemaList = searchPath.map((schema) => `'${schema}'`).join(",");
    const sql = this.queryProvider.buildQuery(
      connection.getEngineType(),
      "find_table_schemas",
      { tableName, schemaList },
    );

    const foundSchemas = await connection.query<{ schema_name: string }>(sql);

    if (foundSchemas.length === 0) {
      throw new Error(
        `Table ${tableName} not found in path: ${searchPath.join(", ")}`,
      );
    }

    let winningSchema = foundSchemas[0].schema_name;
    let highestPriorityIndex = searchPath.length;

    for (const row of foundSchemas) {
      const index = searchPath.findIndex(
        (schema) => schema.toUpperCase() === row.schema_name.toUpperCase(),
      );
      if (index !== -1 && index < highestPriorityIndex) {
        highestPriorityIndex = index;
        winningSchema = row.schema_name;
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
