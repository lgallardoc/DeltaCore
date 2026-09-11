import { BookMarked, Edit3, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import type { DictionaryListState, SmartBackState } from "../../navigation/smartBack";
import { formatNumber } from "../../utils/format";
import type { ColumnInfo } from "./CompareResult";

export type DictionaryRecord = {
  origin: "saved" | "catalog" | "missing";
  schema: string;
  table: string;
  sourceDsn?: string;
  columns: Array<ColumnInfo & {
    isKey?: boolean;
    dataType?: string;
    length?: string;
    scale?: string;
    nullable?: string;
  }>;
  keyColumns: string[];
  tableDescription?: string;
  rowCount?: number;
};

type CatalogTable = {
  schema: string;
  table: string;
  tableType?: string;
  tableDescription?: string;
  rowCount?: number;
};

type DictionaryPanelSession = {
  descriptions: DictionaryRecord[];
  tableFilter: string;
  selectedTableKey: string;
  activeSchema: string;
  activeTable: string;
  activeTableDescription: string;
  activeRowCount: number;
  origin: DictionaryRecord["origin"];
  columns: DictionaryRecord["columns"];
};

type Props = {
  dsn: string;
  schema: string;
  table: string;
  canWrite: boolean;
  autoLoad?: boolean;
  autoSaveCatalog?: boolean;
  showColumns?: boolean;
  dictionaryBackState?: DictionaryListState;
  initialSession?: unknown;
  onLoaded?: (dictionary: DictionaryRecord) => void;
};

export function DictionaryPanel({
  dsn,
  schema,
  table,
  canWrite,
  autoLoad = true,
  autoSaveCatalog = false,
  showColumns = true,
  dictionaryBackState,
  initialSession,
  onLoaded,
}: Props) {
  const { notify } = useStatusNotification();
  const restoredSession = parseDictionaryPanelSession(initialSession) ?? readDictionaryPanelSession(dsn);
  const [origin, setOrigin] = useState<DictionaryRecord["origin"]>(restoredSession?.origin ?? "missing");
  const [columns, setColumns] = useState<DictionaryRecord["columns"]>(restoredSession?.columns ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [descriptions, setDescriptions] = useState<DictionaryRecord[]>(restoredSession?.descriptions ?? []);
  const [tableFilter, setTableFilter] = useState(restoredSession?.tableFilter ?? "");
  const [activeSchema, setActiveSchema] = useState(restoredSession?.activeSchema ?? schema);
  const [activeTable, setActiveTable] = useState(restoredSession?.activeTable ?? table);
  const [activeTableDescription, setActiveTableDescription] = useState(restoredSession?.activeTableDescription ?? "");
  const [activeRowCount, setActiveRowCount] = useState(restoredSession?.activeRowCount ?? 0);
  const [selectedTableKey, setSelectedTableKey] = useState(restoredSession?.selectedTableKey ?? "");
  const [savedCount, setSavedCount] = useState(0);

  function currentSession(): DictionaryPanelSession {
    return {
      descriptions,
      tableFilter,
      selectedTableKey,
      activeSchema,
      activeTable,
      activeTableDescription,
      activeRowCount,
      origin,
      columns,
    };
  }

  useEffect(() => {
    sessionStorage.setItem(
      dictionaryPanelSessionKey(dsn),
      JSON.stringify(currentSession()),
    );
  }, [
    activeRowCount,
    activeSchema,
    activeTable,
    activeTableDescription,
    columns,
    descriptions,
    dsn,
    origin,
    selectedTableKey,
    tableFilter,
  ]);

  useEffect(() => {
    if (message) {
      notify(
        message,
        /no se pudo|error|revise|indique|cargue primero|marque al menos/i.test(message)
          ? "error"
          : "info",
      );
    }
  }, [message, notify]);

  function orderedTableCandidates(rows: CatalogTable[]): CatalogTable[] {
    const priority = schema
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const selected = new Map<string, CatalogTable>();
    for (const row of rows) {
      const key = row.table.toUpperCase();
      const current = selected.get(key);
      if (!current || priority.indexOf(row.schema.toUpperCase()) < priority.indexOf(current.schema.toUpperCase())) {
        selected.set(key, row);
      }
    }
    return [...selected.values()].sort((left, right) => {
      const leftPriority = priority.indexOf(left.schema.toUpperCase());
      const rightPriority = priority.indexOf(right.schema.toUpperCase());
      return (leftPriority < 0 ? priority.length : leftPriority) -
        (rightPriority < 0 ? priority.length : rightPriority) ||
        left.table.localeCompare(right.table);
    });
  }

  async function loadCatalogProgressively(preferCatalog = true) {
    const tableNames = table
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const tableResponse = await apiClient.get<{ tables: CatalogTable[] }>("/catalog/tables", {
      params: {
        dsn,
        ...(schema.trim() ? { searchPath: schema.trim() } : {}),
        ...(tableNames.length > 0 ? { table: tableNames.join(",") } : {}),
      },
    });
    const candidates = orderedTableCandidates(tableResponse.data.tables ?? []);
    setDescriptions([]);
    setSavedCount(0);
    setProgress({ current: 0, total: candidates.length });
    const descriptions: DictionaryRecord[] = [];
    for (const [index, candidate] of candidates.entries()) {
      const response = await apiClient.get(preferCatalog ? "/catalog/describe" : "/dictionary", {
        params: {
          dsn,
          table: candidate.table,
          schema: candidate.schema,
          ...(schema.trim() ? { schema: candidate.schema } : {}),
        },
      });
      let data: DictionaryRecord = {
        origin: preferCatalog
          ? "catalog"
          : (String(response.data.origin ?? "missing") as DictionaryRecord["origin"]),
        schema: String(response.data.schema ?? candidate.schema),
        table: String(response.data.table ?? candidate.table),
        sourceDsn: dsn,
        tableDescription: String(
          response.data.tableDescription ?? candidate.tableDescription ?? "",
        ),
        rowCount: Number(response.data.rowCount ?? candidate.rowCount ?? 0),
        columns: (response.data.columns ?? []).map(
          (column: ColumnInfo & { isKey?: boolean }) => ({ ...column, isKey: false }),
        ),
        keyColumns: (response.data.keyColumns ?? []).filter(Boolean),
      };
      if (autoSaveCatalog) {
        if (!canWrite) {
          throw new Error("No tiene permiso para guardar automáticamente.");
        }
        try {
          const savedResponse = await apiClient.put<DictionaryRecord>("/dictionary", {
            schema: data.schema,
            table: data.table,
            tableDescription: data.tableDescription,
            rowCount: data.rowCount,
            sourceDsn: dsn,
            columns: data.columns.map((column) => ({
              ...column,
              isKey: false,
            })),
          });
          data = { ...data, ...savedResponse.data, origin: "saved" };
          setSavedCount((count) => count + 1);
          setMessage(`Guardado automático: ${data.schema}.${data.table}`);
        } catch (error) {
          const detail =
            (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
            (error instanceof Error ? error.message : "error desconocido");
          throw new Error(`No se pudo guardar ${data.schema}.${data.table}: ${detail}`);
        }
      }
      descriptions.push(data);
      setDescriptions([...descriptions]);
      setProgress({ current: index + 1, total: candidates.length });
      if (index === 0) {
        setOrigin(data.origin);
        setColumns(data.columns);
        setActiveSchema(data.schema);
        setActiveTable(data.table);
        setActiveTableDescription(data.tableDescription ?? "");
        setActiveRowCount(data.rowCount ?? 0);
        onLoaded?.(data);
      }
    }
    return descriptions;
  }

  async function load(preferCatalog = false) {
    setBusy(true);
    setMessage(preferCatalog ? "Consultando tablas de los esquemas priorizados…" : "");
    setDescriptions([]);
    setProgress(null);
    try {
      if (!preferCatalog && !table.trim()) {
        const response = await apiClient.get<{ dictionaries: DictionaryRecord[] }>(
          "/dictionary",
          { params: { dsn } },
        );
        const saved = response.data.dictionaries ?? [];
        setDescriptions(saved);
        setProgress({ current: saved.length, total: saved.length });
        const first = saved[0];
        if (first) {
          setOrigin("saved");
          setColumns(first.columns);
          setActiveSchema(first.schema);
          setActiveTable(first.table);
          setActiveTableDescription(first.tableDescription ?? "");
          setActiveRowCount(first.rowCount ?? 0);
          onLoaded?.(first);
          setMessage(`Diccionarios guardados cargados: ${saved.length} tabla(s).`);
        } else {
          setMessage("No hay diccionarios guardados para este catálogo.");
        }
        return;
      }
      if (preferCatalog || !table.trim()) {
        const descriptions = await loadCatalogProgressively(preferCatalog);
        setMessage(
          descriptions.length > 0
            ? `${preferCatalog ? "Catálogo" : "Búsqueda"} cargado: ${descriptions.length} tabla(s).`
            : "No se encontraron tablas para el filtro indicado.",
        );
        return;
      }
      const path = preferCatalog ? "/catalog/describe" : "/dictionary";
      const response = await apiClient.get(path, {
        params: {
          dsn,
          table: table.trim(),
          ...(schema.trim() ? { schema: schema.trim() } : {}),
        },
      });
      const data = preferCatalog
        ? {
            origin: "catalog" as const,
            schema: String(response.data.schema ?? schema),
            table: String(response.data.table ?? table),
            tableDescription: String(response.data.tableDescription ?? ""),
            rowCount: Number(response.data.rowCount ?? 0),
            columns: (response.data.columns ?? []).map(
              (column: ColumnInfo & { isKey?: boolean }) => ({
                ...column,
                isKey: Boolean(column.isKey),
              }),
            ),
            keyColumns: [] as string[],
          }
        : (response.data as DictionaryRecord);
      setOrigin(data.origin);
      setColumns(data.columns);
      setActiveSchema(data.schema);
      setActiveTable(data.table);
      setActiveTableDescription(data.tableDescription ?? "");
      setActiveRowCount(data.rowCount ?? 0);
      onLoaded?.(data);
      if (data.origin === "saved") {
        setMessage("Diccionario guardado previamente. Puede ajustar claves y volver a guardar.");
      } else if (data.columns.length > 0) {
        setMessage("Catálogo vivo. Marque las claves y pulse Guardar.");
      } else {
        setMessage("No hay columnas. Revise DSN, esquema y tabla.");
      }
    } catch (err) {
      setMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo cargar el diccionario"),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  useEffect(() => {
    if (autoLoad && table.trim()) {
      void load(false);
    }
  }, [autoLoad, dsn, schema, table]);

  function publish(next: DictionaryRecord["columns"], nextOrigin = origin) {
    setColumns(next);
    onLoaded?.({
      origin: nextOrigin,
      schema: activeSchema,
      table: activeTable,
      tableDescription: activeTableDescription,
      rowCount: activeRowCount,
      columns: next,
      keyColumns: next.filter((column) => column.isKey).map((column) => column.columnName),
    });
  }

  function editDescription(next: DictionaryRecord) {
    selectDescription(next);
  }

  function selectDescription(next: DictionaryRecord) {
    setSelectedTableKey(`${next.schema}.${next.table}`);
    setOrigin(next.origin);
    setColumns(next.columns);
    setActiveSchema(next.schema);
    setActiveTable(next.table);
    setActiveTableDescription(next.tableDescription ?? "");
    setActiveRowCount(next.rowCount ?? 0);
    onLoaded?.(next);
  }

  function toggleKey(columnName: string) {
    publish(
      columns.map((column) =>
        column.columnName === columnName ? { ...column, isKey: !column.isKey } : column,
      ),
    );
  }

  async function deleteDictionary(dictionary: DictionaryRecord) {
    const key = `${dictionary.schema}.${dictionary.table}`;
    if (!window.confirm(`¿Eliminar el diccionario local de ${key}?`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiClient.delete(
        `/dictionary/${encodeURIComponent(dictionary.schema)}/${encodeURIComponent(dictionary.table)}`,
      );
      setDescriptions((current) =>
        current.filter((item) => `${item.schema}.${item.table}` !== key),
      );
      if (selectedTableKey === key) {
        setSelectedTableKey("");
        setColumns([]);
        setActiveTableDescription("");
        setActiveRowCount(0);
      }
      setMessage(`Diccionario local eliminado: ${key}`);
    } catch (err) {
      setMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo eliminar el diccionario"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllDictionaries() {
    if (!dsn.trim() || !window.confirm(`¿Eliminar todos los diccionarios locales del DSN ${dsn}?`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await apiClient.delete<{ deleted: number }>("/dictionary", {
        params: { dsn },
      });
      setDescriptions([]);
      setSelectedTableKey("");
      setColumns([]);
      setActiveTableDescription("");
      setActiveRowCount(0);
      setMessage(`Diccionarios locales eliminados: ${formatNumber(response.data.deleted)}`);
    } catch (err) {
      setMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudieron eliminar los diccionarios"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!canWrite || !activeSchema.trim() || !activeTable.trim()) {
      setMessage("Indique esquema y tabla para guardar el diccionario.");
      return;
    }
    if (columns.length === 0) {
      setMessage("Cargue primero el catálogo.");
      return;
    }
    const keyCount = columns.filter((column) => column.isKey).length;
    if (keyCount === 0) {
      setMessage("Marque al menos un campo como clave antes de guardar.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await apiClient.put<DictionaryRecord>("/dictionary", {
        schema: activeSchema.trim(),
        table: activeTable.trim(),
        tableDescription: activeTableDescription,
        rowCount: activeRowCount,
        sourceDsn: dsn,
        columns: columns.map((column) => ({
          ...column,
          isKey: Boolean(column.isKey),
        })),
      });
      setOrigin("saved");
      setColumns(response.data.columns);
      setActiveSchema(response.data.schema);
      setActiveTable(response.data.table);
      setActiveTableDescription(response.data.tableDescription ?? activeTableDescription);
      setActiveRowCount(response.data.rowCount ?? activeRowCount);
      onLoaded?.(response.data);
      setMessage(
        `Diccionario guardado (${response.data.table}). Claves: ${response.data.keyColumns.join(", ")}`,
      );
    } catch (err) {
      setMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo guardar el diccionario"),
      );
    } finally {
      setBusy(false);
    }
  }

  const sourceLabel =
    origin === "saved"
      ? "Origen: guardado local"
        : origin === "catalog"
        ? "Origen: catálogo vivo (aún no está guardado)"
        : "Origen: sin datos";

  return (
    <section className="rounded-xl border-2 border-[color:var(--brand-border)] bg-[color:var(--brand-soft)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold">
            <BookMarked size={16} />
            Guardar diccionario
          </h3>
          <p className="fin-muted mt-1 max-w-xl text-xs">
            {sourceLabel}. Las descripciones alimentan los headers del compare; los
            checkboxes definen la clave de fila a fila.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void load(false)}
          >
            <RefreshCw size={14} />
            {busy ? "Cargando…" : "Buscar guardado / catálogo"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => void load(true)}
          >
            <RefreshCw size={14} />
            Cargar desde catálogo
          </button>
          <button
            type="button"
            className="btn fin-btn-primary btn-sm"
            disabled={!canWrite || busy || columns.length === 0}
            onClick={() => void save()}
          >
            <Save size={14} />
            Guardar diccionario
          </button>
        </div>
      </div>
      {progress ? (
        <div className="space-y-1" role="status">
          <div className="flex justify-between text-xs">
            <span>Buscando descripciones por prioridad de esquema</span>
            <span>{formatNumber(progress.current)} / {formatNumber(progress.total)}{autoSaveCatalog ? ` · guardados ${formatNumber(savedCount)}` : ""}</span>
          </div>
          <progress
            className="progress progress-primary w-full"
            value={progress.current}
            max={Math.max(progress.total, 1)}
          />
        </div>
      ) : null}
      {descriptions.length > 0 ? (
        <div className="space-y-2 rounded-lg border bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Tablas encontradas ({descriptions.length})</p>
            <div className="flex flex-wrap gap-2">
              <input
                className="input input-bordered input-sm"
                placeholder="Filtrar tablas"
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={!canWrite || busy}
                onClick={() => void deleteAllDictionaries()}
                title={canWrite ? "Eliminar todos los diccionarios locales del DSN" : "Sin permiso de escritura"}
              >
                <Trash2 size={14} /> Eliminar todos
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-auto rounded border">
            <table className="table table-xs">
              <thead>
                <tr>
                  <th>Esquema</th>
                  <th>Tabla</th>
                  <th>Descripción</th>
                  <th>Registros</th>
                  <th>Columnas</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {descriptions
                  .filter((item) =>
                    `${item.schema}.${item.table}`
                      .toUpperCase()
                      .includes(tableFilter.trim().toUpperCase()),
                  )
                  .map((item) => (
                    <tr
                      key={`${item.schema}.${item.table}`}
                      aria-selected={selectedTableKey === `${item.schema}.${item.table}`}
                      className={
                        selectedTableKey === `${item.schema}.${item.table}`
                          ? "bg-[color:var(--brand-soft)] outline outline-1 outline-[color:var(--brand)]"
                          : "cursor-pointer hover:bg-[color:var(--soft)]"
                      }
                      onClick={() => selectDescription(item)}
                    >
                      <td className="font-code">{item.schema}</td>
                      <td className="font-code">{item.table}</td>
                      <td>{item.tableDescription || "—"}</td>
                      <td>{item.rowCount == null ? "—" : formatNumber(item.rowCount)}</td>
                      <td>{formatNumber(item.columns.length)}</td>
                      <td>
                        <div className="flex gap-1">
                          <Link
                            className="btn btn-xs"
                            to={`/dictionary/edit?dsn=${encodeURIComponent(dsn)}&schema=${encodeURIComponent(item.schema)}&table=${encodeURIComponent(item.table)}`}
                            state={
                              dictionaryBackState
                                ? ({
                                    from: "/dictionary",
                                    dictionary: dictionaryBackState,
                                    dictionaryPanel: currentSession(),
                                  } satisfies SmartBackState)
                                : undefined
                            }
                            onClick={() => editDescription(item)}
                          >
                            <Edit3 size={13} /> Editar
                          </Link>
                          <button
                            type="button"
                            className="btn btn-xs"
                            disabled={!canWrite || busy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteDictionary(item);
                            }}
                            title={canWrite ? `Eliminar ${item.schema}.${item.table}` : "Sin permiso de escritura"}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {showColumns ? (
        <div className="max-h-[22rem] overflow-auto rounded-lg border bg-white">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-20">Clave</th>
                <th>Campo</th>
                <th>Descripción (diccionario)</th>
                <th>Tipo</th>
                <th>Longitud</th>
                <th>Escala</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.columnName} className={column.isKey ? "bg-[color:var(--brand-soft)]" : ""}>
                  <td>
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={Boolean(column.isKey)}
                        disabled={!canWrite}
                        onChange={() => toggleKey(column.columnName)}
                      />
                      PK
                    </label>
                  </td>
                  <td className="font-code">{column.columnName}</td>
                  <td>
                    <input
                      className="input input-bordered input-sm w-full"
                      value={column.description ?? ""}
                      disabled={!canWrite}
                      onChange={(event) => {
                        const description = event.target.value;
                        publish(
                          columns.map((item) =>
                            item.columnName === column.columnName
                              ? { ...item, description }
                              : item,
                          ),
                        );
                      }}
                    />
                  </td>
                  <td className="font-code">{column.dataType}</td>
                  <td className="font-code">{column.length || "—"}</td>
                  <td className="font-code">{column.scale || "—"}</td>
                </tr>
              ))}
              {columns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center">
                    <p className="font-semibold">Aún no hay columnas</p>
                    <p className="fin-muted mx-auto mt-1 max-w-md text-sm">
                      Pulse «Cargar desde catálogo» para traer el diccionario de Db2, marque
                      las claves y «Guardar diccionario».
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function dictionaryPanelSessionKey(dsn: string): string {
  return `deltacore.dictionary-panel.${dsn.trim().toUpperCase()}`;
}

function readDictionaryPanelSession(dsn: string): DictionaryPanelSession | null {
  try {
    const stored = sessionStorage.getItem(dictionaryPanelSessionKey(dsn));
    if (!stored) {
      return null;
    }
    return parseDictionaryPanelSession(JSON.parse(stored));
  } catch {
    return null;
  }
}

function parseDictionaryPanelSession(value: unknown): DictionaryPanelSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<DictionaryPanelSession>;
  if (!Array.isArray(parsed.descriptions) || !Array.isArray(parsed.columns)) {
    return null;
  }
  return {
    descriptions: parsed.descriptions,
    tableFilter: typeof parsed.tableFilter === "string" ? parsed.tableFilter : "",
    selectedTableKey: typeof parsed.selectedTableKey === "string" ? parsed.selectedTableKey : "",
    activeSchema: typeof parsed.activeSchema === "string" ? parsed.activeSchema : "",
    activeTable: typeof parsed.activeTable === "string" ? parsed.activeTable : "",
    activeTableDescription:
      typeof parsed.activeTableDescription === "string" ? parsed.activeTableDescription : "",
    activeRowCount: typeof parsed.activeRowCount === "number" ? parsed.activeRowCount : 0,
    origin:
      parsed.origin === "saved" || parsed.origin === "catalog" || parsed.origin === "missing"
        ? parsed.origin
        : "missing",
    columns: parsed.columns,
  };
}
