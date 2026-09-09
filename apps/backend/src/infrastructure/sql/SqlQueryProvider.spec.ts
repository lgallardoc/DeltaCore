import path from "node:path";
import { describe, expect, it } from "vitest";
import { SqlQueryProvider } from "../sql/SqlQueryProvider.js";
import type { ITextFileReader } from "../../domain/ports/ITextFileReader.js";

class InMemorySqlFiles implements ITextFileReader {
  constructor(private readonly files: Record<string, string>) {}

  readTextSync(absolutePath: string): string {
    const key = absolutePath.replaceAll("\\", "/");
    const hit = Object.entries(this.files).find(([file]) => key.endsWith(file));
    if (!hit) {
      throw new Error(`SQL file not found: ${absolutePath}`);
    }
    return hit[1];
  }
}

describe("SqlQueryProvider", () => {
  it("interpolates {{variables}} from a dialect feature file", () => {
    const files = new InMemorySqlFiles({
      "db2/schema-compare.sql":
        "SELECT * FROM SYSCAT.COLUMNS WHERE TABSCHEMA = '{{schema}}'",
    });
    const provider = new SqlQueryProvider("/virtual/sql-dialects", files);

    const sql = provider.buildQuery("db2", "schema-compare", { schema: "QGPL" });

    expect(sql).toContain("TABSCHEMA = 'QGPL'");
    expect(sql).not.toContain("{{");
  });

  it("rejects missing placeholders without a live database", () => {
    const files = new InMemorySqlFiles({
      "oracle/volume-compare.sql": "SELECT '{{missing}}' FROM dual",
    });
    const provider = new SqlQueryProvider("/virtual/sql-dialects", files);

    expect(() => provider.buildQuery("oracle", "volume-compare", {})).toThrow(
      /Missing SQL variables/,
    );
  });

  it("resolves paths as <engine>/<feature>.sql", () => {
    const seen: string[] = [];
    const files: ITextFileReader = {
      readTextSync(absolutePath) {
        seen.push(absolutePath);
        return "SELECT 1";
      },
    };
    const root = path.join("/repo", "sql-dialects");
    new SqlQueryProvider(root, files).buildQuery("sqlserver", "schema-compare", {});
    expect(seen[0]).toBe(path.join(root, "sqlserver", "schema-compare.sql"));
  });
});
