import { useEffect, useMemo, useState } from "react";
import type { JobResult } from "@deltacore/shared";
import { Play } from "lucide-react";
import { apiClient } from "../../auth/api.client";
import { usePermissions } from "../../auth/usePermissions";
import { CompareResult, type ColumnInfo } from "./CompareResult";

type Mode = "schema" | "volume" | "row";
type DataSource = { dsn: string; name: string; engine: string; searchPath: string[] };

const JOBS_MODULE = "JOBS_CONFIG";

export function CompareView() {
  const { canWrite } = usePermissions(JOBS_MODULE);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [mode, setMode] = useState<Mode>("row");
  const [sourceDsn, setSourceDsn] = useState("AZ7DB");
  const [targetDsn, setTargetDsn] = useState("AZ7DBPRDCL");
  const [table, setTable] = useState("ACCTX");
  const [sourceSchema, setSourceSchema] = useState("AZBASWQA");
  const [targetSchema, setTargetSchema] = useState("AXSW1PDCL");
  const [keys, setKeys] = useState("");
  const [limit, setLimit] = useState("10000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<JobResult | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);


  useEffect(() => {
    void apiClient
      .get<{ sources: DataSource[] }>("/data-sources")
      .then((response) => setSources(response.data.sources))
      .catch(() => undefined);
  }, []);

  const tableName = table.split(",")[0]?.trim() ?? "";

  useEffect(() => {
    if (!tableName) {
      return;
    }
    let cancelled = false;
    void apiClient
      .get<{
        origin?: string;
        columns?: ColumnInfo[];
        keyColumns?: string[];
      }>("/dictionary", {
        params: {
          dsn: sourceDsn,
          table: tableName,
          ...(sourceSchema.trim() ? { schema: sourceSchema.trim() } : {}),
        },
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setColumns(response.data.columns ?? []);
        const savedKeys = (response.data.keyColumns ?? []).filter(Boolean);
        setKeys(savedKeys.join(","));
      })
      .catch(() => {
        if (!cancelled) {
          setKeys("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceDsn, sourceSchema, tableName]);

  const sourceMeta = useMemo(
    () => sources.find((item) => item.dsn === sourceDsn),
    [sources, sourceDsn],
  );
  const targetMeta = useMemo(
    () => sources.find((item) => item.dsn === targetDsn),
    [sources, targetDsn],
  );

  async function run() {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    try {
      const tables = table
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (tables.length === 0) {
        throw new Error("Indique al menos una tabla");
      }
      const keyColumns = keys
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      const payload =
        mode === "schema"
          ? await apiClient.post<JobResult>("/jobs/ui/schema-compare", {
              sourceDsn,
              targetDsn,
              tables,
            })
          : mode === "volume"
            ? await apiClient.post<JobResult>("/jobs/ui/volume-compare", {
                sourceDsn,
                targetDsn,
                table: tables[0],
                sourceSchema: sourceSchema || undefined,
                targetSchema: targetSchema || undefined,
              })
            : await apiClient.post<JobResult>("/jobs/ui/row-compare", {
                sourceDsn,
                targetDsn,
                table: tables[0],
                sourceSchema: sourceSchema || undefined,
                targetSchema: targetSchema || undefined,
                keyColumns,
                limit: Number(limit) || undefined,
              });
      setResult(payload.data);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        (err instanceof Error ? err.message : "Error al comparar");
      setError(message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
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
          <input
            className="input input-bordered input-sm"
            list="dsn-list"
            value={sourceDsn}
            onChange={(event) => setSourceDsn(event.target.value)}
          />
          {sourceMeta ? (
            <span className="font-normal">*LIBL*: {sourceMeta.searchPath.join(", ")}</span>
          ) : null}
        </label>
        <label className="fin-field">
          <span>DSN destino (--target)</span>
          <input
            className="input input-bordered input-sm"
            list="dsn-list"
            value={targetDsn}
            onChange={(event) => setTargetDsn(event.target.value)}
          />
          {targetMeta ? (
            <span className="font-normal">*LIBL*: {targetMeta.searchPath.join(", ")}</span>
          ) : null}
        </label>
        <label className="fin-field md:col-span-2">
          <span>{mode === "schema" ? "Tablas (--table, separadas por coma)" : "Tabla (--table)"}</span>
          <input
            className="input input-bordered input-sm"
            value={table}
            onChange={(event) => setTable(event.target.value)}
          />
        </label>
        {mode !== "schema" ? (
          <>
            <label className="fin-field">
              <span>Esquema origen (--source-schema)</span>
              <input
                className="input input-bordered input-sm"
                value={sourceSchema}
                onChange={(event) => setSourceSchema(event.target.value)}
              />
            </label>
            <label className="fin-field">
              <span>Esquema destino (--target-schema)</span>
              <input
                className="input input-bordered input-sm"
                value={targetSchema}
                onChange={(event) => setTargetSchema(event.target.value)}
              />
            </label>
          </>
        ) : null}
        {mode === "row" ? (
          <>
            <label className="fin-field">
              <span>Clave (diccionario SQLite)</span>
              <input
                className="input input-bordered input-sm"
                placeholder="Se completa al cargar el diccionario guardado"
                value={keys}
                onChange={(event) => setKeys(event.target.value)}
              />
              <span className="font-normal">
                {keys
                  ? `Campos clave: ${keys}`
                  : "No hay claves en SQLite. Defínalas en el menú Diccionario."}
              </span>
            </label>
            <label className="fin-field">
              <span>Límite (--limit)</span>
              <input
                className="input input-bordered input-sm"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>

      <datalist id="dsn-list">
        {sources.map((item) => (
          <option key={item.dsn} value={item.dsn}>
            {item.name}
          </option>
        ))}
      </datalist>

      <button
        type="button"
        className="btn fin-btn-primary btn-sm"
        disabled={!canWrite || busy}
        onClick={() => void run()}
      >
        <Play size={14} />
        {busy ? "Ejecutando…" : "Ejecutar comparación"}
      </button>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {result ? <CompareResult result={result} columns={columns} /> : null}
    </section>
  );
}
