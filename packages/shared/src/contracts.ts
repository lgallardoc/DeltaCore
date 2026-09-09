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

export interface JobResult {
  jobId: string;
  status: JobStatus;
  volumeDelta?: number;
  schemaDelta?: Record<string, any>;
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
  ): Promise<JobResult>;
}
