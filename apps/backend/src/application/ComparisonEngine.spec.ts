import { describe, expect, it, vi } from "vitest";
import type {
  IAuditRepository,
  IOdbcConnection,
  ISqlQueryProvider,
} from "@deltacore/shared";
import type { ISchemaResolver } from "../domain/ports/ISchemaResolver.js";
import { ComparisonEngine } from "./ComparisonEngine.js";

function mockDb(rows: object[]): IOdbcConnection {
  return {
    getEngineType: () => "db2",
    query: vi.fn(async () => rows),
    close: vi.fn(async () => undefined),
  };
}

describe("ComparisonEngine", () => {
  const queries: ISqlQueryProvider = {
    buildQuery: () => "SELECT 1",
  };
  const audit: IAuditRepository = {
    logAction: vi.fn(async () => undefined),
  };
  const schemaResolver: ISchemaResolver = {
    resolveTableSchema: vi.fn(async () => "PROD"),
  };
  const searchPathFor = () => ["QTEMP", "PROD"];

  it("marks schema compare as DIFFERENCE when columns diverge", async () => {
    const engine = new ComparisonEngine(
      queries,
      audit,
      () => "job-1",
      schemaResolver,
      searchPathFor,
    );
    const source = mockDb([{ column_name: "ID", data_type: "INTEGER" }]);
    const target = mockDb([{ column_name: "ID", data_type: "BIGINT" }]);

    const result = await engine.executeSchemaCompare(source, target, ["T1"]);

    expect(result.status).toBe("DIFFERENCE");
    expect(result.schemaDelta?.ID).toEqual({
      source: "INTEGER",
      target: "BIGINT",
    });
    expect(schemaResolver.resolveTableSchema).toHaveBeenCalled();
    expect(audit.logAction).toHaveBeenCalled();
  });

  it("computes volumeDelta without opening a live database", async () => {
    const engine = new ComparisonEngine(
      queries,
      audit,
      () => "job-2",
      schemaResolver,
      searchPathFor,
    );
    const source = mockDb([{ pattern_id: "p1", row_count: 10 }]);
    const target = mockDb([{ pattern_id: "p1", row_count: 7 }]);

    const result = await engine.executeVolumeCompare(source, target, "p1");

    expect(result.status).toBe("DIFFERENCE");
    expect(result.volumeDelta).toBe(3);
    expect(result.sourceCount).toBe(10);
    expect(result.targetCount).toBe(7);
    expect(result.table).toBe("P1");
  });

  it("uses explicit schemas for volume compare", async () => {
    const engine = new ComparisonEngine(
      queries,
      audit,
      () => "job-3",
      schemaResolver,
      searchPathFor,
    );
    const source = mockDb([{ pattern_id: "ACCTX", row_count: 1604 }]);
    const target = mockDb([{ pattern_id: "ACCTX", row_count: 1089 }]);
    vi.mocked(schemaResolver.resolveTableSchema).mockClear();

    const result = await engine.executeVolumeCompare(source, target, "ACCTX", {
      sourceSchema: "AZBASWQA",
      targetSchema: "AXSW1PDCL",
    });

    expect(result.status).toBe("DIFFERENCE");
    expect(result.sourceCount).toBe(1604);
    expect(result.targetCount).toBe(1089);
    expect(result.sourceSchema).toBe("AZBASWQA");
    expect(result.targetSchema).toBe("AXSW1PDCL");
    expect(schemaResolver.resolveTableSchema).not.toHaveBeenCalled();
  });

  it("compares row values using an explicit key", async () => {
    const queries: ISqlQueryProvider = {
      buildQuery: (_engine, feature) => `SQL:${feature}`,
    };
    const engine = new ComparisonEngine(
      queries,
      audit,
      () => "job-4",
      schemaResolver,
      searchPathFor,
    );
    const source = {
      getEngineType: () => "db2" as const,
      query: vi.fn(async (sql: string) => {
        if (sql === "SQL:describe-table") {
          return [{ column_name: "ID" }, { column_name: "NAME" }];
        }
        if (sql === "SQL:row-compare") {
          return [
            { id: "1", name: "A" },
            { id: "2", name: "B" },
          ];
        }
        return [];
      }),
      close: vi.fn(async () => undefined),
    };
    const target = {
      getEngineType: () => "db2" as const,
      query: vi.fn(async (sql: string) => {
        if (sql === "SQL:describe-table") {
          return [{ column_name: "ID" }, { column_name: "NAME" }];
        }
        if (sql === "SQL:row-compare") {
          return [
            { id: "1", name: "A" },
            { id: "2", name: "B2" },
          ];
        }
        return [];
      }),
      close: vi.fn(async () => undefined),
    };

    const result = await engine.executeRowCompare(source, target, {
      table: "ACCTX",
      sourceSchema: "AZBASWQA",
      targetSchema: "AXSW1PDCL",
      keyColumns: ["ID"],
    });

    expect(result.status).toBe("DIFFERENCE");
    expect(result.rowDelta?.changed).toBe(1);
    expect(result.rowDelta?.samples.changed[0].columns[0]).toEqual({
      column: "NAME",
      source: "B",
      target: "B2",
    });
    expect(source.query).not.toHaveBeenCalledWith("SQL:primary-key");
  });
});
