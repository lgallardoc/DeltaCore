export function catalogSchemaName(row: Record<string, unknown>): string {
  return String(
    row.schema_name ?? row.esquema ?? row.schemaname ?? row.table_schema ?? "",
  ).trim();
}

export function catalogTableName(row: Record<string, unknown>): string {
  return String(
    row.table_name ?? row.nombre ?? row.tabname ?? row.name ?? "",
  ).trim();
}
