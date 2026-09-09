export type EngineType = "db2" | "oracle" | "sqlserver";
export type ActionType =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "run"
  | "cancel"
  | "rollback";
export type JobStatus = "PENDING" | "SUCCESS" | "DIFFERENCE" | "ERROR";

export interface RBACPermission {
  canView: boolean;
  canRead: boolean;
  canWrite: boolean;
}

export type RowValueMap = Record<string, string>;

export interface RowChange {
  key: RowValueMap;
  columns: Array<{ column: string; source: string; target: string }>;
}

export interface RowDelta {
  onlyInSource: number;
  onlyInTarget: number;
  changed: number;
  truncated: boolean;
  keyColumns: string[];
  comparedColumns: string[];
  sourceRows: number;
  targetRows: number;
  duplicateKeys: number;
  samples: {
    onlyInSource: RowValueMap[];
    onlyInTarget: RowValueMap[];
    changed: RowChange[];
  };
}

export interface RowCompareOptions {
  table: string;
  sourceSchema?: string;
  targetSchema?: string;
  keyColumns?: string[];
  limit?: number;
  sampleSize?: number;
}

export interface JobResult {
  jobId: string;
  status: JobStatus;
  volumeDelta?: number;
  sourceCount?: number;
  targetCount?: number;
  table?: string;
  sourceSchema?: string;
  targetSchema?: string;
  schemaDelta?: Record<string, any>;
  rowDelta?: RowDelta;
  error?: string;
}

export interface IOdbcConnection {
  getEngineType(): EngineType;
  query<T>(sql: string): Promise<T[]>;
  close(): Promise<void>;
}

export interface ISqlQueryProvider {
  buildQuery(
    engine: EngineType,
    feature: string,
    params: Record<string, string>,
  ): string;
}

export interface IAuditRepository {
  logAction(userId: string, action: string, payload: any): Promise<void>;
}

export interface IComparisonEngine {
  executeSchemaCompare(
    sourceDb: IOdbcConnection,
    targetDb: IOdbcConnection,
    tables: string[],
  ): Promise<JobResult>;
  executeVolumeCompare(
    sourceDb: IOdbcConnection,
    targetDb: IOdbcConnection,
    patternId: string,
    schemas?: { sourceSchema?: string; targetSchema?: string },
  ): Promise<JobResult>;
  executeRowCompare(
    sourceDb: IOdbcConnection,
    targetDb: IOdbcConnection,
    options: RowCompareOptions,
  ): Promise<JobResult>;
}
