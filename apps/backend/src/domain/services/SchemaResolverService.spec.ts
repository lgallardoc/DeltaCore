import { describe, expect, it, vi } from "vitest";
import type { IOdbcConnection, ISqlQueryProvider } from "@deltacore/shared";
import { SchemaResolverService } from "./SchemaResolverService.js";

describe("SchemaResolverService", () => {
  const queries: ISqlQueryProvider = {
    buildQuery: (_engine, feature, params) => {
      expect(feature).toBe("find_table_schemas");
      expect(params.tableName).toBe("TRXLOG");
      expect(params.schemaList).toContain("'QTEMP'");
      return "SELECT schema_name FROM catalogs";
    },
  };

  it("returns the searchPath winner when the table exists in two schemas", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => [
        { schema_name: "HIST" },
        { schema_name: "PROD" },
      ]),
      close: vi.fn(async () => undefined),
    };
    const resolver = new SchemaResolverService(queries);

    const schema = await resolver.resolveTableSchema(connection, "TRXLOG", [
      "QTEMP",
      "PROD",
      "HIST",
    ]);

    expect(schema).toBe("PROD");
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it("throws when the table is absent from the entire path", async () => {
    const connection: IOdbcConnection = {
      getEngineType: () => "db2",
      query: vi.fn(async () => []),
      close: vi.fn(async () => undefined),
    };
    const resolver = new SchemaResolverService(queries);

    await expect(
      resolver.resolveTableSchema(connection, "TRXLOG", ["QTEMP", "PROD"]),
    ).rejects.toThrow(/not found in path/);
  });
});
