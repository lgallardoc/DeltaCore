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
  });
});
