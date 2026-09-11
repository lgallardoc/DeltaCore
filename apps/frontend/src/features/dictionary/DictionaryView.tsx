import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import { usePermissions } from "../../auth/usePermissions";
import type { SmartBackState } from "../../navigation/smartBack";
import { DictionaryPanel } from "../compare/DictionaryPanel";

const JOBS_MODULE = "JOBS_CONFIG";
type DataSource = { id: string; dsn: string; name: string; searchPath: string[] };

export function DictionaryView() {
  const { notify } = useStatusNotification();
  const location = useLocation();
  const backState = (location.state as SmartBackState | null) ?? {};
  const restored = backState.dictionary;
  const { canWrite } = usePermissions(JOBS_MODULE);
  const [dsn, setDsn] = useState(restored?.dsn ?? "AZ7DB");
  const [schema, setSchema] = useState(restored?.schema ?? "AZBASWQA");
  const [table, setTable] = useState(restored?.table ?? "ACCTX");
  const [autoSaveCatalog, setAutoSaveCatalog] = useState(restored?.autoSaveCatalog ?? false);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [sourcesError, setSourcesError] = useState("");

  useEffect(() => {
    if (sourcesError) {
      notify(sourcesError, "error");
    }
  }, [notify, sourcesError]);

  async function loadSources() {
    setSourcesError("");
    try {
      const response = await apiClient
        .get<{ sources: DataSource[] }>("/data-sources");
      setSources(response.data.sources);
    } catch (err) {
      setSourcesError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudieron cargar los catálogos"),
      );
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    const selectedSource = sources.find((source) => source.dsn === dsn);
    if (selectedSource) {
      setSchema(selectedSource.searchPath.join(","));
    }
  }, [dsn, sources]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Diccionario de datos</h2>
        <p className="fin-muted max-w-2xl text-sm">
          Consulte los diccionarios guardados del DSN o cárguelos desde el catálogo vivo.
          Desde el listado puede editar, guardar o eliminar cada tabla; la comparación usa
          la versión local cuando existe.
        </p>
      </div>

      <ol className="grid gap-2 text-sm md:grid-cols-3">
        <li className="rounded-xl border border-[color:var(--line)] bg-white p-3">
          <p className="fin-primary text-[10px] font-semibold uppercase">Paso 1</p>
          <p className="font-semibold">Seleccionar fuente</p>
          <p className="fin-muted text-xs">Elija el DSN y revise los esquemas priorizados.</p>
        </li>
        <li className="rounded-xl border border-[color:var(--line)] bg-white p-3">
          <p className="fin-primary text-[10px] font-semibold uppercase">Paso 2</p>
          <p className="font-semibold">Cargar diccionarios</p>
          <p className="fin-muted text-xs">Deje Tabla vacía y use «Buscar guardado / catálogo» o «Cargar desde catálogo».</p>
        </li>
        <li className="rounded-xl border border-[color:var(--line)] bg-white p-3">
          <p className="fin-primary text-[10px] font-semibold uppercase">Paso 3</p>
          <p className="font-semibold">Gestionar tablas</p>
          <p className="fin-muted text-xs">Edite claves y descripciones, guarde cambios o elimine una tabla o todo el DSN.</p>
        </li>
      </ol>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="fin-field">
          <span>DSN</span>
          <select
            className="select select-bordered select-sm"
            value={dsn}
            onChange={(event) => setDsn(event.target.value)}
          >
            {!sources.some((source) => source.dsn === dsn) ? (
              <option value={dsn}>{dsn} (no persistido)</option>
            ) : null}
            {sources.map((source) => (
              <option key={source.id} value={source.dsn}>
                {source.name} · {source.dsn}
              </option>
            ))}
          </select>
          {sources.length === 0 ? (
            <span className="font-normal">No hay catálogos persistidos.</span>
          ) : null}
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={autoSaveCatalog}
            onChange={(event) => setAutoSaveCatalog(event.target.checked)}
          />
          Guardar diccionario automáticamente
        </label>
        <label className="fin-field">
          <span>Esquemas priorizados</span>
          <input
            className="input input-bordered input-sm"
            value={schema}
            readOnly
            aria-readonly="true"
          />
        </label>
        <label className="fin-field">
          <span>Tabla</span>
          <input
            className="input input-bordered input-sm"
            value={table}
            onChange={(event) => setTable(event.target.value)}
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="button" className="btn btn-sm" onClick={() => void loadSources()}>
          <RefreshCw size={14} /> Recargar catálogos
        </button>
      </div>

      <DictionaryPanel
        dsn={dsn}
        schema={schema}
        table={table}
        canWrite={canWrite}
        autoLoad={false}
        autoSaveCatalog={autoSaveCatalog}
        showColumns={false}
        dictionaryBackState={{ dsn, schema, table, autoSaveCatalog }}
        initialSession={backState.dictionaryPanel}
      />
    </section>
  );
}
