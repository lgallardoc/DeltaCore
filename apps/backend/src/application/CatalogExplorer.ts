import type { EngineType, IOdbcConnection, ISqlQueryProvider } from "@deltacore/shared";
import type { ConnectionFactory } from "./CompareJobRunner.js";
import { catalogSchemaName, catalogTableName } from "../domain/catalogRow.js";
import { quoteSchemaList, sqlIdent } from "../domain/sqlLiterals.js";

export type DataSourceLookup = (dsn: string) => {
  engine: EngineType;
  searchPath: string[];
};

export type AssignedSchema = {
  schema: string;
  priority: number;
  presentInCatalog: boolean;
};

export type CatalogTable = {
  schema: string;
  table: string;
  tableType: string;
};

export type TableColumn = {
  columnNo: string;
  columnName: string;
  dataType: string;
  length: string;
  scale: string;
  nullable: string;
  description: string;
};

export class CatalogExplorer {
  constructor(
    private readonly queries: ISqlQueryProvider,
    private readonly lookup: DataSourceLookup,
    private readonly openConnection: ConnectionFactory,
  ) {}

  assignedPath(dsn: string): { dsn: string; engine: EngineType; schemas: string[] } {
    const meta = this.lookup(dsn);
    return { dsn, engine: meta.engine, schemas: meta.searchPath };
  }

  async listSchemas(dsn: string): Promise<{
    dsn: string;
    engine: EngineType;
    schemas: AssignedSchema[];
  }> {
    const meta = this.lookup(dsn);
    const found = new Set(
      (await this.queryCatalog<Record<string, unknown>>(dsn, meta, "list-schemas")).map(
        (row) => catalogSchemaName(row),
      ),
    );
    return {
      dsn,
      engine: meta.engine,
      schemas: meta.searchPath.map((schema, priority) => ({
        schema,
        priority,
        presentInCatalog: [...found].some((name) => name.toUpperCase() === schema.toUpperCase()),
      })),
    };
  }

  async listTables(
    dsn: string,
    tableNames: string[] = [],
    options: { allSchemas?: boolean } = {},
  ): Promise<{
    dsn: string;
    engine: EngineType;
    searchPath: string[];
    allSchemas: boolean;
    tables: CatalogTable[];
  }> {
    const meta = this.lookup(dsn);
    const allSchemas = Boolean(options.allSchemas);
    const rows = await this.queryCatalog<Record<string, unknown>>(
      dsn,
      meta,
      "list-tables",
      {
        tableName: tableNames[0]?.toUpperCase() ?? "",
        tableList: sqlTableList(tableNames),
        limitToPath: allSchemas ? "0" : "1",
      },
    );
    return {
      dsn,
      engine: meta.engine,
      searchPath: meta.searchPath,
      allSchemas,
      tables: rows.map((row) => ({
        schema: catalogSchemaName(row),
        table: catalogTableName(row),
        tableType: String(row.table_type ?? row.type ?? "T").trim(),
      })),
    };
  }

  async describeTable(
    dsn: string,
    tableName: string,
    schemaHint?: string,
  ): Promise<{
    dsn: string;
    engine: EngineType;
    schema: string;
    table: string;
    columns: TableColumn[];
  }> {
    const table = sqlIdent(tableName);
    const meta = this.lookup(dsn);
    const schema = schemaHint
      ? sqlIdent(schemaHint)
      : winningSchema(
          (await this.listTables(dsn, [table])).tables,
          meta.searchPath,
          table,
        );
    if (!schema) {
      throw new Error(
        `Table ${table} not found in *LIBL*: ${meta.searchPath.join(", ")}`,
      );
    }
    const rows = await this.queryCatalog<Record<string, unknown>>(
      dsn,
      meta,
      "describe-table",
      { schema, tableName: table },
    );
    return {
      dsn,
      engine: meta.engine,
      schema,
      table,
      columns: rows.map((row) => ({
        columnNo: String(row.column_no ?? row.colno ?? ""),
        columnName: String(row.column_name ?? row.colname ?? ""),
        dataType: String(row.data_type ?? row.typename ?? ""),
        length: String(row.length ?? ""),
        scale: String(row.scale ?? ""),
        nullable: String(row.nullable ?? row.nulls ?? ""),
        description: String(
          row.description ??
            row.remarks ??
            row.column_text ??
            row.column_heading ??
            "",
        )
          .replace(/\s+/g, " ")
          .trim(),
      })),
    };
  }

  private async queryCatalog<T>(
    dsn: string,
    meta: { engine: EngineType; searchPath: string[] },
    feature: string,
    extra: Record<string, string> = {},
  ): Promise<T[]> {
    const sql = this.queries.buildQuery(meta.engine, feature, {
      schemaList: quoteSchemaList(meta.searchPath),
      ...extra,
    });
    let connection: IOdbcConnection | undefined;
    try {
      connection = await this.openConnection(dsn);
      return await connection.query<T>(sql);
    } finally {
      await connection?.close().catch(() => undefined);
    }
  }
}

function sqlTableList(tables: string[]): string {
  if (tables.length === 0) {
    return "''";
  }
  return quoteSchemaList(tables.map((name) => name.toUpperCase()));
}

function winningSchema(
  locations: CatalogTable[],
  searchPath: string[],
  table: string,
): string | undefined {
  const schemas = locations
    .filter((row) => row.table.toUpperCase() === table.toUpperCase())
    .map((row) => row.schema);
  for (const candidate of searchPath) {
    const hit = schemas.find(
      (schema) => schema.toUpperCase() === candidate.toUpperCase(),
    );
    if (hit) {
      return hit;
    }
  }
  return schemas[0];
}
