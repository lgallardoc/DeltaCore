import { describe, expect, it } from "vitest";
import { CliUsageError, parseCli } from "./parseCli.js";

describe("parseCli", () => {
  it("shows help for empty argv", () => {
    expect(parseCli([])).toEqual({ name: "help" });
  });

  it("parses schema-compare tables and default DSN", () => {
    const previous = process.env.DB2_ODBC_DSN;
    process.env.DB2_ODBC_DSN = "AZ7DB";
    expect(
      parseCli(["schema-compare", "--table", "ACCCR7", "--table", "FOO"]),
    ).toEqual({
      name: "schema-compare",
      sourceDsn: "AZ7DB",
      targetDsn: "AZ7DB",
      tables: ["ACCCR7", "FOO"],
      json: false,
    });
    if (previous === undefined) {
      delete process.env.DB2_ODBC_DSN;
    } else {
      process.env.DB2_ODBC_DSN = previous;
    }
  });

  it("parses volume-compare with --table", () => {
    expect(
      parseCli([
        "volume-compare",
        "--source",
        "AZ7DB",
        "--target",
        "AZ7DBPRDCL",
        "--table",
        "ACCTX",
        "--json",
      ]),
    ).toEqual({
      name: "volume-compare",
      sourceDsn: "AZ7DB",
      targetDsn: "AZ7DBPRDCL",
      patternId: "ACCTX",
      json: true,
    });
  });

  it("parses volume-compare with --pattern", () => {
    expect(
      parseCli([
        "volume-compare",
        "--source",
        "A",
        "--target",
        "B",
        "--pattern",
        "p1",
        "--json",
      ]),
    ).toEqual({
      name: "volume-compare",
      sourceDsn: "A",
      targetDsn: "B",
      patternId: "p1",
      json: true,
    });
  });

  it("parses volume-compare source and target schemas", () => {
    expect(
      parseCli([
        "volume-compare",
        "--source",
        "AZ7DB",
        "--target",
        "AZ7DBPRDCL",
        "--table",
        "ACCTX",
        "--source-schema",
        "AZBASWQA",
        "--target-schema",
        "AXSW1PDCL",
      ]),
    ).toEqual({
      name: "volume-compare",
      sourceDsn: "AZ7DB",
      targetDsn: "AZ7DBPRDCL",
      patternId: "ACCTX",
      sourceSchema: "AZBASWQA",
      targetSchema: "AXSW1PDCL",
      json: false,
    });
  });

  it("parses row-compare keys and schemas", () => {
    expect(
      parseCli([
        "row-compare",
        "--source",
        "AZ7DB",
        "--target",
        "AZ7DBPRDCL",
        "--table",
        "ACCTX",
        "--source-schema",
        "AZBASWQA",
        "--target-schema",
        "AXSW1PDCL",
        "--key",
        "ID, CODE",
        "--key",
        "SITE",
        "--limit",
        "500",
        "--json",
      ]),
    ).toEqual({
      name: "row-compare",
      sourceDsn: "AZ7DB",
      targetDsn: "AZ7DBPRDCL",
      table: "ACCTX",
      sourceSchema: "AZBASWQA",
      targetSchema: "AXSW1PDCL",
      keyColumns: ["ID", "CODE", "SITE"],
      limit: 500,
      json: true,
    });
  });

  it("rejects schema-compare without tables", () => {
    expect(() => parseCli(["schema-compare"])).toThrow(CliUsageError);
  });

  it("parses list-schemas with --dsn", () => {
    expect(parseCli(["list-schemas", "--dsn", "AZ7DB"])).toEqual({
      name: "list-schemas",
      dsn: "AZ7DB",
      json: false,
    });
  });

  it("parses list-tables with --source", () => {
    expect(parseCli(["list-tables", "--source", "LAB", "--json"])).toEqual({
      name: "list-tables",
      dsn: "LAB",
      tables: [],
      allSchemas: false,
      json: true,
    });
  });

  it("parses find-table with --all-schemas", () => {
    expect(
      parseCli(["find-table", "--table", "AZLHT", "--all-schemas", "--dsn", "AZ7DB"]),
    ).toEqual({
      name: "find-table",
      dsn: "AZ7DB",
      tables: ["AZLHT"],
      allSchemas: true,
      json: false,
    });
  });

  it("parses describe-table", () => {
    expect(
      parseCli(["describe-table", "--table", "ACCCR7", "--schema", "AZBASWQA"]),
    ).toEqual({
      name: "describe-table",
      dsn: "AZ7DB",
      table: "ACCCR7",
      schema: "AZBASWQA",
      json: false,
    });
  });
});
