import type { AssignedSchema, CatalogTable, TableColumn } from "../../application/CatalogExplorer.js";

export function formatSchemaList(payload: {
  dsn: string;
  engine: string;
  schemas: AssignedSchema[];
}): string {
  const lines = [
    `DSN ${payload.dsn} (${payload.engine})`,
    "Assigned schemas (*LIBL, priority order):",
  ];
  for (const item of payload.schemas) {
    const flag = item.presentInCatalog ? "in catalog" : "not in catalog";
    lines.push(`  ${item.priority + 1}. ${item.schema}  (${flag})`);
  }
  if (payload.schemas.length === 0) {
    lines.push("  (none)");
  }
  return `${lines.join("\n")}\n`;
}

export function formatTableList(payload: {
  dsn: string;
  engine: string;
  searchPath: string[];
  tables: CatalogTable[];
}): string {
  const lines = [
    `DSN ${payload.dsn} (${payload.engine})`,
    `Search path: ${payload.searchPath.join(", ") || "(none)"}`,
    "Tables (schema.table):",
  ];
  if (payload.tables.length === 0) {
    lines.push("  (none)");
  }
  for (const row of payload.tables) {
    lines.push(`  ${row.schema}.${row.table}`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatFindTable(payload: {
  dsn: string;
  engine: string;
  searchPath: string[];
  allSchemas?: boolean;
  tables: CatalogTable[];
  queryTables: string[];
}): string {
  const names = payload.queryTables.map((name) => name.toUpperCase()).join(", ");
  const scope = payload.allSchemas
    ? "entire catalog"
    : `*LIBL* (${payload.searchPath.join(", ") || "empty"})`;
  const byTable = new Map<string, string[]>();
  for (const row of payload.tables) {
    const table = row.table.toUpperCase();
    const schemas = byTable.get(table) ?? [];
    schemas.push(row.schema);
    byTable.set(table, schemas);
  }
  const lines = [`DSN ${payload.dsn} (${payload.engine})`, `Scope: ${scope}`];
  for (const name of payload.queryTables.map((item) => item.toUpperCase())) {
    const schemas = byTable.get(name) ?? [];
    lines.push(`Table ${name}:`);
    if (schemas.length === 0) {
      lines.push("  (not found)");
    } else {
      for (const schema of schemas) {
        lines.push(`  ${schema}`);
      }
    }
  }
  if (!names) {
    lines.push("  (no --table given)");
  }
  return `${lines.join("\n")}\n`;
}

export function formatDescribeTable(payload: {
  dsn: string;
  engine: string;
  schema: string;
  table: string;
  columns: TableColumn[];
}): string {
  const lines = [
    `DSN ${payload.dsn} (${payload.engine})`,
    `Table ${payload.schema}.${payload.table}`,
    "No  Column            Type            Length Scale Null  Description",
  ];
  if (payload.columns.length === 0) {
    lines.push("  (no columns)");
  }
  for (const col of payload.columns) {
    const no = col.columnNo.padEnd(3);
    const name = col.columnName.padEnd(17);
    const type = col.dataType.padEnd(15);
    const length = col.length.padEnd(6);
    const scale = col.scale.padEnd(5);
    lines.push(
      ` ${no} ${name} ${type} ${length} ${scale} ${col.nullable.padEnd(4)} ${col.description}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
