import { useEffect, useMemo, useState } from "react";
import type { JobResult } from "@deltacore/shared";
import { Play } from "lucide-react";
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
  columns?: ColumnInfo[];
  keyColumns?: string[];
};

export type SchemaTableDetail = {
  source: { schema: string; columns: Array<ColumnInfo & { length?: string; scale?: string }> };
  target: { schema: string; columns: Array<ColumnInfo & { length?: string; scale?: string }> };
};

const JOBS_MODULE = "JOBS_CONFIG";

type CompareSession = {
  mode: Mode;
  sourceDsn: string;
  targetDsn: string;
  limit: string;
  selectedTables: string[];
  results: JobResult[];
};

export function CompareView() {
  const location = useLocation();
  const restored = (location.state as SmartBackState | null)?.compare as CompareSession | undefined;
  const { notify } = useStatusNotification();
  const { canWrite } = usePermissions(JOBS_MODULE);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionarySummary[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>(restored?.selectedTables ?? []);
  const [mode, setMode] = useState<Mode>(restored?.mode ?? "row");
  const [sourceDsn, setSourceDsn] = useState(restored?.sourceDsn ?? "AZ7DB");
  const [targetDsn, setTargetDsn] = useState(restored?.targetDsn ?? "AZ7DBPRDCL");
  const [limit, setLimit] = useState(restored?.limit ?? "10000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<JobResult[]>(restored?.results ?? []);
  const [tableDescriptions, setTableDescriptions] = useState<Record<string, string>>({});
  const [schemaProgress, setSchemaProgress] = useState<{
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
    let cancelled = false;
    void apiClient
      .get<{ dictionaries?: DictionarySummary[] }>("/dictionary", {
        params: { dsn: sourceDsn },
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
  }, [sourceDsn]);

  const sourceMeta = useMemo(
    () => sources.find((item) => item.dsn === sourceDsn),
    [sources, sourceDsn],
  );
  const targetMeta = useMemo(
    () => sources.find((item) => item.dsn === targetDsn),
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
  const compareSession: CompareSession = {
    mode,
    sourceDsn,
    targetDsn,
    limit,
    selectedTables,
    results,
  };

  async function run() {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    setResults([]);
    setSchemaProgress(null);
    try {
      const selected = dictionaries.filter((dictionary) => selectedTables.includes(dictionary.table));
      if (selected.length === 0) {
        throw new Error("Seleccione al menos una tabla del diccionario local.");
      }
      const comparisons =
        mode === "schema"
          ? [await runSchemaComparison(selected.map((dictionary) => dictionary.table))]
          : await Promise.all(selected.map(async (dictionary) => {
            const response = await apiClient.post<JobResult>(
              mode === "volume" ? "/jobs/ui/volume-compare" : "/jobs/ui/row-compare",
              mode === "volume" ? {
                sourceDsn,
                targetDsn,
                table: dictionary.table,
                sourceSchema: dictionary.schema,
              } : {
                sourceDsn,
                targetDsn,
                table: dictionary.table,
                sourceSchema: dictionary.schema,
                keyColumns: dictionary.keyColumns ?? [],
                limit: Number(limit) || undefined,
              },
            );
            return response.data;
          }));
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
      setSchemaProgress(null);
    }
  }

  async function runSchemaComparison(tables: string[]): Promise<JobResult> {
    const schemaComparison: NonNullable<JobResult["schemaComparison"]> = [];
    const schemaDelta: NonNullable<JobResult["schemaDelta"]> = {};
    let jobId = "";
    for (const [index, tableName] of tables.entries()) {
      setSchemaProgress({ completed: index, total: tables.length, table: tableName });
      const response = await apiClient.post<JobResult>("/jobs/ui/schema-compare", {
        sourceDsn,
        targetDsn,
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
      setSchemaProgress({ completed: index + 1, total: tables.length, table: tableName });
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
      params: { dsn: sourceDsn },
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
            params: { dsn: sourceDsn, table: tableName },
          });
          descriptions[tableName.toUpperCase()] = catalog.data.tableDescription?.trim() ?? "";
        }),
    );
    setTableDescriptions(descriptions);
  }

  async function loadSchemaTableDetail(tableName: string): Promise<SchemaTableDetail> {
    const [source, target] = await Promise.all([
      apiClient.get<SchemaTableDetail["source"]>("/catalog/describe", {
        params: { dsn: sourceDsn, table: tableName },
      }),
      apiClient.get<SchemaTableDetail["target"]>("/catalog/describe", {
        params: { dsn: targetDsn, table: tableName },
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
            {!sourceMeta ? <option value={sourceDsn}>{sourceDsn} (no persistido)</option> : null}
            {sources.map((item) => (
              <option key={item.id} value={item.dsn}>
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
            {!targetMeta ? <option value={targetDsn}>{targetDsn} (no persistido)</option> : null}
            {sources.map((item) => (
              <option key={item.id} value={item.dsn}>
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
          <h3 className="text-sm font-semibold">Tablas del diccionario local ({dictionaries.length})</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-xs" onClick={() => setSelectedTables(dictionaries.map((dictionary) => dictionary.table))}>Seleccionar todas</button>
            <button type="button" className="btn btn-xs" onClick={() => setSelectedTables([])}>Limpiar selección</button>
            <button
              type="button"
              className="btn fin-btn-primary btn-sm"
              disabled={!canWrite || busy || selectedTables.length === 0}
              onClick={() => void run()}
            >
              <Play size={14} />
              {busy ? "Ejecutando…" : "Ejecutar comparación"}
            </button>
          </div>
        </div>
        <div className="max-h-40 overflow-auto rounded-lg border">
          <table className="table table-xs table-pin-rows">
            <thead><tr><th>Seleccionar</th><th>Tabla</th><th>Descripción</th><th>Columnas</th><th>Clave</th></tr></thead>
            <tbody>{orderedDictionaries.map((dictionary) => (
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
      </section>

      {schemaProgress ? (
        <div className="space-y-1" role="status">
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span>Analizando esquema: {schemaProgress.table}</span>
            <span>{schemaProgress.completed} / {schemaProgress.total} tabla(s)</span>
          </div>
          <progress
            className="progress progress-primary w-full"
            value={schemaProgress.completed}
            max={Math.max(schemaProgress.total, 1)}
          />
        </div>
      ) : null}

      {mode === "row" && results.length > 0 ? (
        <RowComparisonSummary
          results={results}
          dictionaries={dictionaries}
          tableDescriptions={tableDescriptions}
          sourceDsn={sourceDsn}
          targetDsn={targetDsn}
          sourceName={sourceMeta?.name}
          targetName={targetMeta?.name}
          compareSession={compareSession}
        />
      ) : mode === "volume" && results.length > 0 ? (
        <VolumeComparisonSummary results={results} tableDescriptions={tableDescriptions} />
      ) : mode === "schema" && results.length > 0 ? (
        <SchemaComparisonSummary
          results={results}
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
  tableDescriptions,
  onLoadSchemaDetail,
}: {
  results: JobResult[];
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
                <td>{formatNumber(row.columns)}</td>
                <td className={row.differences > 0 ? "text-amber-700" : "text-emerald-700"}>{formatNumber(row.differences)}</td>
                <td>{row.integrity}%</td>
                <td className={row.differences > 0 ? "text-amber-700" : "text-emerald-700"}>{row.differences > 0 ? "Con diferencias" : "Íntegro"}</td>
                <td>
                  <button type="button" className="btn btn-xs" onClick={() => void openDetail(row.table)} title={`Ver detalle de ${row.table}`}>
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
  const columns = detail ? [...new Set([...detail.source.columns, ...detail.target.columns].map((column) => column.columnName))] : [];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Detalle de esquema ${table}`}>
      <div className="fin-panel flex max-h-[85vh] w-full max-w-6xl flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-base font-bold">Detalle de esquema: {table}</h3><button type="button" className="btn btn-sm" onClick={onClose}>Cerrar</button></div>
        <div className="min-h-0 overflow-auto rounded border">
          <table className="table table-xs table-pin-rows"><thead><tr><th>Campo</th><th>Tipo origen</th><th>Largo origen</th><th>Decimales origen</th><th>Tipo destino</th><th>Largo destino</th><th>Decimales destino</th></tr></thead><tbody>
            {columns.map((name) => {
              const source = detail?.source.columns.find((column) => column.columnName === name);
              const target = detail?.target.columns.find((column) => column.columnName === name);
              return <tr key={name}><td className="font-code">{name}</td><td>{source?.dataType ?? "—"}</td><td>{source?.length ?? "—"}</td><td>{source?.scale ?? "—"}</td><td>{target?.dataType ?? "—"}</td><td>{target?.length ?? "—"}</td><td>{target?.scale ?? "—"}</td></tr>;
            })}
            {busy ? <tr><td colSpan={7} className="py-8 text-center">Cargando detalle...</td></tr> : null}
            {error ? <tr><td colSpan={7} className="py-8 text-center text-red-700">{error}</td></tr> : null}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

function VolumeComparisonSummary({
  results,
  tableDescriptions,
}: {
  results: JobResult[];
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
