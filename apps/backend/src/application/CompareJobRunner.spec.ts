import { describe, expect, it, vi } from "vitest";
import type { IComparisonEngine, IOdbcConnection } from "@deltacore/shared";
import { runSchemaCompareJob } from "./CompareJobRunner.js";

function mockDb(): IOdbcConnection {
  return {
    getEngineType: () => "db2",
    query: vi.fn(async () => []),
    close: vi.fn(async () => undefined),
  };
}

describe("runSchemaCompareJob", () => {
  it("closes both connections after the engine returns", async () => {
    const source = mockDb();
    const target = mockDb();
    const engine: IComparisonEngine = {
      executeSchemaCompare: vi.fn(async () => ({
        jobId: "j1",
        status: "SUCCESS",
        schemaDelta: {},
      })),
      executeVolumeCompare: vi.fn(),
      executeRowCompare: vi.fn(),
    };
    const open = vi
      .fn()
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(target);

    const result = await runSchemaCompareJob(engine, open, {
      sourceDsn: "S",
      targetDsn: "T",
      tables: ["ACCCR7"],
    });

    expect(result.status).toBe("SUCCESS");
    expect(open).toHaveBeenCalledWith("S");
    expect(open).toHaveBeenCalledWith("T");
    expect(source.close).toHaveBeenCalled();
    expect(target.close).toHaveBeenCalled();
  });
});
