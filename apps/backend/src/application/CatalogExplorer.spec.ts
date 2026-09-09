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
      { schema: "AZBASWQA", table: "ACCCR7", tableType: "T" },
      { schema: "AZLOSWQACL", table: "ACCCR7", tableType: "T" },
    ]);
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
    const describeQueries: ISqlQueryProvider = {
      buildQuery: (_engine, feature, params) => {
        expect(feature).toBe("describe-table");
        expect(params.schema).toBe("AZBASWQA");
        expect(params.tableName).toBe("ACCCR7");
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
  });
});
