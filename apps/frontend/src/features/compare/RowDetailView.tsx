import { ArrowLeft, CircleAlert, Clipboard, FileCode2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RowChange, RowDelta, RowValueMap } from "@deltacore/shared";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
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
  sourceSchema?: string;
  targetSchema?: string;
};

const TITLES: Record<RowKind, string> = {
  changed: "Filas cambiadas",
  onlyInSource: "Filas solo en origen",
  onlyInTarget: "Filas solo en destino",
};

export function RowDetailView() {
  const navigate = useNavigate();
  const { notify } = useStatusNotification();
  const state = useLocation().state as RowDetailState | null;
  const [labels, setLabels] = useState<Record<string, string>>(state?.labels ?? {});
  const [tableDescription, setTableDescription] = useState(state?.tableDescription ?? "");
  const [sourceName, setSourceName] = useState(state?.sourceName ?? "");
  const [targetName, setTargetName] = useState(state?.targetName ?? "");
  const [showScript, setShowScript] = useState(false);
  const [targetSchema, setTargetSchema] = useState(state?.targetSchema ?? "");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState("");

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
          onGenerateScript={() => void openScript()}
        />
      ) : (
        <SingleSideRowsTable
          rows={rows as RowValueMap[]}
          columns={detailState.rowDelta.comparedColumns}
          labels={labelMap}
        />
      )}
      {showScript ? (
        <SqlScriptModal
          table={detailState.table ?? ""}
          targetSchema={targetSchema}
          rows={rows as RowChange[]}
          keyColumns={detailState.rowDelta.keyColumns}
          busy={scriptBusy}
          error={scriptError}
          onClose={() => setShowScript(false)}
        />
      ) : null}
    </section>
  );

  async function openScript() {
    setShowScript(true);
    setScriptError("");
    if (targetSchema) {
      return;
    }
    if (!detailState.targetDsn || !detailState.table) {
      setScriptError("No se pudo determinar el DSN o tabla de destino.");
      return;
    }
    setScriptBusy(true);
    try {
      const response = await apiClient.get<{ schema?: string }>("/catalog/describe", {
        params: { dsn: detailState.targetDsn, table: detailState.table },
      });
      const resolvedSchema = response.data.schema?.trim() ?? "";
      if (!resolvedSchema) {
        throw new Error("El catálogo de destino no devolvió el esquema de la tabla.");
      }
      setTargetSchema(resolvedSchema);
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
        (error instanceof Error ? error.message : "No se pudo resolver el esquema destino.");
      setScriptError(message);
      notify(message, "error");
    } finally {
      setScriptBusy(false);
    }
  }
}

function ChangedRowsTable({
  rows,
  delta,
  labels,
  sourceDsn,
  targetDsn,
  sourceName,
  targetName,
  onGenerateScript,
}: {
  rows: RowChange[];
  delta: RowDelta;
  labels: Map<string, string>;
  sourceDsn?: string;
  targetDsn?: string;
  sourceName?: string;
  targetName?: string;
  onGenerateScript: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="dc-origin font-semibold">Origen ({sourceDsn || "no disponible"}{sourceName ? ` · ${sourceName}` : ""}): primera línea</span>
          <span className="dc-target font-semibold">Destino ({targetDsn || "no disponible"}{targetName ? ` · ${targetName}` : ""}): segunda línea</span>
          <span className="flex items-center gap-1 font-semibold text-amber-800"><CircleAlert size={14} /> Campo con diferencia</span>
        </div>
        <button type="button" className="btn btn-sm" onClick={onGenerateScript} disabled={rows.length === 0} title="Generar UPDATE y rollback para el destino">
          <FileCode2 size={14} /> Generar SQL
        </button>
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

function SqlScriptModal({
  table,
  targetSchema,
  rows,
  keyColumns,
  busy,
  error,
  onClose,
}: {
  table: string;
  targetSchema: string;
  rows: RowChange[];
  keyColumns: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
}) {
  const applyScript = targetSchema
    ? buildUpdateScript(table, targetSchema, rows, keyColumns, "sourceRow")
    : "";
  const rollbackScript = targetSchema
    ? buildUpdateScript(table, targetSchema, rows, keyColumns, "targetRow")
    : "";

  async function copyScript(script: string) {
    await navigator.clipboard.writeText(script);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Scripts SQL de homologación">
      <div className="fin-panel flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Scripts SQL: {targetSchema}.{table}</h3>
            <p className="fin-muted text-xs">Actualización del destino desde el origen y rollback a los valores originales.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} title="Cerrar scripts"><X size={16} /></button>
        </div>
        {busy ? <p className="py-8 text-center text-sm">Resolviendo esquema destino...</p> : null}
        {error ? <p className="py-8 text-center text-sm text-red-700">{error}</p> : null}
        {targetSchema && !busy && !error ? (
          <div className="grid min-h-0 gap-3 lg:grid-cols-2">
            <ScriptPanel title="Homologar destino" script={applyScript} onCopy={() => void copyScript(applyScript)} />
            <ScriptPanel title="Rollback destino" script={rollbackScript} onCopy={() => void copyScript(rollbackScript)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScriptPanel({ title, script, onCopy }: { title: string; script: string; onCopy: () => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{title}</h4><button type="button" className="btn btn-xs" onClick={onCopy}><Clipboard size={13} /> Copiar</button></div>
      <textarea className="textarea textarea-bordered font-code min-h-64 w-full resize-none text-xs" value={script} readOnly />
    </div>
  );
}

function buildUpdateScript(
  table: string,
  targetSchema: string,
  rows: RowChange[],
  keyColumns: string[],
  values: "sourceRow" | "targetRow",
): string {
  const target = `${sqlIdentifier(targetSchema)}.${sqlIdentifier(table)}`;
  const statements = rows.map((row) => {
    const assignments = row.columns.map((column) =>
      `  ${sqlIdentifier(column.column)} = ${sqlLiteral(row[values][column.column] ?? "")}`,
    ).join(",\n");
    const where = keyColumns.map((column) =>
      `  ${sqlIdentifier(column)} = ${sqlLiteral(row.key[column] ?? "")}`,
    ).join("\n  AND ");
    return `UPDATE ${target}\nSET\n${assignments}\nWHERE\n${where};`;
  });
  return [`-- ${values === "sourceRow" ? "Homologar destino con origen" : "Rollback a valores originales de destino"}`, ...statements, "COMMIT;"].join("\n\n");
}

function sqlIdentifier(value: string): string {
  const identifier = value.trim().toUpperCase();
  if (!/^[A-Z0-9_@$#]+$/.test(identifier)) {
    throw new Error(`Identificador SQL no válido: ${value}`);
  }
  return identifier;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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