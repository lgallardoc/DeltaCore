import { useEffect, useState } from "react";
import { Edit3, Plus, Save, Search, Trash2 } from "lucide-react";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import { usePermissions } from "../../auth/usePermissions";

type CatalogPayload = Record<string, unknown>;

type CatalogDescription = {
  schema: string;
  table: string;
  tableDescription?: string;
  rowCount?: number;
  columns: Array<Record<string, unknown>>;
};

type CatalogSource = {
  id: string;
  name: string;
  dsn: string;
  engine: string;
  searchPath: string[];
};

export function CatalogView() {
  const { notify } = useStatusNotification();
  const [dsn, setDsn] = useState("AZ7DB");
  const [sourceName, setSourceName] = useState("Fuente IBM i");
  const [sourceId, setSourceId] = useState("");
  const [sources, setSources] = useState<CatalogSource[]>([]);
  const [sourceFilter, setSourceFilter] = useState("");
  const [table, setTable] = useState("ACCTX");
  const [searchPath, setSearchPath] = useState("");
  const [allSchemas, setAllSchemas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<CatalogPayload | null>(null);
  const [savingKey, setSavingKey] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const { canWrite, isResolved: permissionsResolved } = usePermissions("JOBS_CONFIG");

  useEffect(() => {
    if (error) {
      notify(error, "error");
    }
  }, [error, notify]);

  useEffect(() => {
    if (saveMessage) {
      notify(saveMessage, "info");
    }
  }, [notify, saveMessage]);

  useEffect(() => {
    if (payload && permissionsResolved && !canWrite) {
      notify("No tiene permiso de escritura para guardar diccionarios.", "warning");
    }
  }, [canWrite, notify, payload, permissionsResolved]);

  async function loadSources(search = sourceFilter) {
    try {
      const response = await apiClient.get<{ sources: CatalogSource[] }>("/data-sources", {
        params: search.trim() ? { q: search.trim() } : undefined,
      });
      setSources(response.data.sources);
    } catch {
      setSources([]);
    }
  }

  useEffect(() => {
    void loadSources("");
  }, []);

  async function run(kind: "schemas" | "tables" | "describe") {
    setBusy(true);
    setError("");
    setSaveMessage("");
    try {
      const params: Record<string, string> = { dsn };
      if (searchPath.trim()) params.searchPath = searchPath;
      if (kind === "tables") {
        if (table) params.table = table;
        if (allSchemas) params.allSchemas = "1";
      }
      if (kind === "describe") {
        params.table = table;
      }
      const path =
        kind === "schemas"
          ? "/catalog/schemas"
          : kind === "tables"
            ? "/catalog/tables"
            : "/catalog/describe";
      const response = await apiClient.get<CatalogPayload>(path, { params });
      setPayload(response.data);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        (err instanceof Error ? err.message : "Error de catálogo");
      setError(message);
      setPayload(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveDescription(description: CatalogDescription) {
    const key = `${description.schema}.${description.table}`;
    setSavingKey(key);
    setSaveMessage("");
    try {
      await apiClient.put("/dictionary", {
        schema: description.schema,
        table: description.table,
        tableDescription: description.tableDescription,
        rowCount: description.rowCount,
        sourceDsn: dsn,
        columns: description.columns.map((column) => ({
          ...column,
          isKey: false,
        })),
      });
      setSaveMessage(`Diccionario guardado: ${key}`);
    } catch (err) {
      setSaveMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo guardar el diccionario"),
      );
    } finally {
      setSavingKey("");
    }
  }

  async function deleteDescription(description: CatalogDescription) {
    const key = `${description.schema}.${description.table}`;
    if (!window.confirm(`¿Eliminar el diccionario local de ${key}?`)) {
      return;
    }
    setSavingKey(key);
    setSaveMessage("");
    try {
      await apiClient.delete(
        `/dictionary/${encodeURIComponent(description.schema)}/${encodeURIComponent(description.table)}`,
      );
      setSaveMessage(`Diccionario local eliminado: ${key}`);
    } catch (err) {
      setSaveMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo eliminar el diccionario"),
      );
    } finally {
      setSavingKey("");
    }
  }

  async function deleteAllDictionaries() {
    if (!dsn.trim()) {
      return;
    }
    if (!window.confirm(`¿Eliminar todos los diccionarios locales del DSN ${dsn}?`)) {
      return;
    }
    setBusy(true);
    setSaveMessage("");
    try {
      const response = await apiClient.delete<{ deleted: number }>("/dictionary", {
        params: { dsn },
      });
      setSaveMessage(`Diccionarios locales eliminados: ${response.data.deleted}`);
    } catch (err) {
      setSaveMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudieron eliminar los diccionarios"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDataSource() {
    setSaveMessage("");
    try {
      const response = await apiClient.put<{
        id: string;
        name: string;
        dsn: string;
      }>("/data-sources", {
        name: sourceName,
        dsn,
        engine: "db2",
        searchPath,
        ...(sourceId ? { id: sourceId } : {}),
      });
      setSourceId(response.data.id);
      await loadSources();
      setSaveMessage(
        `DSN guardado: ${response.data.name} (${response.data.dsn}). Código: ${response.data.id}`,
      );
    } catch (err) {
      setSaveMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo guardar el DSN"),
      );
    }
  }

  function editSource(source: CatalogSource) {
    setSourceId(source.id);
    setSourceName(source.name);
    setDsn(source.dsn);
    setSearchPath(source.searchPath.join(","));
    setSaveMessage(`Editando ${source.name}`);
  }

  function newSource() {
    setSourceId("");
    setSourceName("");
    setDsn("");
    setSearchPath("");
    setSaveMessage("");
  }

  async function deleteSource(source: CatalogSource) {
    if (!window.confirm(`¿Eliminar la persistencia de ${source.name}?`)) {
      return;
    }
    try {
      await apiClient.delete(`/data-sources/${encodeURIComponent(source.id)}`);
      if (sourceId === source.id) newSource();
      await loadSources();
      setSaveMessage(`Persistencia eliminada: ${source.name}`);
    } catch (err) {
      setSaveMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          "No se pudo eliminar la persistencia",
      );
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Catálogo</h2>
        <p className="fin-muted max-w-2xl text-sm">
          Equivale a list-schemas, find-table / list-tables y describe-table.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="fin-field">
          <span>DSN</span>
          <input
            className="input input-bordered input-sm"
            value={dsn}
            onChange={(event) => setDsn(event.target.value)}
          />
        </label>
        <label className="fin-field">
          <span>Nombre asignado</span>
          <input
            className="input input-bordered input-sm"
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
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
        <label className="fin-field">
          <span>Esquemas (orden de búsqueda)</span>
          <input
            className="input input-bordered input-sm"
            value={searchPath}
            onChange={(event) => setSearchPath(event.target.value)}
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={allSchemas}
            onChange={(event) => setAllSchemas(event.target.checked)}
          />
          --all-schemas
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-sm"
          disabled={busy || !canWrite || !dsn.trim() || !sourceName.trim() || !searchPath.trim()}
          onClick={() => void saveDataSource()}
          title={canWrite ? "Guardar fuente" : "Sin permiso de escritura"}
        >
          <Save size={14} /> Guardar DSN
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => void run("schemas")}>
          <Search size={14} /> list-schemas
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => void run("tables")}>
          <Search size={14} /> find-table
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => void run("describe")}>
          <Search size={14} /> describe-table
        </button>
        <button
          className="btn btn-sm"
          disabled={busy || !canWrite || !dsn.trim()}
          onClick={() => void deleteAllDictionaries()}
          title={canWrite ? "Eliminar todos los diccionarios locales del DSN" : "Sin permiso de escritura"}
        >
          <Trash2 size={14} /> Eliminar diccionarios locales
        </button>
      </div>
      {payload ? (
        <CatalogPayloadView
          payload={payload}
          canWrite={canWrite}
          savingKey={savingKey}
          onSave={saveDescription}
          onDelete={deleteDescription}
        />
      ) : null}
      <section className="space-y-3 rounded-lg border bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Persistencias de catálogo</h3>
          <div className="flex gap-2">
            <input
              className="input input-bordered input-sm"
              placeholder="Buscar por nombre o DSN"
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value);
                void loadSources(event.target.value);
              }}
            />
            <button className="btn btn-sm" type="button" onClick={newSource}>
              <Plus size={14} /> Nueva
            </button>
          </div>
        </div>
        <div className="overflow-auto rounded-lg border">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DSN</th>
                <th>Esquemas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.name}</td>
                  <td className="font-code">{source.dsn}</td>
                  <td className="font-code">{source.searchPath.join(",")}</td>
                  <td className="flex gap-1">
                    <button className="btn btn-xs" type="button" onClick={() => editSource(source)} title="Editar">
                      <Edit3 size={13} />
                    </button>
                    <button className="btn btn-xs" type="button" onClick={() => void deleteSource(source)} title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function CatalogPayloadView({
  payload,
  canWrite,
  savingKey,
  onSave,
  onDelete,
}: {
  payload: CatalogPayload;
  canWrite: boolean;
  savingKey: string;
  onSave: (description: CatalogDescription) => void;
  onDelete: (description: CatalogDescription) => void;
}) {
  const descriptions = payload.descriptions;
  if (Array.isArray(descriptions)) {
    return (
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
          <thead>
            <tr>
              <th>Esquema</th>
              <th>Tabla</th>
              <th>Campo</th>
              <th>Descripción</th>
              <th>Tipo</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {descriptions.flatMap((item) => {
              const description = item as CatalogDescription;
              const rows = description.columns.length > 0 ? description.columns : [{}];
              return rows.map((column, columnIndex) => (
                <tr key={`${description.schema}.${description.table}.${columnIndex}`}>
                  <td className="font-code">{description.schema}</td>
                  <td className="font-code">{description.table}</td>
                  <td className="font-code">{String(column.columnName ?? "")}</td>
                  <td>{String(column.description ?? "") || "—"}</td>
                  <td className="font-code">{String(column.dataType ?? "")}</td>
                  <td>
                    {columnIndex === 0 ? (
                      <div className="flex gap-1">
                        <button
                          className="btn btn-xs"
                          disabled={!canWrite || savingKey !== ""}
                          onClick={() => onSave(description)}
                          title={canWrite ? "Guardar diccionario" : "Sin permiso de escritura"}
                        >
                          <Save size={13} />
                          {savingKey === `${description.schema}.${description.table}`
                            ? "Guardando"
                            : "Guardar"}
                        </button>
                        <button
                          className="btn btn-xs"
                          disabled={!canWrite || savingKey !== ""}
                          onClick={() => onDelete(description)}
                          title={canWrite ? "Eliminar diccionario local" : "Sin permiso de escritura"}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const columns = payload.columns;
  if (Array.isArray(columns)) {
    const description: CatalogDescription = {
      schema: String(payload.schema ?? ""),
      table: String(payload.table ?? ""),
      tableDescription: String(payload.tableDescription ?? ""),
      rowCount: Number(payload.rowCount ?? 0),
      columns: columns as Array<Record<string, unknown>>,
    };
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            className="btn btn-sm"
            disabled={!canWrite || savingKey !== "" || !description.schema || !description.table}
            onClick={() => onSave(description)}
            title={canWrite ? "Guardar diccionario" : "Sin permiso de escritura"}
          >
            <Save size={14} />
            {savingKey === `${description.schema}.${description.table}`
              ? "Guardando"
              : "Guardar diccionario"}
          </button>
          <button
            className="btn btn-sm"
            disabled={!canWrite || savingKey !== "" || !description.schema || !description.table}
            onClick={() => onDelete(description)}
            title={canWrite ? "Eliminar diccionario local" : "Sin permiso de escritura"}
          >
            <Trash2 size={14} /> Eliminar diccionario
          </button>
        </div>
        <div className="max-h-[28rem] overflow-auto rounded-lg border">
          <table className="table table-xs table-pin-rows">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Longitud</th>
                <th>Escala</th>
                <th>Nulo</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => {
                const row = column as {
                  columnName?: string;
                  description?: string;
                  dataType?: string;
                  length?: string;
                  scale?: string;
                  nullable?: string;
                };
                return (
                  <tr key={row.columnName}>
                    <td className="font-code">{row.columnName}</td>
                    <td>{row.description || "—"}</td>
                    <td className="font-code">{row.dataType}</td>
                    <td>{row.length}</td>
                    <td>{row.scale}</td>
                    <td>{row.nullable}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const schemas = payload.schemas;
  if (Array.isArray(schemas)) {
    return (
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
          <thead>
            <tr>
              <th>Esquema</th>
              <th>Prioridad</th>
              <th>Presente en catálogo</th>
            </tr>
          </thead>
          <tbody>
            {schemas.map((schema, index) => {
              const row = schema as {
                schema?: string;
                priority?: number;
                presentInCatalog?: boolean;
              };
              return (
                <tr key={row.schema ?? index}>
                  <td className="font-code">{row.schema}</td>
                  <td>{row.priority}</td>
                  <td>{row.presentInCatalog ? "Sí" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const tables = payload.tables;
  if (Array.isArray(tables)) {
    return (
      <div className="max-h-[28rem] overflow-auto rounded-lg border">
        <table className="table table-xs table-pin-rows">
          <thead>
            <tr>
              <th>Esquema</th>
              <th>Tabla</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((tableRow, index) => {
              const row = tableRow as {
                schema?: string;
                table?: string;
                tableType?: string;
              };
              return (
                <tr key={`${row.schema ?? ""}.${row.table ?? index}`}>
                  <td className="font-code">{row.schema}</td>
                  <td className="font-code">{row.table}</td>
                  <td>{row.tableType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="font-code max-h-[28rem] overflow-auto rounded-lg border bg-slate-50 p-3 text-xs">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
