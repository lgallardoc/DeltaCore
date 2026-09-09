export interface ISqliteExecutor {
  exec(sql: string): void | Promise<void>;
}

export async function initializeDataModel(
  db: ISqliteExecutor,
  schemaSql: string,
): Promise<void> {
  await db.exec(schemaSql);
}
