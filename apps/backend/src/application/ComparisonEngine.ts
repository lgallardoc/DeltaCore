import type {
  IAuditRepository,
  IComparisonEngine,
  IOdbcConnection,
  ISqlQueryProvider,
  JobResult,
  RowCompareOptions,
} from "@deltacore/shared";
import type { ISchemaResolver } from "../domain/ports/ISchemaResolver.js";
import { sqlIdent } from "../domain/sqlLiterals.js";
import {
  clampRowLimit,
  compareNormalizedRows,
  DEFAULT_SAMPLE_SIZE,
  normalizeRow,
  rowDeltaHasDiff,
} from "./rowCompare.js";

type ColumnMeta = {
  column_name: string;
  data_type: string;
};

type VolumeRow = {
  pattern_id: string;
  row_count: number;
};

export class ComparisonEngine implements IComparisonEngine {
  constructor(
    private readonly queries: ISqlQueryProvider,
    private readonly audit: IAuditRepository,
    private readonly newJobId: () => string,
    private readonly schemaResolver: ISchemaResolver,
    private readonly searchPathFor: (db: IOdbcConnection) => string[],
  ) {}

  async executeSchemaCompare(
    sourceDb: IOdbcConnection,
    targetDb: IOdbcConnection,
    tables: string[],
  ): Promise<JobResult> {
    const jobId = this.newJobId();
    try {
      const schemaDelta: Record<string, any> = {};
      for (const table of tables) {
        const sourceSchema = await this.schemaResolver.resolveTableSchema(
          sourceDb,
          table,
          this.searchPathFor(sourceDb),
        );
        const targetSchema = await this.schemaResolver.resolveTableSchema(
          targetDb,
          table,
          this.searchPathFor(targetDb),
        );
        const tablesParam = `'${table}'`;
        const sourceSql = this.queries.buildQuery(
          sourceDb.getEngineType(),
          "schema-compare",
          { schema: sourceSchema, tables: tablesParam },
        );
        const targetSql = this.queries.buildQuery(
          targetDb.getEngineType(),
          "schema-compare",
          { schema: targetSchema, tables: tablesParam },
        );
        const sourceCols = await sourceDb.query<ColumnMeta>(sourceSql);
        const targetCols = await targetDb.query<ColumnMeta>(targetSql);
        Object.assign(schemaDelta, diffColumns(sourceCols, targetCols));
      }
      const status = Object.keys(schemaDelta).length > 0 ? "DIFFERENCE" : "SUCCESS";
      const result: JobResult = { jobId, status, schemaDelta };
      await this.audit.logAction("system", "run", result);
      return result;
    } catch (error) {
      const result: JobResult = { jobId, status: "ERROR" };
      await this.audit.logAction("system", "run", {
        ...result,
        error: String(error),
      });
      return result;
    }
  }

  async executeVolumeCompare(
    sourceDb: IOdbcConnection,
    targetDb: IOdbcConnection,
    patternId: string,
    schemas?: { sourceSchema?: string; targetSchema?: string },
  ): Promise<JobResult> {
    const jobId = this.newJobId();
    try {
      const table = sqlIdent(patternId);
      const sourceSchema = await this.resolveSchema(
        sourceDb,
        table,
        schemas?.sourceSchema,
      );
      const targetSchema = await this.resolveSchema(
        targetDb,
        table,
        schemas?.targetSchema,
      );
      const sourceSql = this.queries.buildQuery(
        sourceDb.getEngineType(),
        "volume-compare",
        {
          patternId: table,
          qualifiedTable: `${sqlIdent(sourceSchema)}.${table}`,
        },
      );
      const targetSql = this.queries.buildQuery(
        targetDb.getEngineType(),
        "volume-compare",
        {
          patternId: table,
          qualifiedTable: `${sqlIdent(targetSchema)}.${table}`,
        },
      );

      const sourceRows = await sourceDb.query<VolumeRow>(sourceSql);
      const targetRows = await targetDb.query<VolumeRow>(targetSql);
      const sourceCount = Number(sourceRows[0]?.row_count ?? 0);
      const targetCount = Number(targetRows[0]?.row_count ?? 0);
      const volumeDelta = sourceCount - targetCount;
      const status = volumeDelta === 0 ? "SUCCESS" : "DIFFERENCE";
      const result: JobResult = {
        jobId,
        status,
        volumeDelta,
        sourceCount,
        targetCount,
        table,
        sourceSchema,
        targetSchema,
      };
      await this.audit.logAction("system", "run", result);
      return result;
    } catch (error) {
      const result: JobResult = { jobId, status: "ERROR" };
      await this.audit.logAction("system", "run", {
        ...result,
        error: String(error),
      });
      return result;
    }
  }

  async executeRowCompare(
    sourceDb: IOdbcConnection,
    targetDb: IOdbcConnection,
    options: RowCompareOptions,
  ): Promise<JobResult> {
    const jobId = this.newJobId();
    try {
      const table = sqlIdent(options.table);
      const sourceSchema = await this.resolveSchema(
        sourceDb,
        table,
        options.sourceSchema,
      );
      const targetSchema = await this.resolveSchema(
        targetDb,
        table,
        options.targetSchema,
      );
      const sourceCols = await this.loadColumnNames(sourceDb, sourceSchema, table);
      const targetCols = await this.loadColumnNames(targetDb, targetSchema, table);
      const comparedColumns = sourceCols.filter((column) =>
        targetCols.includes(column),
      );
      if (comparedColumns.length === 0) {
        throw new Error(
          `No common columns to compare for ${sourceSchema}.${table} and ${targetSchema}.${table}`,
        );
      }
      const requestedKeys = (options.keyColumns ?? []).map((column) =>
        sqlIdent(column),
      );
      const catalogKeys =
        requestedKeys.length > 0
          ? requestedKeys
          : await this.loadPrimaryKey(sourceDb, sourceSchema, table);
      const keyColumns =
        catalogKeys.length > 0
          ? catalogKeys.filter((column) => comparedColumns.includes(column))
          : comparedColumns;
      if (keyColumns.length === 0) {
        throw new Error("row-compare key columns are not present on both tables");
      }
      const limit = clampRowLimit(options.limit);
      const fetchLimit = String(limit + 1);
      const selectList = comparedColumns.join(", ");
      const sourceSql = this.queries.buildQuery(
        sourceDb.getEngineType(),
        "row-compare",
        {
          selectList,
          qualifiedTable: `${sqlIdent(sourceSchema)}.${table}`,
          limit: fetchLimit,
        },
      );
      const targetSql = this.queries.buildQuery(
        targetDb.getEngineType(),
        "row-compare",
        {
          selectList,
          qualifiedTable: `${sqlIdent(targetSchema)}.${table}`,
          limit: fetchLimit,
        },
      );
      const sourceFetched = await sourceDb.query<Record<string, unknown>>(sourceSql);
      const targetFetched = await targetDb.query<Record<string, unknown>>(targetSql);
      const truncated =
        sourceFetched.length > limit || targetFetched.length > limit;
      const source = sourceFetched
        .slice(0, limit)
        .map((row) => normalizeRow(row, comparedColumns));
      const target = targetFetched
        .slice(0, limit)
        .map((row) => normalizeRow(row, comparedColumns));
      const sampleSize = Math.max(
        1,
        Math.floor(options.sampleSize ?? DEFAULT_SAMPLE_SIZE),
      );
      const rowDelta = compareNormalizedRows({
        source,
        target,
        keyColumns,
        comparedColumns,
        truncated,
        sampleSize,
      });
      const status = rowDeltaHasDiff(rowDelta) ? "DIFFERENCE" : "SUCCESS";
      const result: JobResult = {
        jobId,
        status,
        table,
        sourceSchema,
        targetSchema,
        sourceCount: source.length,
        targetCount: target.length,
        volumeDelta: source.length - target.length,
        rowDelta,
      };
      await this.audit.logAction("system", "run", result);
      return result;
    } catch (error) {
      const result: JobResult = { jobId, status: "ERROR" };
      await this.audit.logAction("system", "run", {
        ...result,
        error: String(error),
      });
      return result;
    }
  }

  private async loadColumnNames(
    db: IOdbcConnection,
    schema: string,
    table: string,
  ): Promise<string[]> {
    const sql = this.queries.buildQuery(db.getEngineType(), "describe-table", {
      schema,
      tableName: table,
    });
    const rows = await db.query<{ column_name?: string }>(sql);
    return rows
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean)
      .map((name) => sqlIdent(name));
  }

  private async loadPrimaryKey(
    db: IOdbcConnection,
    schema: string,
    table: string,
  ): Promise<string[]> {
    try {
      const sql = this.queries.buildQuery(db.getEngineType(), "primary-key", {
        schema,
        tableName: table,
      });
      const rows = await db.query<{ column_name?: string }>(sql);
      return rows
        .map((row) => String(row.column_name ?? "").trim())
        .filter(Boolean)
        .map((name) => sqlIdent(name));
    } catch {
      return [];
    }
  }

  private async resolveSchema(
    db: IOdbcConnection,
    table: string,
    override?: string,
  ): Promise<string> {
    if (override) {
      return sqlIdent(override);
    }
    return this.schemaResolver.resolveTableSchema(
      db,
      table,
      this.searchPathFor(db),
    );
  }
}

function diffColumns(
  source: ColumnMeta[],
  target: ColumnMeta[],
): Record<string, any> {
  const targetMap = new Map(
    target.map((col) => [col.column_name, col.data_type]),
  );
  const delta: Record<string, any> = {};
  for (const col of source) {
    const targetType = targetMap.get(col.column_name);
    if (targetType === undefined) {
      delta[col.column_name] = { source: col.data_type, target: null };
    } else if (targetType !== col.data_type) {
      delta[col.column_name] = { source: col.data_type, target: targetType };
    }
  }
  return delta;
}
