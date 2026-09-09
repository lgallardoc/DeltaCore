import type {
  IComparisonEngine,
  IOdbcConnection,
  JobResult,
  RowCompareOptions,
} from "@deltacore/shared";

export type ConnectionFactory = (dsn: string) => Promise<IOdbcConnection>;

export async function runSchemaCompareJob(
  engine: IComparisonEngine,
  openConnection: ConnectionFactory,
  input: { sourceDsn: string; targetDsn: string; tables: string[] },
): Promise<JobResult> {
  return withPair(openConnection, input.sourceDsn, input.targetDsn, (source, target) =>
    engine.executeSchemaCompare(source, target, input.tables),
  );
}

export async function runVolumeCompareJob(
  engine: IComparisonEngine,
  openConnection: ConnectionFactory,
  input: {
    sourceDsn: string;
    targetDsn: string;
    patternId: string;
    sourceSchema?: string;
    targetSchema?: string;
  },
): Promise<JobResult> {
  return withPair(openConnection, input.sourceDsn, input.targetDsn, (source, target) =>
    engine.executeVolumeCompare(source, target, input.patternId, {
      sourceSchema: input.sourceSchema,
      targetSchema: input.targetSchema,
    }),
  );
}

export async function runRowCompareJob(
  engine: IComparisonEngine,
  openConnection: ConnectionFactory,
  input: RowCompareOptions & { sourceDsn: string; targetDsn: string },
): Promise<JobResult> {
  return withPair(openConnection, input.sourceDsn, input.targetDsn, (source, target) =>
    engine.executeRowCompare(source, target, input),
  );
}

async function withPair<T>(
  openConnection: ConnectionFactory,
  sourceDsn: string,
  targetDsn: string,
  run: (source: IOdbcConnection, target: IOdbcConnection) => Promise<T>,
): Promise<T> {
  let source: IOdbcConnection | undefined;
  let target: IOdbcConnection | undefined;
  try {
    source = await openConnection(sourceDsn);
    target = await openConnection(targetDsn);
    return await run(source, target);
  } finally {
    await source?.close().catch(() => undefined);
    await target?.close().catch(() => undefined);
  }
}
