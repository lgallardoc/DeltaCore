import type { RowChange, RowDelta, RowValueMap } from "@deltacore/shared";

export const DEFAULT_ROW_LIMIT = 10_000;
export const MAX_ROW_LIMIT = 50_000;
export const DEFAULT_SAMPLE_SIZE = 25;

export type NormalizedRow = RowValueMap;

export function clampRowLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_ROW_LIMIT;
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("row-compare --limit must be a positive integer");
  }
  return Math.min(Math.floor(value), MAX_ROW_LIMIT);
}

export function normalizeCell(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value.replace(/\s+$/u, "");
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.toString("hex");
  }
  return String(value).replace(/\s+$/u, "");
}

export function normalizeRow(
  raw: Record<string, unknown>,
  columns: string[],
): NormalizedRow {
  const out: NormalizedRow = {};
  for (const column of columns) {
    const lower = column.toLowerCase();
    const value =
      raw[lower] ?? raw[column] ?? raw[column.toUpperCase()];
    out[column] = normalizeCell(value);
  }
  return out;
}

export function compareNormalizedRows(input: {
  source: NormalizedRow[];
  target: NormalizedRow[];
  keyColumns: string[];
  comparedColumns: string[];
  truncated: boolean;
  sampleSize: number;
}): RowDelta {
  const { keyColumns, comparedColumns, truncated, sampleSize } = input;
  const sourceByKey = groupByKey(input.source, keyColumns);
  const targetByKey = groupByKey(input.target, keyColumns);
  const keys = new Set([...sourceByKey.keys(), ...targetByKey.keys()]);

  const onlyInSource: RowValueMap[] = [];
  const onlyInTarget: RowValueMap[] = [];
  const changed: RowChange[] = [];
  let duplicateKeys = 0;

  for (const key of keys) {
    const sourceRows = sourceByKey.get(key) ?? [];
    const targetRows = targetByKey.get(key) ?? [];
    if (sourceRows.length > 1) {
      duplicateKeys += 1;
    }
    if (targetRows.length > 1) {
      duplicateKeys += 1;
    }
    const paired = Math.min(sourceRows.length, targetRows.length);
    for (let i = 0; i < paired; i += 1) {
      const columns = diffPayload(sourceRows[i], targetRows[i], comparedColumns);
      if (columns.length > 0) {
        changed.push({
          key: pick(sourceRows[i], keyColumns),
          columns,
          sourceRow: pick(sourceRows[i], comparedColumns),
          targetRow: pick(targetRows[i], comparedColumns),
        });
      }
    }
    for (let i = paired; i < sourceRows.length; i += 1) {
      onlyInSource.push(pick(sourceRows[i], comparedColumns));
    }
    for (let i = paired; i < targetRows.length; i += 1) {
      onlyInTarget.push(pick(targetRows[i], comparedColumns));
    }
  }

  return {
    onlyInSource: onlyInSource.length,
    onlyInTarget: onlyInTarget.length,
    changed: changed.length,
    truncated,
    keyColumns,
    comparedColumns,
    sourceRows: input.source.length,
    targetRows: input.target.length,
    duplicateKeys,
    samples: {
      onlyInSource: onlyInSource.slice(0, sampleSize),
      onlyInTarget: onlyInTarget.slice(0, sampleSize),
      changed: changed.slice(0, sampleSize),
    },
    details: {
      onlyInSource,
      onlyInTarget,
      changed,
    },
  };
}

export function rowDeltaHasDiff(delta: RowDelta): boolean {
  return delta.onlyInSource > 0 || delta.onlyInTarget > 0 || delta.changed > 0;
}

function groupByKey(
  rows: NormalizedRow[],
  keyColumns: string[],
): Map<string, NormalizedRow[]> {
  const map = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = keyColumns.map((column) => `${column}=${row[column] ?? ""}`).join("\0");
    const list = map.get(key);
    if (list) {
      list.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

function diffPayload(
  source: NormalizedRow,
  target: NormalizedRow,
  columns: string[],
): RowChange["columns"] {
  const diffs: RowChange["columns"] = [];
  for (const column of columns) {
    const left = source[column] ?? "";
    const right = target[column] ?? "";
    if (left !== right) {
      diffs.push({ column, source: left, target: right });
    }
  }
  return diffs;
}

function pick(row: NormalizedRow, columns: string[]): RowValueMap {
  const out: RowValueMap = {};
  for (const column of columns) {
    out[column] = row[column] ?? "";
  }
  return out;
}
