import type { ReactNode } from "react";
import type { JobResult, RowValueMap } from "@deltacore/shared";

export type ColumnInfo = {
  columnName: string;
  description: string;
  dataType?: string;
};

type Props = {
  result: JobResult;
  columns?: ColumnInfo[];
};

export function CompareResult({ result, columns = [] }: Props) {
  const labels = columnMap(columns);
  const tone =
    result.status === "SUCCESS"
      ? "badge-success"
      : result.status === "DIFFERENCE"
        ? "badge-warning"
        : "badge-error";
  const schemaEntries = Object.entries(result.schemaDelta ?? {});
  const samples = result.rowDelta?.samples;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${tone}`}>{result.status}</span>
        {result.table ? (
          <span className="font-code text-xs">
            {result.sourceSchema}.{result.table}
            {result.targetSchema ? ` → ${result.targetSchema}.${result.table}` : ""}
          </span>
        ) : null}
      </div>
      {result.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}

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

      {schemaEntries.length > 0 ? (
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
    </section>
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
