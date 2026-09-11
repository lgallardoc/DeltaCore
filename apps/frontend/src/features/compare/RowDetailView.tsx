import { ArrowLeft, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RowChange, RowDelta, RowValueMap } from "@deltacore/shared";
import { apiClient } from "../../auth/api.client";
import type { SmartBackState } from "../../navigation/smartBack";

type RowKind = "changed" | "onlyInSource" | "onlyInTarget";
type RowDetailState = SmartBackState & {
  kind: RowKind;
  rowDelta: RowDelta;
  labels?: Record<string, string>;
  table?: string;
  tableDescription?: string;
  sourceDsn?: string;
  targetDsn?: string;
  sourceName?: string;
  targetName?: string;
};

const TITLES: Record<RowKind, string> = {
  changed: "Filas cambiadas",
  onlyInSource: "Filas solo en origen",
  onlyInTarget: "Filas solo en destino",
};

export function RowDetailView() {
  const navigate = useNavigate();
  const state = useLocation().state as RowDetailState | null;
  const [labels, setLabels] = useState<Record<string, string>>(state?.labels ?? {});
  const [tableDescription, setTableDescription] = useState(state?.tableDescription ?? "");
  const [sourceName, setSourceName] = useState(state?.sourceName ?? "");
  const [targetName, setTargetName] = useState(state?.targetName ?? "");

  useEffect(() => {
    if (!state?.sourceDsn || !state.table) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      apiClient.get<{
        dictionaries?: Array<{
          table: string;
          tableDescription?: string;
          columns?: Array<{ columnName: string; description?: string }>;
        }>;
      }>("/dictionary", { params: { dsn: state.sourceDsn } }),
      apiClient.get<{ sources?: Array<{ dsn: string; name: string }> }>("/data-sources"),
    ]).then(([dictionaryResponse, sourcesResponse]) => {
      if (cancelled) {
        return;
      }
      const dictionary = dictionaryResponse.data.dictionaries?.find(
        (item) => item.table.toUpperCase() === state.table?.toUpperCase(),
      );
      if (dictionary) {
        setTableDescription(dictionary.tableDescription?.trim() ?? "");
        setLabels(
          Object.fromEntries(
            (dictionary.columns ?? []).map((column) => [
              column.columnName.toUpperCase(),
              column.description?.trim() ?? "",
            ]),
          ),
        );
      }
      const sources = sourcesResponse.data.sources ?? [];
      setSourceName(sources.find((source) => source.dsn === state.sourceDsn)?.name ?? "");
      setTargetName(sources.find((source) => source.dsn === state.targetDsn)?.name ?? "");
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state?.sourceDsn, state?.table, state?.targetDsn]);

  if (!state) {
    return (
      <section>
        <p>No hay un resultado de comparación para mostrar.</p>
      </section>
    );
  }

  const detailState = state;
  const rows = detailState.rowDelta.details[detailState.kind];
  const labelMap = new Map(Object.entries(labels));
  function returnToCompare() {
    navigate(detailState.from ?? "/compare", {
      state: detailState.compare
        ? ({ compare: detailState.compare } satisfies SmartBackState)
        : undefined,
    });
  }
  return (
    <section className="space-y-4">
      <button type="button" className="btn btn-sm" onClick={returnToCompare}>
        <ArrowLeft size={14} /> Volver
      </button>
      <div>
        <h2 className="text-2xl font-bold">{TITLES[detailState.kind]}</h2>
        <p className="font-code text-sm">{detailState.table || "Tabla no disponible"}</p>
        <p className="fin-muted text-sm">{tableDescription || "Sin descripción de tabla"}</p>
        <p className="fin-muted mt-1 text-sm">{rows.length} registros dentro del límite de comparación.</p>
      </div>
      {detailState.kind === "changed" ? (
        <ChangedRowsTable
          rows={rows as RowChange[]}
          delta={detailState.rowDelta}
          labels={labelMap}
          sourceDsn={detailState.sourceDsn}
          targetDsn={detailState.targetDsn}
          sourceName={sourceName}
          targetName={targetName}
        />
      ) : (
        <SingleSideRowsTable
          rows={rows as RowValueMap[]}
          columns={detailState.rowDelta.comparedColumns}
          labels={labelMap}
        />
      )}
    </section>
  );
}

function ChangedRowsTable({
  rows,
  delta,
  labels,
  sourceDsn,
  targetDsn,
  sourceName,
  targetName,
}: {
  rows: RowChange[];
  delta: RowDelta;
  labels: Map<string, string>;
  sourceDsn?: string;
  targetDsn?: string;
  sourceName?: string;
  targetName?: string;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="dc-origin font-semibold">Origen ({sourceDsn || "no disponible"}{sourceName ? ` · ${sourceName}` : ""}): primera línea</span>
        <span className="dc-target font-semibold">Destino ({targetDsn || "no disponible"}{targetName ? ` · ${targetName}` : ""}): segunda línea</span>
        <span className="flex items-center gap-1 font-semibold text-amber-800"><CircleAlert size={14} /> Campo con diferencia</span>
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-cols table-pin-rows">
        <thead>
          <tr>
            <th className="fin-table-sticky-key">Clave</th>
            {delta.comparedColumns.map((column) => (
              <ColumnHeader key={column} column={column} labels={labels} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const changed = new Set(row.columns.map((column) => column.column.toUpperCase()));
            return (
              <tr key={index}>
                <td className="fin-table-sticky-key font-code whitespace-pre-wrap">{keyText(row.key, delta.keyColumns)}</td>
                {delta.comparedColumns.map((column) => {
                  const isChanged = changed.has(column.toUpperCase());
                  return (
                    <td key={column} className={isChanged ? "bg-amber-100" : ""}>
                      {isChanged ? <CircleAlert className="mb-1 text-amber-800" size={14} aria-label="Campo con diferencia" /> : null}
                      <div className="font-code dc-origin whitespace-pre-wrap text-[11px]">{row.sourceRow[column] ?? ""}</div>
                      <div className="font-code dc-target whitespace-pre-wrap text-[11px]">{row.targetRow[column] ?? ""}</div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}

function SingleSideRowsTable({
  rows,
  columns,
  labels,
}: {
  rows: RowValueMap[];
  columns: string[];
  labels: Map<string, string>;
}) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border">
      <table className="table table-xs table-pin-rows">
        <thead><tr>{columns.map((column) => <ColumnHeader key={column} column={column} labels={labels} />)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{columns.map((column) => <td key={column} className="font-code whitespace-pre-wrap">{row[column] ?? ""}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function keyText(row: RowValueMap, columns: string[]): string {
  return columns.map((column) => row[column] ?? "").filter(Boolean).join(" · ");
}

function ColumnHeader({ column, labels }: { column: string; labels: Map<string, string> }) {
  const description = labels.get(column.toUpperCase())?.trim();
  return (
    <th title={description ? `${column}: ${description}` : column}>
      <div className="font-code">{column}</div>
      {description ? <div className="mt-0.5 whitespace-normal text-[10px] font-normal">{description}</div> : null}
    </th>
  );
}