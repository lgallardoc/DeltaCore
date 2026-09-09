import type { IOdbcConnection } from "@deltacore/shared";

export interface ISchemaResolver {
  resolveTableSchema(
    connection: IOdbcConnection,
    tableName: string,
    searchPath: string[],
  ): Promise<string>;
}
