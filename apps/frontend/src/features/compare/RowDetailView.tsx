import { ArrowLeft, CircleAlert, Clipboard, Download, Eye, FileCode2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RowChange, RowDelta, RowValueMap } from "@deltacore/shared";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import { usePermissions } from "../../auth/usePermissions";
import type { SmartBackState } from "../../navigation/smartBack";

type RowKind = "changed" | "onlyInSource" | "onlyInTarget";
type ScriptRow = { kind: RowKind; row: RowChange | RowValueMap };
type FlagDefinition = { flagNumber: number; description: string; validValues: string };
type RowDetailState = SmartBackState & {
  kind: RowKind;
  rowDelta: RowDelta;
  labels?: Record<string, string>;
  flagColumns?: string[];
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
  const { canRun } = usePermissions("COMPARE");
  const state = useLocation().state as RowDetailState | null;
  const [labels, setLabels] = useState<Record<string, string>>(state?.labels ?? {});
  const [flagDefinitions, setFlagDefinitions] = useState<Record<string, FlagDefinition[]>>({});
  const [flaggedColumns, setFlaggedColumns] = useState<string[]>(state?.flagColumns ?? []);
  const [flagSourceRowCount, setFlagSourceRowCount] = useState<number | null>(null);
  const [tableDescription, setTableDescription] = useState(state?.tableDescription ?? "");
  const [sourceName, setSourceName] = useState(state?.sourceName ?? "");
  const [targetName, setTargetName] = useState(state?.targetName ?? "");
  const [showScript, setShowScript] = useState(false);
  const [scriptRows, setScriptRows] = useState<ScriptRow[]>([]);
  const [targetSchema, setTargetSchema] = useState(state?.targetSchema ?? "");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState("");

  useEffect(() => {
    setFlagDefinitions({});
    setFlagSourceRowCount(null);
    setFlaggedColumns(state?.flagColumns ?? []);
    if (!state?.table) {
      return;
    }
    let cancelled = false;
    const knownFlagged = (state.flagColumns ?? []).map((column) => column.toUpperCase());
    const loadFlagDefinitions = (columns: string[]) => {
      if (columns.length === 0) {
        return;
      }
      void apiClient.get<{ definitions?: FlagDefinition[]; rowCount?: number }>("/dictionary/flags", {
        params: { table: state.table },
      })
        .then(({ data }) => {
          if (!cancelled) {
            const definitions = data.definitions ?? [];
            setFlagSourceRowCount(data.rowCount ?? null);
            setFlagDefinitions(Object.fromEntries(columns.map((column) => [column, definitions])));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFlagDefinitions({});
          }
        });
    };
    if (knownFlagged.length > 0) {
      loadFlagDefinitions(knownFlagged);
    }
    if (state.sourceDsn) {
      void apiClient.get<{
      tableDescription?: string;
      columns?: Array<{ columnName: string; description?: string; isFlag?: boolean }>;
    }>("/dictionary", {
      params: {
        dsn: state.sourceDsn,
        table: state.table,
        ...(state.sourceSchema ? { schema: state.sourceSchema } : {}),
      },
    })
      .then(async (dictionaryResponse) => {
        if (cancelled) {
          return;
        }
        const dictionary = dictionaryResponse.data;
        if (dictionary) {
          const discoveredFlags = (dictionary.columns ?? [])
            .filter((column) => column.isFlag)
            .map((column) => column.columnName.toUpperCase());
          if (knownFlagged.length === 0) {
            setFlaggedColumns(discoveredFlags);
            loadFlagDefinitions(discoveredFlags);
          }
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
      })
        .catch(() => undefined);
    }
    void apiClient.get<{ sources?: Array<{ dsn: string; name: string }> }>("/data-sources")
      .then(({ data }) => {
        if (cancelled) {
          return;
        }
        const sources = data.sources ?? [];
        setSourceName(sources.find((source) => source.dsn === state.sourceDsn)?.name ?? "");
        setTargetName(sources.find((source) => source.dsn === state.targetDsn)?.name ?? "");
      })
      .catch(() => undefined);
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
      <button id="btnView_rows_back" type="button" className="btn btn-sm" onClick={returnToCompare}>
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
          flagDefinitions={flagDefinitions}
          flaggedColumns={flaggedColumns}
          flagSourceRowCount={flagSourceRowCount}
          sourceDsn={detailState.sourceDsn}
          targetDsn={detailState.targetDsn}
          sourceName={sourceName}
          targetName={targetName}
          onGenerateScript={(visibleRows) => void openScript("changed", visibleRows)}
          canRun={canRun && detailState.rowDelta.keyColumns.length > 0}
        />
      ) : (
        <SingleSideRowsTable
          rows={rows as RowValueMap[]}
          columns={detailState.rowDelta.comparedColumns}
          labels={labelMap}
          canRun={canRun && detailState.rowDelta.keyColumns.length > 0}
          onGenerateScript={(visibleRows) => void openScript(detailState.kind, visibleRows)}
        />
      )}
      {showScript ? (
        <SqlScriptModal
          table={detailState.table ?? ""}
          targetSchema={targetSchema}
          rows={scriptRows}
          keyColumns={detailState.rowDelta.keyColumns}
          busy={scriptBusy}
          error={scriptError}
          onClose={() => setShowScript(false)}
        />
      ) : null}
    </section>
  );

  async function openScript(kind: RowKind, visibleRows: Array<RowChange | RowValueMap>) {
    setScriptRows(visibleRows.map((row) => ({ kind, row })));
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

const KEY_COLUMN_WIDTH = 140;

function ChangedRowsTable({
  rows,
  delta,
  labels,
  flagDefinitions,
  flaggedColumns,
  flagSourceRowCount,
  sourceDsn,
  targetDsn,
  sourceName,
  targetName,
  onGenerateScript,
  canRun,
}: {
  rows: RowChange[];
  delta: RowDelta;
  labels: Map<string, string>;
  flagDefinitions: Record<string, FlagDefinition[]>;
  flaggedColumns: string[];
  flagSourceRowCount: number | null;
  sourceDsn?: string;
  targetDsn?: string;
  sourceName?: string;
  targetName?: string;
  onGenerateScript: (visibleRows: RowChange[]) => void;
  canRun: boolean;
}) {
  // Key columns (dictionary PK order) are pinned to the left; the rest follow in their original order.
  const [keyFilters, setKeyFilters] = useState<Record<string, string>>({});
  const keySet = new Set(delta.keyColumns.map((column) => column.toUpperCase()));
  const restColumns = delta.comparedColumns.filter((column) => !keySet.has(column.toUpperCase()));
  const filteredRows = rows.filter((row) => delta.keyColumns.every((column) => {
    const filter = keyFilters[column]?.trim().toLocaleLowerCase();
    return !filter || (row.key[column] ?? "").toLocaleLowerCase().includes(filter);
  }));
  const flagColumns = delta.comparedColumns.filter(
    (column) => flaggedColumns.includes(column.toUpperCase()),
  );
  const [flagRow, setFlagRow] = useState<RowChange | null>(null);
  const hasActiveFilters = delta.keyColumns.some((column) => keyFilters[column]?.trim());
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="dc-origin font-semibold">Origen ({sourceDsn || "no disponible"}{sourceName ? ` · ${sourceName}` : ""}): primera línea</span>
          <span className="dc-target font-semibold">Destino ({targetDsn || "no disponible"}{targetName ? ` · ${targetName}` : ""}): segunda línea</span>
          <span className="flex items-center gap-1 font-semibold text-amber-800"><CircleAlert size={14} /> Campo con diferencia</span>
        </div>
        <button id="btnSave_rows_sql" type="button" className="btn btn-sm" onClick={() => onGenerateScript(filteredRows)} disabled={!canRun || filteredRows.length === 0} title="Generar UPDATE y rollback para las filas visibles">
          <FileCode2 size={14} /> Generar SQL
        </button>
      </div>
      {delta.keyColumns.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          {delta.keyColumns.map((column) => (
            <label key={column} className="fin-field min-w-40 max-w-xs flex-1">
              <span>Filtrar {column}</span>
              <input
                type="search"
                className="input input-bordered input-sm w-full"
                value={keyFilters[column] ?? ""}
                placeholder="Valor de PrimaryKey"
                aria-label={`Filtrar por ${column}`}
                onChange={(event) => setKeyFilters((current) => ({ ...current, [column]: event.target.value }))}
              />
            </label>
          ))}
          <span className="fin-muted pb-2 text-xs" aria-live="polite">
            {filteredRows.length} de {rows.length} filas
          </span>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKeyFilters({})}>
              <X size={14} /> Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="max-h-[32rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
        <thead>
          <tr>
            {delta.keyColumns.map((column, index) => (
              <ColumnHeader
                key={column}
                column={column}
                labels={labels}
                className="fin-table-sticky-col fin-table-key-col"
                style={{ "--sticky-left": `${index * KEY_COLUMN_WIDTH}px`, minWidth: KEY_COLUMN_WIDTH, width: KEY_COLUMN_WIDTH } as CSSProperties}
              />
            ))}
            {restColumns.map((column) => (
              <ColumnHeader key={column} column={column} labels={labels} />
            ))}
            {flagColumns.length > 0 ? <th>Parseo</th> : null}
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row, index) => {
            const changed = new Set(row.columns.map((column) => column.column.toUpperCase()));
            return (
              <tr key={index}>
                {delta.keyColumns.map((column, colIndex) => (
                  <td
                    key={column}
                    className="fin-table-sticky-col fin-table-key-col font-code whitespace-pre-wrap"
                    style={{ "--sticky-left": `${colIndex * KEY_COLUMN_WIDTH}px`, minWidth: KEY_COLUMN_WIDTH, width: KEY_COLUMN_WIDTH } as CSSProperties}
                  >
                    <div className="dc-origin whitespace-pre-wrap text-[11px]">{row.sourceRow[column] ?? ""}</div>
                    <div className="dc-target whitespace-pre-wrap text-[11px]">{row.targetRow[column] ?? ""}</div>
                  </td>
                ))}
                {restColumns.map((column) => {
                  const isChanged = changed.has(column.toUpperCase());
                  return (
                    <td key={column} className={isChanged ? "bg-amber-100" : ""}>
                      {isChanged ? <CircleAlert className="mb-1 text-amber-800" size={14} aria-label="Campo con diferencia" /> : null}
                      <div className="font-code dc-origin whitespace-pre-wrap text-[11px]">{row.sourceRow[column] ?? ""}</div>
                      <div className="font-code dc-target whitespace-pre-wrap text-[11px]">{row.targetRow[column] ?? ""}</div>
                    </td>
                  );
                })}
                {flagColumns.length > 0 ? (
                  <td>
                    <button
                      type="button"
                      className="btn btn-xs"
                      aria-label={`Parsear FLAG de ${delta.keyColumns.map((column) => row.key[column] ?? "").join(" ")}`}
                      title="Parsear valores FLAG de esta fila"
                      onClick={() => setFlagRow(row)}
                    >
                      <Eye size={13} /> Parsear
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={delta.comparedColumns.length + (flagColumns.length > 0 ? 1 : 0)} className="py-6 text-center fin-muted">
                No hay filas que coincidan con los valores de PrimaryKey.
              </td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </div>
      {flagRow ? (
        <FlagParseModal
          row={flagRow}
          keyColumns={delta.keyColumns}
          flagColumns={flagColumns}
          flagDefinitions={flagDefinitions}
          sourceRowCount={flagSourceRowCount}
          onClose={() => setFlagRow(null)}
        />
      ) : null}
    </>
  );
}

function FlagParseModal({
  row,
  keyColumns,
  flagColumns,
  flagDefinitions,
  sourceRowCount,
  onClose,
}: {
  row: RowChange;
  keyColumns: string[];
  flagColumns: string[];
  flagDefinitions: Record<string, FlagDefinition[]>;
  sourceRowCount: number | null;
  onClose: () => void;
}) {
  const definitionEntries = flagColumns.flatMap((column) =>
    (flagDefinitions[column.toUpperCase()] ?? []).map((definition) => ({ column, definition })),
  );
  const entries = flagColumns.flatMap((column) => {
    const source = row.sourceRow[column] ?? "";
    const target = row.targetRow[column] ?? "";
    const definitions = new Map(
      (flagDefinitions[column.toUpperCase()] ?? []).map((definition) => [definition.flagNumber, definition]),
    );
    const positions = Math.max(Array.from(source).length, Array.from(target).length, ...definitions.keys());
    return Array.from({ length: positions }, (_, index) => {
      const flagNumber = index + 1;
      const definition = definitions.get(flagNumber);
      const sourceValue = flagCharacter(source, flagNumber);
      const targetValue = flagCharacter(target, flagNumber);
      return {
        column,
        flagNumber,
        description: definition?.description ?? "Definición AZUFD no disponible",
        validValues: definition?.validValues ?? "",
        sourceValue,
        targetValue,
      };
    }).filter((entry) => definitions.has(entry.flagNumber) || entry.sourceValue !== "—" || entry.targetValue !== "—");
  });
  const [showDifferencesOnly, setShowDifferencesOnly] = useState(false);
  const differingEntries = entries.filter((entry) => entry.sourceValue !== entry.targetValue);
  const visibleEntries = showDifferencesOnly ? differingEntries : entries;
  return createPortal((
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Parseo de campos FLAG">
      <div className="fin-panel flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Parseo de campos FLAG</h3>
            <p className="fin-muted text-xs">{keyColumns.map((column) => `${column}=${row.key[column] ?? ""}`).join(" · ")}</p>
          </div>
          <button id="btnView_rows_flags_close" type="button" className="btn btn-sm" onClick={onClose} title="Cerrar parseo FLAG"><X size={16} /></button>
        </div>
        {definitionEntries.length === 0 ? (
          <p role="status" className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {sourceRowCount === null
              ? "No se pudo consultar AZUFD. Se muestran las posiciones no vacías de esta fila sin descripción."
              : sourceRowCount === 0
                ? "La consulta a AZUFD no devolvió filas para esta tabla. Se muestran las posiciones no vacías de esta fila sin descripción."
                : `AZUFD devolvió ${sourceRowCount} fila(s), pero no se pudieron interpretar sus números de flag entre 1 y 128. Se muestran las posiciones no vacías de esta fila sin descripción.`}
          </p>
        ) : null}
        <div className="mb-2 flex justify-end">
          <div className="join" role="group" aria-label="Filtrar campos FLAG">
            <button
              type="button"
              className={`btn btn-sm join-item ${!showDifferencesOnly ? "fin-btn-primary" : ""}`}
              aria-pressed={!showDifferencesOnly}
              onClick={() => setShowDifferencesOnly(false)}
            >
              Todos ({entries.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm join-item ${showDifferencesOnly ? "fin-btn-primary" : ""}`}
              aria-pressed={showDifferencesOnly}
              onClick={() => setShowDifferencesOnly(true)}
            >
              Solo diferencias ({differingEntries.length})
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto rounded-lg border">
          <table className="table table-sm table-pin-rows">
            <thead>
              <tr>
                <th>Número</th>
                <th className="dc-origin">Valor origen</th>
                <th>Descripción / valores válidos</th>
                <th className="dc-target">Valor destino</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map(({ column, flagNumber, description, validValues, sourceValue, targetValue }) => {
                const valuesDiffer = sourceValue !== targetValue;
                return (
                  <tr key={`${column}-${flagNumber}`} className={valuesDiffer ? "bg-amber-100" : ""}>
                    <td className="font-code">
                      <span
                        className={`inline-flex items-center gap-1 ${valuesDiffer ? "font-semibold text-amber-800" : ""}`}
                        title={valuesDiffer ? "Valor distinto entre origen y destino" : undefined}
                      >
                        {String(flagNumber).padStart(3, "0")}
                        {valuesDiffer ? <CircleAlert size={14} aria-label="Valor distinto entre origen y destino" /> : null}
                      </span>
                    </td>
                    <td className="font-code">
                      <div>{sourceValue}</div>
                    </td>
                    <td>
                      <div>{description}</div>
                      {validValues ? <div className="fin-muted whitespace-pre-wrap text-xs">{validValues}</div> : null}
                    </td>
                    <td className="font-code">
                      <div>{targetValue}</div>
                    </td>
                  </tr>
                );
              })}
              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center fin-muted">
                    {showDifferencesOnly ? "No hay flags con diferencias entre origen y destino." : "No hay posiciones FLAG con valor."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ), document.body);
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
  rows: ScriptRow[];
  keyColumns: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
}) {
  const applyScript = targetSchema
    ? buildRowScript(table, targetSchema, rows, keyColumns, "apply")
    : "";
  const rollbackScript = targetSchema
    ? buildRowScript(table, targetSchema, rows, keyColumns, "rollback")
    : "";

  async function copyScript(script: string) {
    await navigator.clipboard.writeText(script);
  }

  function downloadScripts() {
    const content = [
      "-- DeltaCore: homologacion y rollback",
      `-- Tabla destino: ${targetSchema}.${table}`,
      "-- Revise ambas secciones antes de ejecutar. Ejecute solo HOMOLOGACION o ROLLBACK, nunca ambas consecutivamente.",
      "-- El rollback restaura los valores originales del destino para las filas incluidas.",
      "",
      "-- ============================================================",
      "-- HOMOLOGACION: actualiza el destino con los valores de origen",
      "-- ============================================================",
      applyScript,
      "",
      "-- ============================================================",
      "-- ROLLBACK: restaura los valores originales del destino",
      "-- Ejecutar solo si se requiere revertir la homologacion.",
      "-- ============================================================",
      rollbackScript,
    ].join("\n");
    const blob = new Blob([content], { type: "application/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${table.replace(/[^A-Za-z0-9_-]/g, "_")}_homologacion_rollback.sql`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Scripts SQL de homologación">
      <div className="fin-panel flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Scripts SQL: {targetSchema}.{table}</h3>
            <p className="fin-muted text-xs">Actualización del destino desde el origen y rollback a los valores originales.</p>
          </div>
          <button id="btnView_rows_close" type="button" className="btn btn-sm" onClick={onClose} title="Cerrar scripts"><X size={16} /></button>
        </div>
        <div role="note" className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Advertencia:</strong> La ejecución de la homologación queda sujeta al criterio del responsable de realizarla, quien deberá verificar los riesgos asociados y tomar las precauciones correspondientes, especialmente ante certificaciones o pruebas que se encuentren en ejecución.
        </div>
        {targetSchema && !busy && !error ? (
          <div className="mb-3 flex justify-end">
            <button id="btnSave_rows_sql_download" type="button" className="btn btn-sm" onClick={downloadScripts}>
              <Download size={14} /> Descargar .sql
            </button>
          </div>
        ) : null}
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
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{title}</h4><button id="btnSave_rows_copy" type="button" className="btn btn-xs" onClick={onCopy}><Clipboard size={13} /> Copiar</button></div>
      <textarea className="textarea textarea-bordered font-code min-h-64 w-full resize-none text-xs" value={script} readOnly />
    </div>
  );
}

function buildRowScript(
  table: string,
  targetSchema: string,
  rows: ScriptRow[],
  keyColumns: string[],
  action: "apply" | "rollback",
): string {
  const target = `${sqlIdentifier(targetSchema)}.${sqlIdentifier(table)}`;
  const statements = rows.map(({ kind, row: data }) => {
    if (kind === "changed") {
      const row = data as RowChange;
      const values = action === "apply" ? row.sourceRow : row.targetRow;
      const assignments = row.columns.map((column) =>
        `  ${sqlIdentifier(column.column)} = ${sqlLiteral(values[column.column] ?? "")}`,
      ).join(",\n");
      const where = keyColumns.map((column) =>
        `  ${sqlIdentifier(column)} = ${sqlLiteral(row.key[column] ?? "")}`,
      ).join("\n  AND ");
      return `UPDATE ${target}\nSET\n${assignments}\nWHERE\n${where};`;
    }

    const sourceOnly = kind === "onlyInSource";
    const insert = (action === "apply") === sourceOnly;
    const values = data as RowValueMap;
    if (insert) {
      const columns = Object.keys(values);
      return `INSERT INTO ${target} (${columns.map(sqlIdentifier).join(", ")})\nVALUES (${columns.map((column) => sqlLiteral(values[column] ?? "")).join(", ")});`;
    }
    const where = keyColumns.map((column) =>
      `  ${sqlIdentifier(column)} = ${sqlLiteral(values[column] ?? "")}`,
    ).join("\n  AND ");
    return `DELETE FROM ${target}\nWHERE\n${where};`;
  });
  const title = action === "apply" ? "Homologar destino con origen" : "Rollback a valores originales de destino";
  return [`-- ${title}`, ...statements, "COMMIT;"].join("\n\n");
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
  canRun,
  onGenerateScript,
}: {
  rows: RowValueMap[];
  columns: string[];
  labels: Map<string, string>;
  canRun: boolean;
  onGenerateScript: (visibleRows: RowValueMap[]) => void;
}) {
  return (
    <>
    <div className="flex justify-end">
      <button id="btnSave_rows_sql" type="button" className="btn btn-sm" onClick={() => onGenerateScript(rows)} disabled={!canRun || rows.length === 0} title="Generar SQL y rollback para las filas visibles">
        <FileCode2 size={14} /> Generar SQL
      </button>
    </div>
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
    </>
  );
}

function flagCharacter(value: string, flagNumber: number): string {
  const character = Array.from(value)[flagNumber - 1];
  return character?.trim() ? character : "—";
}

function ColumnHeader({
  column,
  labels,
  className,
  style,
}: {
  column: string;
  labels: Map<string, string>;
  className?: string;
  style?: CSSProperties;
}) {
  const description = labels.get(column.toUpperCase())?.trim();
  return (
    <th className={className} style={style} title={description ? `${column}: ${description}` : column}>
      <div className="font-code">{column}</div>
      {description ? <div className="mt-0.5 whitespace-normal text-[10px] font-normal">{description}</div> : null}
    </th>
  );
}