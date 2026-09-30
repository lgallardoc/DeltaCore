import { useEffect, useMemo, useState } from "react";
import type { JobResult } from "@deltacore/shared";
import { ChevronLeft, ChevronRight, Play, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import { usePermissions } from "../../auth/usePermissions";
import { CompareResult, type ColumnInfo } from "./CompareResult";
import { formatNumber } from "../../utils/format";
import type { SmartBackState } from "../../navigation/smartBack";

type Mode = "schema" | "volume" | "row";
type DataSource = { id: string; dsn: string; name: string; engine: string; searchPath: string[] };
type DictionarySummary = {
  schema: string;
  table: string;
  tableDescription?: string;
  columns?: Array<ColumnInfo & { isFlag?: boolean }>;
  keyColumns?: string[];
};

export type SchemaTableDetail = {
  source: { schema: string; columns: Array<ColumnInfo & { length?: string; scale?: string }> };
  target: { schema: string; columns: Array<ColumnInfo & { length?: string; scale?: string }> };
};

type CompareSession = {
  mode: Mode;
  sourceDsn: string;
  targetDsn: string;
  limit: string;
  selectedTables: string[];
  results: JobResult[];
  tableFilter?: string;
  tablePage?: number;
  tablePageSize?: number;
};

export function CompareView() {
  const location = useLocation();
  const restored = (location.state as SmartBackState | null)?.compare as CompareSession | undefined;
  const { notify } = useStatusNotification();
  const { canRun } = usePermissions("COMPARE");
  const [sources, setSources] = useState<DataSource[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionarySummary[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>(restored?.selectedTables ?? []);
  const [tableFilter, setTableFilter] = useState(restored?.tableFilter ?? "");
  const [tablePage, setTablePage] = useState(restored?.tablePage ?? 1);
  const [tablePageSize, setTablePageSize] = useState(restored?.tablePageSize ?? 10);
  const [mode, setMode] = useState<Mode>(restored?.mode ?? "row");
  const [sourceDsn, setSourceDsn] = useState(restored?.sourceDsn ?? "");
  const [targetDsn, setTargetDsn] = useState(restored?.targetDsn ?? "");
  const [limit, setLimit] = useState(restored?.limit ?? "10000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<JobResult[]>(restored?.results ?? []);
  const [tableDescriptions, setTableDescriptions] = useState<Record<string, string>>({});
  const [comparisonProgress, setComparisonProgress] = useState<{
    completed: number;
    total: number;
    table: string;
  } | null>(null);

  useEffect(() => {
    if (error) {
      notify(error, "error");
    }
  }, [error, notify]);

  useEffect(() => {
    void apiClient
      .get<{ sources: DataSource[] }>("/data-sources")
      .then((response) => setSources(response.data.sources))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!sourceDsn.trim()) {
      setDictionaries([]);
      setSelectedTables([]);
      setTableDescriptions({});
      return;
    }
    let cancelled = false;
    void apiClient
      .get<{ dictionaries?: DictionarySummary[] }>("/dictionary", {
        params: {},
      })
      .then((sourceResponse) => {
        if (cancelled) {
          return;
        }
        const next = sourceResponse.data.dictionaries ?? [];
        setDictionaries(next);
        setSelectedTables((current) => current.filter((table) =>
          next.some((dictionary) => dictionary.table === table),
        ));
        setTableDescriptions(
          Object.fromEntries(
            next.map((dictionary) => [
              dictionary.table.toUpperCase(),
              dictionary.tableDescription?.trim() ?? "",
            ]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setDictionaries([]);
          setSelectedTables([]);
          setTableDescriptions({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceDsn, sources]);

  const sourceMeta = useMemo(
    () => sources.find((item) => item.name === sourceDsn),
    [sources, sourceDsn],
  );
  const targetMeta = useMemo(
    () => sources.find((item) => item.name === targetDsn),
    [sources, targetDsn],
  );
  const orderedDictionaries = [...dictionaries].sort((left, right) => {
    const leftSelected = selectedTables.includes(left.table);
    const rightSelected = selectedTables.includes(right.table);
    if (leftSelected !== rightSelected) {
      return leftSelected ? -1 : 1;
    }
    return left.table.localeCompare(right.table);
  });
  const normalizedTableFilter = tableFilter.trim().toLocaleLowerCase();
  const filteredDictionaries = orderedDictionaries.filter((dictionary) =>
    !normalizedTableFilter || [
      dictionary.schema,
      dictionary.table,
      dictionary.tableDescription ?? "",
      ...(dictionary.keyColumns ?? []),
    ].join(" ").toLocaleLowerCase().includes(normalizedTableFilter),
  );
  const tablePageCount = Math.max(1, Math.ceil(filteredDictionaries.length / tablePageSize));
  const currentTablePage = Math.min(tablePage, tablePageCount);
  const visibleDictionaries = filteredDictionaries.slice(
    (currentTablePage - 1) * tablePageSize,
    currentTablePage * tablePageSize,
  );
  const compareSession: CompareSession = {
    mode,
    sourceDsn,
    targetDsn,
    limit,
    selectedTables,
    results,
    tableFilter,
    tablePage,
    tablePageSize,
  };

  async function run() {
    if (!canRun || !sourceDsn.trim() || !targetDsn.trim()) return;
    setBusy(true);
    setError("");
    setResults([]);
    setComparisonProgress(null);
    try {
      const selected = dictionaries.filter((dictionary) => selectedTables.includes(dictionary.table));
      if (selected.length === 0) {
        throw new Error("Seleccione al menos una tabla del diccionario local.");
      }
      let comparisons: JobResult[];
      if (mode === "schema") {
        comparisons = [await runSchemaComparison(selected.map((dictionary) => dictionary.table))];
      } else {
        comparisons = [];
        for (const [index, dictionary] of selected.entries()) {
          setComparisonProgress({
            completed: index,
            total: selected.length,
            table: dictionary.table,
          });
          const response = await apiClient.post<JobResult>(
            mode === "volume" ? "/jobs/ui/volume-compare" : "/jobs/ui/row-compare",
            mode === "volume" ? {
              sourceName: sourceDsn,
              targetName: targetDsn,
              table: dictionary.table,
              sourceSchema: sourceMeta?.searchPath.join(","),
              targetSchema: targetMeta?.searchPath.join(","),
            } : {
              sourceName: sourceDsn,
              targetName: targetDsn,
              table: dictionary.table,
              sourceSchema: sourceMeta?.searchPath.join(","),
              targetSchema: targetMeta?.searchPath.join(","),
              keyColumns: dictionary.keyColumns ?? [],
              limit: Number(limit) || undefined,
            },
          );
          comparisons.push(response.data);
          setComparisonProgress({
            completed: index + 1,
            total: selected.length,
            table: dictionary.table,
          });
        }
      }
        const failed = comparisons.find((comparison) => comparison.status === "ERROR" || comparison.error);
        if (failed) {
          setError(failed.error ?? "La comparación no pudo completarse.");
          return;
        }
        if (comparisons.every((comparison) => comparison.status === "SUCCESS")) {
          notify(
            mode === "schema"
              ? "Comparación de esquema finalizada sin diferencias."
              : "Comparación finalizada correctamente.",
            "success",
          );
        } else {
          notify("Comparación finalizada con diferencias.", "warning");
        }
        setResults(comparisons);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        (err instanceof Error ? err.message : "Error al comparar");
      setError(message);
      setResults([]);
    } finally {
      setBusy(false);
      setComparisonProgress(null);
    }
  }

  async function runSchemaComparison(tables: string[]): Promise<JobResult> {
    const schemaComparison: NonNullable<JobResult["schemaComparison"]> = [];
    const schemaDelta: NonNullable<JobResult["schemaDelta"]> = {};
    let jobId = "";
    for (const [index, tableName] of tables.entries()) {
      setComparisonProgress({ completed: index, total: tables.length, table: tableName });
      const response = await apiClient.post<JobResult>("/jobs/ui/schema-compare", {
        sourceName: sourceDsn,
        targetName: targetDsn,
        tables: [tableName],
      });
      const tableResult = response.data;
      if (tableResult.status === "ERROR" || tableResult.error) {
        throw new Error(
          `${tableName}: ${tableResult.error ?? "La comparación de esquema no pudo completarse."}`,
        );
      }
      jobId = tableResult.jobId;
      schemaComparison.push(...(tableResult.schemaComparison ?? []));
      Object.assign(
        schemaDelta,
        Object.fromEntries(
          Object.entries(tableResult.schemaDelta ?? {}).map(([column, delta]) => [
            `${tableName}.${column}`,
            delta,
          ]),
        ),
      );
      setComparisonProgress({ completed: index + 1, total: tables.length, table: tableName });
    }
    await loadSchemaTableDescriptions(tables);
    return {
      jobId,
      status: schemaComparison.some((column) => column.status !== "Igual")
        ? "DIFFERENCE"
        : "SUCCESS",
      schemaDelta,
      schemaComparison,
    };
  }

  async function loadSchemaTableDescriptions(tables: string[]) {
    const response = await apiClient.get<{ dictionaries?: DictionarySummary[] }>("/dictionary", {
      params: { sourceName: sourceDsn },
    });
    const localDescriptions = new Map(
      (response.data.dictionaries ?? []).map((dictionary) => [
        dictionary.table.toUpperCase(),
        dictionary.tableDescription?.trim() ?? "",
      ]),
    );
    const descriptions = Object.fromEntries(
      tables.map((tableName) => [tableName.toUpperCase(), localDescriptions.get(tableName.toUpperCase()) ?? ""]),
    ) as Record<string, string>;
    await Promise.all(
      tables
        .filter((tableName) => !descriptions[tableName.toUpperCase()])
        .map(async (tableName) => {
          const catalog = await apiClient.get<{ tableDescription?: string }>("/catalog/describe", {
            params: { sourceName: sourceDsn, table: tableName },
          });
          descriptions[tableName.toUpperCase()] = catalog.data.tableDescription?.trim() ?? "";
        }),
    );
    setTableDescriptions(descriptions);
  }

  async function loadSchemaTableDetail(tableName: string): Promise<SchemaTableDetail> {
    const [source, target] = await Promise.all([
      apiClient.get<SchemaTableDetail["source"]>("/catalog/describe", {
        params: { sourceName: sourceDsn, table: tableName },
      }),
      apiClient.get<SchemaTableDetail["target"]>("/catalog/describe", {
        params: { sourceName: targetDsn, table: tableName },
      }),
    ]);
    return { source: source.data, target: target.data };
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold">Comparar entornos</h2>
        <p className="fin-muted max-w-2xl text-sm">
          Mismas opciones que el CLI: schema (columnas), volume (COUNT) y fila a fila con
          clave compuesta separada por comas.
        </p>
      </div>

      <div className="fin-tabs">
        {(
          [
            ["schema", "Schema"],
            ["volume", "Volumen"],
            ["row", "Fila a fila"],
          ] as const
        ).map(([value, label]) => (
          <button
            id={`btnView_compare_${value}`}
            key={value}
            type="button"
            className={["tab", mode === value ? "tab-active" : ""].join(" ")}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="fin-field">
          <span>DSN origen (--source)</span>
          <select
            className="select select-bordered select-sm"
            value={sourceDsn}
            onChange={(event) => setSourceDsn(event.target.value)}
          >
            <option value="">Seleccione DSN origen</option>
            {!sourceMeta ? <option value={sourceDsn}>{sourceDsn} (no persistido)</option> : null}
            {sources.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name} · {item.dsn}
              </option>
            ))}
          </select>
          {sourceMeta ? (
            <span className="font-normal">*LIBL*: {sourceMeta.searchPath.join(", ")}</span>
          ) : null}
        </label>
        <label className="fin-field">
          <span>DSN destino (--target)</span>
          <select
            className="select select-bordered select-sm"
            value={targetDsn}
            onChange={(event) => setTargetDsn(event.target.value)}
          >
            <option value="">Seleccione DSN destino</option>
            {!targetMeta ? <option value={targetDsn}>{targetDsn} (no persistido)</option> : null}
            {sources.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name} · {item.dsn}
              </option>
            ))}
          </select>
          {targetMeta ? (
            <span className="font-normal">*LIBL*: {targetMeta.searchPath.join(", ")}</span>
          ) : null}
        </label>
        {mode === "row" ? (
          <label className="fin-field">
              <span>Límite (--limit)</span>
              <input
                className="input input-bordered input-sm"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
          </label>
        ) : null}
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Tablas del diccionario local ({filteredDictionaries.length}{tableFilter ? ` de ${dictionaries.length}` : ""})
          </h3>
          <div className="flex flex-wrap gap-2">
            <label className="fin-field relative w-full min-w-48 sm:w-60">
              <span className="sr-only">Buscar tablas</span>
              <span className="relative">
                <Search size={14} className="fin-muted absolute left-2 top-2" />
                <input
                  id="inputFilter_compare_tables"
                  className="input input-bordered input-sm w-full pl-7"
                  placeholder="Buscar tablas"
                  value={tableFilter}
                  onChange={(event) => {
                    setTableFilter(event.target.value);
                    setTablePage(1);
                  }}
                />
              </span>
            </label>
            <label className="fin-field w-28">
              <span className="sr-only">Filas por página</span>
              <select
                id="selectPageSize_compare_tables"
                className="select select-bordered select-sm"
                value={tablePageSize}
                onChange={(event) => {
                  setTablePageSize(Number(event.target.value));
                  setTablePage(1);
                }}
              >
                {[8, 10, 20, 50].map((size) => <option key={size} value={size}>{size} por página</option>)}
              </select>
            </label>
            <button
              id="btnView_compare_select_all"
              type="button"
              className="btn btn-xs"
              disabled={filteredDictionaries.length === 0}
              title={normalizedTableFilter ? "Selecciona todas las tablas que coinciden con el filtro" : "Selecciona todas las tablas"}
              onClick={() => setSelectedTables(filteredDictionaries.map((dictionary) => dictionary.table))}
            >
              {normalizedTableFilter ? "Seleccionar filtradas" : "Seleccionar todas"} ({filteredDictionaries.length})
            </button>
            <button id="btnView_compare_clear" type="button" className="btn btn-xs" onClick={() => setSelectedTables([])}>Limpiar selección</button>
            <button
              id="btnSave_compare_run"
              type="button"
              className="btn fin-btn-primary btn-sm"
              disabled={!canRun || busy || !sourceDsn.trim() || !targetDsn.trim() || selectedTables.length === 0}
              onClick={() => void run()}
            >
              <Play size={14} />
              {busy ? "Ejecutando…" : "Ejecutar comparación"}
            </button>
          </div>
        </div>
        <div className="max-h-[min(60vh,40rem)] overflow-auto rounded-lg border">
          <table className="table table-xs table-pin-rows">
            <thead><tr><th>Seleccionar</th><th>Tabla</th><th>Descripción</th><th>Columnas</th><th>Clave</th></tr></thead>
            <tbody>{visibleDictionaries.map((dictionary) => (
              <tr key={dictionary.table}>
                <td><input type="checkbox" className="checkbox checkbox-sm" checked={selectedTables.includes(dictionary.table)} onChange={(event) => setSelectedTables((current) => event.target.checked ? [...current, dictionary.table] : current.filter((table) => table !== dictionary.table))} /></td>
                <td className="font-code">{dictionary.table}</td>
                <td>{dictionary.tableDescription || "—"}</td>
                <td>{dictionary.columns?.length ?? 0}</td>
                <td className="font-code">{dictionary.keyColumns?.join(", ") || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="fin-muted">
            {filteredDictionaries.length === 0
              ? "Sin tablas coincidentes"
              : `${(currentTablePage - 1) * tablePageSize + 1}–${Math.min(currentTablePage * tablePageSize, filteredDictionaries.length)} de ${filteredDictionaries.length} tablas`}
            {selectedTables.length > 0 ? ` · ${selectedTables.length} seleccionadas` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              id="btnView_compare_tables_previous"
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              title="Página anterior"
              aria-label="Página anterior"
              disabled={currentTablePage <= 1}
              onClick={() => setTablePage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="fin-muted tabular-nums">{currentTablePage} / {tablePageCount}</span>
            <button
              id="btnView_compare_tables_next"
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              title="Página siguiente"
              aria-label="Página siguiente"
              disabled={currentTablePage >= tablePageCount}
              onClick={() => setTablePage((page) => Math.min(tablePageCount, page + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {comparisonProgress ? (
        <div className="space-y-1" role="status">
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span>
              {mode === "schema" ? "Schema" : mode === "volume" ? "Volumen" : "Fila a fila"}: {comparisonProgress.table}
            </span>
            <span>{comparisonProgress.completed} / {comparisonProgress.total} tablas completadas</span>
          </div>
          <progress
            className="progress progress-primary w-full"
            value={comparisonProgress.completed}
            max={Math.max(comparisonProgress.total, 1)}
            aria-label={`${comparisonProgress.completed} de ${comparisonProgress.total} tablas completadas`}
          />
        </div>
      ) : null}

      {mode === "row" && results.length > 0 ? (
        <RowComparisonSummary
          results={results}
          dictionaries={dictionaries}
          tableDescriptions={tableDescriptions}
          sourceDsn={sourceMeta?.dsn ?? ""}
          targetDsn={targetMeta?.dsn ?? ""}
          sourceName={sourceMeta?.name}
          targetName={targetMeta?.name}
          compareSession={compareSession}
        />
      ) : mode === "volume" && results.length > 0 ? (
        <VolumeComparisonSummary results={results} dictionaries={dictionaries} tableDescriptions={tableDescriptions} />
      ) : mode === "schema" && results.length > 0 ? (
        <SchemaComparisonSummary
          results={results}
          dictionaries={dictionaries}
          tableDescriptions={tableDescriptions}
          onLoadSchemaDetail={loadSchemaTableDetail}
        />
      ) : results.map((result) => (
        <CompareResult
          key={result.jobId}
          result={result}
          columns={dictionaries.find((dictionary) => dictionary.table === result.table)?.columns ?? []}
          tableDescriptions={tableDescriptions}
          onLoadSchemaDetail={loadSchemaTableDetail}
          sourceDsn={sourceDsn}
          targetDsn={targetDsn}
          sourceName={sourceMeta?.name}
          targetName={targetMeta?.name}
        />
      ))}
    </section>
  );
}

function SchemaComparisonSummary({
  results,
  dictionaries,
  tableDescriptions,
  onLoadSchemaDetail,
}: {
  results: JobResult[];
  dictionaries: DictionarySummary[];
  tableDescriptions: Record<string, string>;
  onLoadSchemaDetail: (table: string) => Promise<SchemaTableDetail>;
}) {
  const [result] = results;
  const schemaComparison = result?.schemaComparison ?? [];
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [detail, setDetail] = useState<SchemaTableDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = [...new Set(schemaComparison.map((column) => column.table))]
    .sort()
    .map((table) => {
      const columns = schemaComparison.filter((column) => column.table === table);
      const equal = columns.filter((column) => column.status === "Igual").length;
      const differences = columns.length - equal;
      return {
        table,
        columns: columns.length,
        differences,
        integrity: columns.length === 0 ? 0 : Math.round((equal / columns.length) * 100),
      };
    });

  async function openDetail(table: string) {
    setSelectedTable(table);
    setDetail(null);
    setError("");
    setBusy(true);
    try {
      setDetail(await onLoadSchemaDetail(table));
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo cargar el detalle de esquema."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Comparación de esquema</h3>
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
          <thead>
            <tr>
              <th>Tabla</th>
              <th>Descripción</th>
              <th>PK local</th>
              <th>Columnas comparadas</th>
              <th>Con diferencias</th>
              <th>Integridad</th>
              <th>Estado</th>
              <th>Ver</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.table}>
                <td className="font-code">{row.table}</td>
                <td>{tableDescriptions[row.table.toUpperCase()] || "—"}</td>
                <td className="font-code">{formatLocalPrimaryKey(dictionaries, row.table)}</td>
                <td>{formatNumber(row.columns)}</td>
                <td className={row.differences > 0 ? "text-amber-700" : "text-emerald-700"}>{formatNumber(row.differences)}</td>
                <td>{row.integrity}%</td>
                <td className={row.differences > 0 ? "text-amber-700" : "text-emerald-700"}>{row.differences > 0 ? "Con diferencias" : "Íntegro"}</td>
                <td>
                  <button id={`btnView_compare_detail_${row.table}`} type="button" className="btn btn-xs" onClick={() => void openDetail(row.table)} title={`Ver detalle de ${row.table}`}>
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedTable ? (
        <SchemaSummaryModal
          table={selectedTable}
          detail={detail}
          keyColumns={findLocalDictionary(dictionaries, selectedTable)?.keyColumns ?? []}
          error={error}
          busy={busy}
          onClose={() => {
            setSelectedTable(null);
            setDetail(null);
          }}
        />
      ) : null}
    </section>
  );
}

function SchemaSummaryModal({
  table,
  detail,
  keyColumns,
  error,
  busy,
  onClose,
}: {
  table: string;
  detail: SchemaTableDetail | null;
  keyColumns: string[];
  error: string;
  busy: boolean;
  onClose: () => void;
}) {
  const columns = detail ? [...new Set([...detail.source.columns, ...detail.target.columns].map((column) => column.columnName))] : [];
  const keySet = new Set(keyColumns.map((column) => column.toUpperCase()));
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Detalle de esquema ${table}`}>
      <div className="fin-panel flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-base font-bold">Detalle de esquema: {table}</h3><button id="btnView_compare_close_schema" type="button" className="btn btn-sm" onClick={onClose}>Cerrar</button></div>
        <div className="min-h-0 overflow-auto rounded border">
          <table className="table table-xs table-pin-rows"><thead><tr><th>Campo</th><th>PK local</th><th>Tipo origen</th><th>Largo origen</th><th>Decimales origen</th><th>Tipo destino</th><th>Largo destino</th><th>Decimales destino</th></tr></thead><tbody>
            {columns.map((name) => {
              const source = detail?.source.columns.find((column) => column.columnName === name);
              const target = detail?.target.columns.find((column) => column.columnName === name);
              return <tr key={name}><td className="font-code">{name}</td><td>{keySet.has(name.toUpperCase()) ? <span className="font-semibold text-[color:var(--brand)]">PK</span> : "—"}</td><td>{source?.dataType ?? "—"}</td><td>{source?.length ?? "—"}</td><td>{source?.scale ?? "—"}</td><td>{target?.dataType ?? "—"}</td><td>{target?.length ?? "—"}</td><td>{target?.scale ?? "—"}</td></tr>;
            })}
            {busy ? <tr><td colSpan={8} className="py-8 text-center">Cargando detalle...</td></tr> : null}
            {error ? <tr><td colSpan={8} className="py-8 text-center text-red-700">{error}</td></tr> : null}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

function VolumeComparisonSummary({
  results,
  dictionaries,
  tableDescriptions,
}: {
  results: JobResult[];
  dictionaries: DictionarySummary[];
  tableDescriptions: Record<string, string>;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Comparación de volumen</h3>
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
          <thead>
            <tr>
              <th>Tabla</th>
              <th>Descripción</th>
              <th>PK local</th>
              <th>Registros origen</th>
              <th>Registros destino</th>
              <th>Diferencia registros</th>
              <th>Tamaño origen</th>
              <th>Tamaño destino</th>
              <th>Diferencia tamaño</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.jobId}>
                <td className="font-code">{result.table}</td>
                <td>{tableDescriptions[(result.table ?? "").toUpperCase()] || "—"}</td>
                <td className="font-code">{formatLocalPrimaryKey(dictionaries, result.table ?? "")}</td>
                <td className="dc-origin">{formatCount(result.sourceCount)}</td>
                <td className="dc-target">{formatCount(result.targetCount)}</td>
                <td>{formatCount(result.volumeDelta)}</td>
                <td className="dc-origin">{formatBytes(result.sourceDataSize)}</td>
                <td className="dc-target">{formatBytes(result.targetDataSize)}</td>
                <td>{formatBytes(result.dataSizeDelta, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RowComparisonSummary({
  results,
  dictionaries,
  tableDescriptions,
  sourceDsn,
  targetDsn,
  sourceName,
  targetName,
  compareSession,
}: {
  results: JobResult[];
  dictionaries: DictionarySummary[];
  tableDescriptions: Record<string, string>;
  sourceDsn: string;
  targetDsn: string;
  sourceName?: string;
  targetName?: string;
  compareSession: CompareSession;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Resultados fila a fila</h3>
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
          <thead>
            <tr>
              <th>Tabla</th>
              <th>Descripción</th>
              <th>PK local</th>
              <th>Registros origen</th>
              <th>Registros destino</th>
              <th>Diferencia</th>
              <th>Cambiadas</th>
              <th>Solo origen</th>
              <th>Solo destino</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const delta = result.rowDelta;
              const dictionary = dictionaries.find((item) => item.table === result.table);
              const stateBase = {
                rowDelta: delta,
                labels: Object.fromEntries(
                  (dictionary?.columns ?? []).map((column) => [
                    column.columnName.toUpperCase(),
                    column.description ?? "",
                  ]),
                ),
                flagColumns: (dictionary?.columns ?? [])
                  .filter((column) => column.isFlag)
                  .map((column) => column.columnName.toUpperCase()),
                table: result.table ?? "",
                tableDescription: tableDescriptions[(result.table ?? "").toUpperCase()] ?? "",
                sourceDsn,
                targetDsn,
                sourceName,
                targetName,
                sourceSchema: result.sourceSchema,
                targetSchema: result.targetSchema,
                from: "/compare",
                compare: compareSession,
              };
              return (
                <tr key={result.jobId}>
                  <td className="font-code">{result.table}</td>
                  <td>{stateBase.tableDescription || "—"}</td>
                  <td className="font-code">{formatLocalPrimaryKey(dictionaries, result.table ?? "")}</td>
                  <td className="dc-origin">{formatCount(result.sourceCount)}</td>
                  <td className="dc-target">{formatCount(result.targetCount)}</td>
                  <td>{formatCount(result.volumeDelta)}</td>
                  <DifferenceLink kind="changed" count={delta?.changed ?? 0} stateBase={stateBase} />
                  <DifferenceLink kind="onlyInSource" count={delta?.onlyInSource ?? 0} stateBase={stateBase} />
                  <DifferenceLink kind="onlyInTarget" count={delta?.onlyInTarget ?? 0} stateBase={stateBase} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DifferenceLink({
  kind,
  count,
  stateBase,
}: {
  kind: "changed" | "onlyInSource" | "onlyInTarget";
  count: number;
  stateBase: Record<string, unknown>;
}) {
  if (count === 0 || !stateBase.rowDelta) {
    return <td>{formatNumber(count)}</td>;
  }
  return (
    <td>
      <Link
        className="link font-semibold"
        to={`/compare/rows/${kind}`}
        state={{ ...stateBase, kind }}
        title="Ver registros asociados"
      >
        {formatNumber(count)}
      </Link>
    </td>
  );
}

function findLocalDictionary(
  dictionaries: DictionarySummary[],
  table: string,
): DictionarySummary | undefined {
  const tableName = table.trim().toUpperCase();
  return dictionaries.find((dictionary) => dictionary.table.trim().toUpperCase() === tableName);
}

function formatLocalPrimaryKey(dictionaries: DictionarySummary[], table: string): string {
  const dictionary = findLocalDictionary(dictionaries, table);
  if (!dictionary) return "Sin diccionario";
  return dictionary.keyColumns?.length
    ? dictionary.keyColumns.join(", ")
    : "Sin PK definida";
}

function formatCount(value: number | undefined): string {
  return value == null ? "—" : formatNumber(value);
}

function formatBytes(value: number | undefined, signed = false): string {
  if (value == null) {
    return "—";
  }
  const prefix = signed && value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  if (absolute < 1024) {
    return `${prefix}${formatNumber(value)} B`;
  }
  const unit = absolute >= 1024 ** 3 ? "GB" : "MB";
  const divisor = unit === "GB" ? 1024 ** 3 : 1024 ** 2;
  return `${prefix}${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value / divisor)} ${unit}`;
}
