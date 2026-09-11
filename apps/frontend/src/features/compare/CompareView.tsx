import { useEffect, useMemo, useState } from "react";
import type { JobResult } from "@deltacore/shared";
import { Play } from "lucide-react";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import { usePermissions } from "../../auth/usePermissions";
import { CompareResult, type ColumnInfo } from "./CompareResult";

type Mode = "schema" | "volume" | "row";
type DataSource = { id: string; dsn: string; name: string; engine: string; searchPath: string[] };
type DictionarySummary = {
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

export function CompareView() {
  const { notify } = useStatusNotification();
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
    const selectedSource = sources.find((item) => item.dsn === sourceDsn);
    if (selectedSource) {
      setSourceSchema(selectedSource.searchPath.join(","));
    }
  }, [sources, sourceDsn]);

  useEffect(() => {
    const selectedTarget = sources.find((item) => item.dsn === targetDsn);
    if (selectedTarget) {
      setTargetSchema(selectedTarget.searchPath.join(","));
    }
  }, [sources, targetDsn]);

  useEffect(() => {
    if (mode !== "row") {
      setColumns([]);
      setKeys("");
      return;
    }
    const tableNames = table
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (tableNames.length === 0) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    void apiClient
      .get<{ dictionaries?: DictionarySummary[] }>("/dictionary", {
        params: { dsn: sourceDsn },
      })
      .then((sourceResponse) => {
        if (cancelled) {
          return;
        }
        const sourceDictionaries = new Map(
          (sourceResponse.data.dictionaries ?? []).map((dictionary) => [
            dictionary.table.toUpperCase(),
            dictionary,
          ]),
        );
        const first = sourceDictionaries.get(tableNames[0]?.toUpperCase() ?? "");
        setColumns(first?.columns ?? []);
        const savedKeys = (first?.keyColumns ?? []).filter(Boolean);
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
  }, [mode, sourceDsn, table]);

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
    setResult(null);
    setSchemaProgress(null);
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
          ? await runSchemaComparison(tables)
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
        const comparison = "data" in payload ? payload.data : payload;
        if (comparison.status === "ERROR" || comparison.error) {
          setError(comparison.error ?? "La comparación no pudo completarse.");
          setResult(null);
          return;
        }
        if (comparison.status === "SUCCESS") {
          notify(
            mode === "schema"
              ? "Comparación de esquema finalizada sin diferencias."
              : "Comparación finalizada correctamente.",
            "success",
          );
        } else {
          notify("Comparación finalizada con diferencias.", "warning");
        }
        setResult(comparison);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        (err instanceof Error ? err.message : "Error al comparar");
      setError(message);
      setResult(null);
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
            params: { dsn: sourceDsn, table: tableName, searchPath: sourceSchema },
          });
          descriptions[tableName.toUpperCase()] = catalog.data.tableDescription?.trim() ?? "";
        }),
    );
    setTableDescriptions(descriptions);
  }

  async function loadSchemaTableDetail(tableName: string): Promise<SchemaTableDetail> {
    const [source, target] = await Promise.all([
      apiClient.get<SchemaTableDetail["source"]>("/catalog/describe", {
        params: { dsn: sourceDsn, table: tableName, searchPath: sourceSchema },
      }),
      apiClient.get<SchemaTableDetail["target"]>("/catalog/describe", {
        params: { dsn: targetDsn, table: tableName, searchPath: targetSchema },
      }),
    ]);
    return { source: source.data, target: target.data };
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
              <span>Esquema origen (prioridad, separado por coma)</span>
              <input
                className="input input-bordered input-sm"
                value={sourceSchema}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="fin-field">
              <span>Esquema destino (prioridad, separado por coma)</span>
              <input
                className="input input-bordered input-sm"
                value={targetSchema}
                readOnly
                aria-readonly="true"
              />
            </label>
          </>
        ) : null}
        {mode === "row" ? (
          <>
            <label className="fin-field">
              <span>Clave (diccionario)</span>
              <input
                className="input input-bordered input-sm"
                placeholder="Se completa al cargar el diccionario guardado"
                value={keys}
                onChange={(event) => setKeys(event.target.value)}
              />
              <span className="font-normal">
                {keys
                  ? `Campos clave: ${keys}`
                  : "No hay claves definidas. Configúrelas en el menú Diccionario."}
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

      <button
        type="button"
        className="btn fin-btn-primary btn-sm"
        disabled={!canWrite || busy}
        onClick={() => void run()}
      >
        <Play size={14} />
        {busy ? "Ejecutando…" : "Ejecutar comparación"}
      </button>

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

      {result ? (
        <CompareResult
          result={result}
          columns={columns}
          tableDescriptions={tableDescriptions}
          onLoadSchemaDetail={loadSchemaTableDetail}
        />
      ) : null}
    </section>
  );
}
