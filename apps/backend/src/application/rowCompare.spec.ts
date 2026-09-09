import { describe, expect, it } from "vitest";
import {
  compareNormalizedRows,
  normalizeCell,
  normalizeRow,
} from "./rowCompare.js";

describe("rowCompare", () => {
  it("trims trailing CHAR padding", () => {
    expect(normalizeCell("ABC   ")).toBe("ABC");
  });

  it("reports only-in-source, only-in-target and changed columns", () => {
    const delta = compareNormalizedRows({
      source: [
        { ID: "1", NAME: "A" },
        { ID: "2", NAME: "B" },
        { ID: "3", NAME: "C" },
      ],
      target: [
        { ID: "1", NAME: "A" },
        { ID: "2", NAME: "B-changed" },
        { ID: "4", NAME: "D" },
      ],
      keyColumns: ["ID"],
      comparedColumns: ["ID", "NAME"],
      truncated: false,
      sampleSize: 10,
    });
    expect(delta.onlyInSource).toBe(1);
    expect(delta.onlyInTarget).toBe(1);
    expect(delta.changed).toBe(1);
    expect(delta.samples.changed[0]).toEqual({
      key: { ID: "2" },
      columns: [{ column: "NAME", source: "B", target: "B-changed" }],
    });
  });

  it("normalizes mixed-case ODBC keys", () => {
    expect(normalizeRow({ id: "1", name: "x" }, ["ID", "NAME"])).toEqual({
      ID: "1",
      NAME: "x",
    });
  });
});
