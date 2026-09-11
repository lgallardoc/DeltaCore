import { describe, expect, it } from "vitest";
import { formatOdbcError, stripSqlTerminator } from "./UnixOdbcConnection.js";

describe("stripSqlTerminator", () => {
  it("removes the terminator accepted by ACS but not required by ODBC", () => {
    expect(stripSqlTerminator("SELECT 1;\n")).toBe("SELECT 1");
  });

  it("preserves SQL without a terminator", () => {
    expect(stripSqlTerminator("SELECT 1")).toBe("SELECT 1");
  });

  it("includes SQLSTATE diagnostics returned by the ODBC driver", () => {
    expect(
      formatOdbcError({
        odbcErrors: [{ state: "08001", message: "Network connection failed" }],
      }),
    ).toBe("08001: Network connection failed");
  });
});