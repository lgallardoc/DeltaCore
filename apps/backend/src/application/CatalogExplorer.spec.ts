import { describe, expect, it, vi } from "vitest";
import type { IOdbcConnection, ISqlQueryProvider } from "@deltacore/shared";
import { CatalogExplorer } from "./CatalogExplorer.js";

describe("CatalogExplorer", () => {
  const queries: ISqlQueryProvider = {
    buildQuery: (_engine, feature, params) => {
      expect(params.schemaList).toContain("'AZBASWQA'");
      return `SQL:${feature}`;
    },
  };

  it("marks assigned schemas against catalog rows", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => [{ schema_name: "AZBASWQA" }]),
      close: vi.fn(async () => undefined),
    };
    const explorer = new CatalogExplorer(
      queries,
      () => ({ engine: "db2", searchPath: ["AZBASWQA", "MISSING"] }),
      async () => connection,
    );

    const result = await explorer.listSchemas("AZ7DB");
    expect(result.schemas).toEqual([
      { schema: "AZBASWQA", priority: 0, presentInCatalog: true },
      { schema: "MISSING", priority: 1, presentInCatalog: false },
    ]);
    expect(connection.close).toHaveBeenCalled();
  });

  it("uses the requested search path in priority order", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => [{ schema_name: "SECOND" }]),
      close: vi.fn(async () => undefined),
    };
    const searchPathQueries: ISqlQueryProvider = {
      buildQuery: (_engine, feature, params) => {
        expect(feature).toBe("list-schemas");
        expect(params.schemaList).toBe("'SECOND','FIRST'");
        return "SQL:list-schemas";
      },
    };
    const explorer = new CatalogExplorer(
      searchPathQueries,
      () => ({ engine: "db2", searchPath: ["DEFAULT"] }),
      async () => connection,
    );

    const result = await explorer.listSchemas("AZ7DB", ["SECOND", "FIRST"]);

    expect(result.schemas.map((schema) => schema.schema)).toEqual([
      "SECOND",
      "FIRST",
    ]);
    expect(result.schemas[0]?.priority).toBe(0);
  });

  it("returns tables with their catalog schema", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => [
        { schema_name: "AZBASWQA", table_name: "ACCCR7", table_type: "T" },
        { schema_name: "AZLOSWQACL", table_name: "ACCCR7", table_type: "T" },
      ]),
      close: vi.fn(async () => undefined),
    };
    const explorer = new CatalogExplorer(
      queries,
      () => ({ engine: "db2", searchPath: ["AZBASWQA", "AZLOSWQACL"] }),
      async () => connection,
    );

    const result = await explorer.listTables("AZ7DB");
    expect(result.tables).toEqual([
      {
        schema: "AZBASWQA",
        table: "ACCCR7",
        tableType: "T",
        tableDescription: "",
        rowCount: 0,
      },
      {
        schema: "AZLOSWQACL",
        table: "ACCCR7",
        tableType: "T",
        tableDescription: "",
        rowCount: 0,
      },
    ]);
  });

  it("describes special IBM i table names only from the first matching schema", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async (sql: string) => {
        if (sql === "SQL:list-tables") {
          return [
            { schema_name: "SECOND", table_name: "ADDIG@@@Y", table_type: "T" },
            { schema_name: "FIRST", table_name: "ADDIG@@@Y", table_type: "T" },
          ];
        }
        return [{ column_name: "ID", data_type: "INTEGER" }];
      }),
      close: vi.fn(async () => undefined),
    };
    const catalogQueries: ISqlQueryProvider = {
      buildQuery: (_engine, feature) => `SQL:${feature}`,
    };
    const explorer = new CatalogExplorer(
      catalogQueries,
      () => ({ engine: "db2", searchPath: ["FIRST", "SECOND"] }),
      async () => connection,
    );

    const result = await explorer.describeTables("AZ7DB");

    expect(result).toHaveLength(1);
    expect(result[0]?.table).toBe("ADDIG@@@Y");
    expect(result[0]?.schema).toBe("FIRST");
  });

  it("passes tableName and tableList when filtering", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };
    const filterQueries: ISqlQueryProvider = {
      buildQuery: (_engine, _feature, params) => {
        expect(params.tableName).toBe("AZLHT");
        expect(params.tableList).toContain("'AZLHT'");
        expect(params.limitToPath).toBe("1");
        return "SQL:list-tables";
      },
    };
    const explorer = new CatalogExplorer(
      filterQueries,
      () => ({ engine: "db2", searchPath: ["AZBASWQA"] }),
      async () => connection,
    );
    await explorer.listTables("AZ7DB", ["azlht"]);
  });

  it("describes columns for an explicit schema", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => [
        {
          column_no: "1",
          column_name: "ID",
          data_type: "INTEGER",
          length: "4",
          scale: "0",
          nullable: "N",
          description: "Identifier",
        },
      ]),
      close: vi.fn(async () => undefined),
    };
    const features: string[] = [];
    const describeQueries: ISqlQueryProvider = {
      buildQuery: (_engine, feature, params) => {
        features.push(feature);
        expect(params.tableName).toBe("ACCCR7");
        if (feature === "find_table_schemas") {
          expect(params.schemaList).toBe("'AZBASWQA'");
        } else {
          expect(params.schema).toBe("AZBASWQA");
        }
        return "SQL:describe-table";
      },
    };
    const explorer = new CatalogExplorer(
      describeQueries,
      () => ({ engine: "db2", searchPath: ["AZBASWQA"] }),
      async () => connection,
    );
    const result = await explorer.describeTable("AZ7DB", "ACCCR7", "AZBASWQA");
    expect(result.columns[0]?.columnName).toBe("ID");
    expect(result.columns[0]?.description).toBe("Identifier");
    expect(features).toEqual(["find_table_schemas", "describe-table"]);
  });
});
