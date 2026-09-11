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
  tableDescription: string;
  rowCount: number;
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

export type CatalogDescription = {
  dsn: string;
  engine: EngineType;
  schema: string;
  table: string;
  columns: TableColumn[];
  tableDescription: string;
  rowCount: number;
};

type CatalogOptions = {
  searchPath?: string[];
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

  async listSchemas(dsn: string, searchPath?: string[]): Promise<{
    dsn: string;
    engine: EngineType;
    schemas: AssignedSchema[];
  }> {
    const meta = this.lookup(dsn);
    const effectiveSearchPath = searchPath ?? meta.searchPath;
    const effectiveMeta = { ...meta, searchPath: effectiveSearchPath };
    const found = new Set(
      (
        await this.queryCatalog<Record<string, unknown>>(
          dsn,
          effectiveMeta,
          "list-schemas",
        )
      ).map((row) => catalogSchemaName(row)),
    );
    return {
      dsn,
      engine: meta.engine,
      schemas: effectiveSearchPath.map((schema, priority) => ({
        schema,
        priority,
        presentInCatalog: [...found].some((name) => name.toUpperCase() === schema.toUpperCase()),
      })),
    };
  }

  async listTables(
    dsn: string,
    tableNames: string[] = [],
    options: { allSchemas?: boolean; tableLike?: string } & CatalogOptions = {},
  ): Promise<{
    dsn: string;
    engine: EngineType;
    searchPath: string[];
    allSchemas: boolean;
    tables: CatalogTable[];
  }> {
    const meta = this.lookup(dsn);
    const effectiveSearchPath = options.searchPath ?? meta.searchPath;
    const effectiveMeta = { ...meta, searchPath: effectiveSearchPath };
    const allSchemas = Boolean(options.allSchemas);
    const rows = await this.queryCatalog<Record<string, unknown>>(
      dsn,
      effectiveMeta,
      "list-tables",
      {
        tableName:
          tableNames.length > 1 ? "__TABLE_LIST__" : tableNames[0]?.toUpperCase() ?? "",
        tableList: sqlTableList(tableNames),
        tablePattern: escapeSqlLikeLiteral(
          tableNames.length > 1 ? "" : options.tableLike ?? "",
        ),
        limitToPath: allSchemas ? "0" : "1",
      },
    );
    return {
      dsn,
      engine: meta.engine,
      searchPath: effectiveSearchPath,
      allSchemas,
      tables: rows.map((row) => ({
        schema: catalogSchemaName(row),
        table: catalogTableName(row),
        tableType: String(row.table_type ?? row.type ?? "T").trim(),
        tableDescription: String(row.table_description ?? row.description ?? "").trim(),
        rowCount: Number(row.row_count ?? 0),
      })),
    };
  }

  async describeTable(
    dsn: string,
    tableName: string,
    schemaHint?: string,
    options: CatalogOptions = {},
  ): Promise<CatalogDescription> {
    const table = sqlIdent(tableName);
    const meta = this.lookup(dsn);
    const effectiveSearchPath = options.searchPath ?? meta.searchPath;
    const effectiveMeta = { ...meta, searchPath: effectiveSearchPath };
    const schema = schemaHint
      ? sqlIdent(schemaHint)
      : winningSchema(
          (await this.listTables(dsn, [table], { searchPath: effectiveSearchPath })).tables,
          effectiveSearchPath,
          table,
        );
    if (!schema) {
      throw new Error(
        `Table ${table} not found in *LIBL*: ${effectiveSearchPath.join(", ")}`,
      );
    }
    const metadataRows = await this.queryCatalog<Record<string, unknown>>(
      dsn,
      { ...effectiveMeta, searchPath: [schema] },
      "find_table_schemas",
      { tableName: table },
    );
    const metadata = metadataRows[0];
    const rows = await this.queryCatalog<Record<string, unknown>>(
      dsn,
      effectiveMeta,
      "describe-table",
      { schema, tableName: table },
    );
    return {
      dsn,
      engine: meta.engine,
      schema,
      table,
      tableDescription: String(
        metadata?.table_description ?? metadata?.description ?? "",
      ).trim(),
      rowCount: Number(metadata?.row_count ?? 0),
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

  async describeTables(
    dsn: string,
    searchPath?: string[],
  ): Promise<CatalogDescription[]> {
    const tables = await this.listTables(dsn, [], { searchPath });
    const selectedTables = new Map<string, CatalogTable>();
    for (const table of tables.tables) {
      const key = table.table.toUpperCase();
      if (selectedTables.has(key)) {
        continue;
      }
      const schema = winningSchema(tables.tables, tables.searchPath, table.table);
      if (schema) {
        selectedTables.set(key, { ...table, schema });
      }
    }
    return Promise.all(
      [...selectedTables.values()].map((table) =>
        this.describeTable(dsn, table.table, table.schema, { searchPath }),
      ),
    );
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
  return tables.map((name) => `'${sqlIdent(name)}'`).join(",");
}

function escapeSqlLikeLiteral(value: string): string {
  return value.replaceAll("'", "''");
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
