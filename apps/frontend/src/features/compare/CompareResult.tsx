import { Eye, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  JobResult,
  RowValueMap,
  SchemaColumnComparison,
  SchemaColumnStatus,
} from "@deltacore/shared";
import type { SchemaTableDetail } from "./CompareView";

export type ColumnInfo = {
  columnName: string;
  description: string;
  dataType?: string;
};

type Props = {
  result: JobResult;
  columns?: ColumnInfo[];
  tableDescriptions?: Record<string, string>;
  onLoadSchemaDetail?: (table: string) => Promise<SchemaTableDetail>;
};

export function CompareResult({
  result,
  columns = [],
  tableDescriptions = {},
  onLoadSchemaDetail,
}: Props) {
  const labels = columnMap(columns);
  const schemaEntries = Object.entries(result.schemaDelta ?? {});
  const schemaComparison = result.schemaComparison ?? [];
  const [selectedSchemaTable, setSelectedSchemaTable] = useState<string | null>(null);
  const [schemaDetail, setSchemaDetail] = useState<SchemaTableDetail | null>(null);
  const [schemaDetailError, setSchemaDetailError] = useState("");
  const [schemaDetailBusy, setSchemaDetailBusy] = useState(false);
  const samples = result.rowDelta?.samples;
  const schemaTables = summarizeSchemaComparison(schemaComparison, tableDescriptions);

  return (
    <section className="space-y-4">
      {result.volumeDelta != null ? (
        <div className="stats stats-vertical w-full border shadow lg:stats-horizontal">
          <div className="stat">
            <div className="stat-title">Origen</div>
            <div className="stat-value dc-origin text-2xl">{result.sourceCount ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Destino</div>
            <div className="stat-value dc-target text-2xl">{result.targetCount ?? "—"}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Delta</div>
            <div className="stat-value text-2xl text-amber-700">{result.volumeDelta}</div>
          </div>
        </div>
      ) : null}

      {result.rowDelta ? (
        <div className="overflow-x-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Solo origen</th>
                <th>Solo destino</th>
                <th>Cambiadas</th>
                <th>Clave</th>
                <th>Truncado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{result.rowDelta.onlyInSource}</td>
                <td>{result.rowDelta.onlyInTarget}</td>
                <td>{result.rowDelta.changed}</td>
                <td>Clave</td>
                <td>{result.rowDelta.truncated ? "sí" : "no"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {schemaTables.length > 0 ? (
        <ResultTable title="Comparación de esquema">
          <thead>
            <tr>
              <th>Tabla</th>
              <th>Descripción</th>
              <th>Integridad</th>
              <th>Estado</th>
              <th>Ver</th>
            </tr>
          </thead>
          <tbody>
            {schemaTables.map((table) => (
              <tr key={table.name}>
                <td className="font-code">{table.name}</td>
                <td>{table.description || "—"}</td>
                <td>{table.integrity}%</td>
                <td className={table.integrity === 100 ? "text-emerald-700" : "text-amber-700"}>
                  {table.integrity === 100 ? "Íntegro" : "Con diferencias"}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-xs"
                    onClick={() => void openSchemaDetail(table.name)}
                    title={`Ver detalle de ${table.name}`}
                  >
                    <Eye size={13} /> Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </ResultTable>
      ) : schemaEntries.length > 0 ? (
        <ResultTable title="Diferencias de esquema">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Campo</th>
              <th>Tipo origen</th>
              <th>Tipo destino</th>
            </tr>
          </thead>
          <tbody>
            {schemaEntries.map(([column, delta]) => (
              <tr key={column}>
                <td>{headerText(column, labels)}</td>
                <td className="font-code">{column}</td>
                <td className="font-code">{String((delta as { source?: unknown }).source ?? "")}</td>
                <td className="font-code">{String((delta as { target?: unknown }).target ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </ResultTable>
      ) : null}

      {samples?.changed.length ? (
        <WideDiffTable
          title="Filas cambiadas (muestra)"
          keyColumns={result.rowDelta?.keyColumns ?? []}
          labels={labels}
          compareValues
          rows={samples.changed.map((change) => ({
            key: change.key,
            values: Object.fromEntries(
              change.columns.map((col) => [
                col.column,
                { source: col.source, target: col.target },
              ]),
            ),
          }))}
        />
      ) : null}

      {samples?.onlyInSource.length ? (
        <WideDiffTable
          title="Solo en origen (muestra)"
          keyColumns={result.rowDelta?.keyColumns ?? []}
          labels={labels}
          rows={samples.onlyInSource.map((row) => ({
            key: pick(row, result.rowDelta?.keyColumns ?? []),
            values: Object.fromEntries(
              Object.entries(row)
                .filter(([column]) => !isKeyColumn(column, result.rowDelta?.keyColumns ?? []))
                .map(([column, value]) => [column, { source: value, target: "" }]),
            ),
          }))}
        />
      ) : null}
      {samples?.onlyInTarget.length ? (
        <WideDiffTable
          title="Solo en destino (muestra)"
          keyColumns={result.rowDelta?.keyColumns ?? []}
          labels={labels}
          rows={samples.onlyInTarget.map((row) => ({
            key: pick(row, result.rowDelta?.keyColumns ?? []),
            values: Object.fromEntries(
              Object.entries(row)
                .filter(([column]) => !isKeyColumn(column, result.rowDelta?.keyColumns ?? []))
                .map(([column, value]) => [column, { source: "", target: value }]),
            ),
          }))}
        />
      ) : null}
      {selectedSchemaTable ? (
        <SchemaDetailModal
          table={selectedSchemaTable}
          detail={schemaDetail}
          error={schemaDetailError}
          busy={schemaDetailBusy}
          onClose={() => {
            setSelectedSchemaTable(null);
            setSchemaDetail(null);
          }}
        />
      ) : null}
    </section>
  );

  async function openSchemaDetail(table: string) {
    setSelectedSchemaTable(table);
    setSchemaDetail(null);
    setSchemaDetailError("");
    if (!onLoadSchemaDetail) {
      setSchemaDetailError("No se pudo cargar el detalle de esquema.");
      return;
    }
    setSchemaDetailBusy(true);
    try {
      setSchemaDetail(await onLoadSchemaDetail(table));
    } catch (error) {
      setSchemaDetailError(
        (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (error instanceof Error ? error.message : "No se pudo cargar el detalle de esquema."),
      );
    } finally {
      setSchemaDetailBusy(false);
    }
  }
}

function SchemaDetailModal({
  table,
  detail,
  error,
  busy,
  onClose,
}: {
  table: string;
  detail: SchemaTableDetail | null;
  error: string;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Detalle de esquema ${table}`}>
      <div className="fin-panel flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold">Detalle de esquema: {table}</h3>
          <button type="button" className="btn btn-sm" onClick={onClose} title="Cerrar detalle">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 overflow-auto rounded border">
          <table className="table table-xs table-pin-rows">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Campo</th>
                <th>Tipo origen</th>
                <th>Largo origen</th>
                <th>Decimales origen</th>
                <th>Tipo destino</th>
                <th>Largo destino</th>
                <th>Decimales destino</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {detail ? compareCatalogColumns(detail).map((column) => (
                <tr key={column.column}>
                  <td>{column.description || "—"}</td>
                  <td className="font-code">{column.column}</td>
                  <td className="font-code">{column.sourceType ?? "—"}</td>
                  <td className="font-code">{column.sourceLength ?? "—"}</td>
                  <td className="font-code">{column.sourceScale ?? "—"}</td>
                  <td className="font-code">{column.targetType ?? "—"}</td>
                  <td className="font-code">{column.targetLength ?? "—"}</td>
                  <td className="font-code">{column.targetScale ?? "—"}</td>
                  <td className={schemaStatusClass(column.status)}>{column.status}</td>
                </tr>
              )) : null}
              {busy ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center">Cargando detalle desde origen y destino…</td>
                </tr>
              ) : null}
              {error ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-red-700">{error}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WideDiffTable({
  title,
  keyColumns,
  labels,
  rows,
  compareValues = false,
}: {
  title: string;
  keyColumns: string[];
  labels: Map<string, string>;
  compareValues?: boolean;
  rows: Array<{
    key: RowValueMap;
    values: Record<string, { source: string; target: string }>;
  }>;
}) {
  const diffFields: string[] = [];
  for (const row of rows) {
    for (const field of Object.keys(row.values)) {
      if (!diffFields.some((name) => name.toUpperCase() === field.toUpperCase())) {
        diffFields.push(field);
      }
    }
  }

  return (
    <ResultTable
      title={title}
      hint={
        compareValues
          ? "Una fila por registro. Izquierda: clave. Derecha: campos con diferencia (arriba origen, abajo destino)."
          : "Una fila por registro. Izquierda: clave. Derecha: resto de campos."
      }
    >
      <thead>
        <tr>
          <th className="text-xs font-semibold">Clave</th>
          {diffFields.map((field) => (
            <th
              key={field}
              title={field}
              className="max-w-[11rem] whitespace-normal text-xs font-semibold"
            >
              {headerText(field, labels)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td className="font-code whitespace-pre-wrap">
              {keyColumns
                .map(
                  (column) =>
                    row.key[column] ??
                    row.key[column.toUpperCase()] ??
                    "",
                )
                .filter(Boolean)
                .join(" · ")}
            </td>
            {diffFields.map((field) => {
              const cell =
                row.values[field] ??
                row.values[field.toUpperCase()] ??
                Object.entries(row.values).find(
                  ([name]) => name.toUpperCase() === field.toUpperCase(),
                )?.[1];
              if (!cell) {
                return <td key={field} />;
              }
              if (!compareValues) {
                return (
                  <td key={field} className="font-code whitespace-pre-wrap">
                    {cell.source || cell.target}
                  </td>
                );
              }
              return (
                <td key={field} className="align-top">
                  <div className="font-code dc-origin whitespace-pre-wrap text-[11px]">
                    {cell.source}
                  </div>
                  <div className="font-code dc-target whitespace-pre-wrap text-[11px]">
                    {cell.target}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </ResultTable>
  );
}

function ResultTable({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {hint ? <p className="fin-muted mb-1 text-[11px]">{hint}</p> : null}
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">{children}</table>
      </div>
    </div>
  );
}

function headerText(field: string, labels: Map<string, string>): string {
  const description = labels.get(field.toUpperCase())?.trim();
  return description || field;
}

function pick(row: RowValueMap, columns: string[]): RowValueMap {
  const out: RowValueMap = {};
  for (const column of columns) {
    out[column] =
      row[column] ??
      row[column.toUpperCase()] ??
      Object.entries(row).find(([name]) => name.toUpperCase() === column.toUpperCase())?.[1] ??
      "";
  }
  return out;
}

function isKeyColumn(column: string, keyColumns: string[]): boolean {
  return keyColumns.some((key) => key.toUpperCase() === column.toUpperCase());
}

function schemaStatusClass(status: SchemaColumnStatus): string {
  return status === "Igual"
    ? "text-emerald-700"
    : status === "Tipo distinto"
      ? "text-amber-700"
      : "text-red-700";
}

function summarizeSchemaComparison(
  columns: SchemaColumnComparison[],
  tableDescriptions: Record<string, string>,
): Array<{
  name: string;
  description: string;
  integrity: number;
}> {
  const tables = new Map<string, SchemaColumnComparison[]>();
  for (const column of columns) {
    const current = tables.get(column.table) ?? [];
    current.push(column);
    tables.set(column.table, current);
  }
  return [...tables.entries()]
    .map(([name, tableColumns]) => ({
      name,
      description: tableDescriptions[name.toUpperCase()] ?? "",
      integrity: Math.round(
        (tableColumns.filter((column) => column.status === "Igual").length /
          tableColumns.length) *
          100,
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function compareCatalogColumns(
  detail: SchemaTableDetail,
): Array<SchemaColumnComparison & { description: string }> {
  const source = new Map(detail.source.columns.map((column) => [column.columnName.toUpperCase(), column]));
  const target = new Map(detail.target.columns.map((column) => [column.columnName.toUpperCase(), column]));
  return [...new Set([...source.keys(), ...target.keys()])]
    .sort()
    .map((name) => {
      const sourceColumn = source.get(name);
      const targetColumn = target.get(name);
      const sourceType = sourceColumn?.dataType ?? null;
      const targetType = targetColumn?.dataType ?? null;
      return {
        table: "",
        column: sourceColumn?.columnName ?? targetColumn?.columnName ?? name,
        sourceType,
        targetType,
        sourceLength: sourceColumn?.length ?? null,
        targetLength: targetColumn?.length ?? null,
        sourceScale: sourceColumn?.scale ?? null,
        targetScale: targetColumn?.scale ?? null,
        description: sourceColumn?.description.trim() || targetColumn?.description.trim() || "",
        status: sourceType === null
          ? "Solo destino"
          : targetType === null
            ? "Solo origen"
            : sourceType === targetType && sourceColumn?.length === targetColumn?.length && sourceColumn?.scale === targetColumn?.scale
              ? "Igual"
              : "Tipo distinto",
      } satisfies SchemaColumnComparison & { description: string };
    });
}

function columnMap(columns: ColumnInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const column of columns) {
    const name = column.columnName.trim().toUpperCase();
    if (name) {
      map.set(name, column.description.trim());
    }
  }
  return map;
}
