import type {
  IAuditRepository,
  IComparisonEngine,
  IOdbcConnection,
  ISqlQueryProvider,
  JobResult,
} from "@deltacore/shared";
import type { ISchemaResolver } from "../domain/ports/ISchemaResolver.js";

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
  ): Promise<JobResult> {
    const jobId = this.newJobId();
    try {
      const sourceSchema = await this.schemaResolver.resolveTableSchema(
        sourceDb,
        patternId,
        this.searchPathFor(sourceDb),
      );
      const targetSchema = await this.schemaResolver.resolveTableSchema(
        targetDb,
        patternId,
        this.searchPathFor(targetDb),
      );
      const sourceSql = this.queries.buildQuery(
        sourceDb.getEngineType(),
        "volume-compare",
        {
          patternId,
          qualifiedTable: `${sourceSchema}.${patternId}`,
        },
      );
      const targetSql = this.queries.buildQuery(
        targetDb.getEngineType(),
        "volume-compare",
        {
          patternId,
          qualifiedTable: `${targetSchema}.${patternId}`,
        },
      );

      const sourceRows = await sourceDb.query<VolumeRow>(sourceSql);
      const targetRows = await targetDb.query<VolumeRow>(targetSql);
      const sourceCount = Number(sourceRows[0]?.row_count ?? 0);
      const targetCount = Number(targetRows[0]?.row_count ?? 0);
      const volumeDelta = sourceCount - targetCount;
      const status = volumeDelta === 0 ? "SUCCESS" : "DIFFERENCE";
      const result: JobResult = { jobId, status, volumeDelta };
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
