import { BookMarked, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../auth/api.client";
import type { ColumnInfo } from "./CompareResult";

export type DictionaryRecord = {
  origin: "sqlite" | "catalog" | "missing";
  schema: string;
  table: string;
  sourceDsn?: string;
  columns: Array<ColumnInfo & { isKey?: boolean; dataType?: string }>;
  keyColumns: string[];
};

type Props = {
  dsn: string;
  schema: string;
  table: string;
  canWrite: boolean;
  autoLoad?: boolean;
  onLoaded?: (dictionary: DictionaryRecord) => void;
};

export function DictionaryPanel({
  dsn,
  schema,
  table,
  canWrite,
  autoLoad = true,
  onLoaded,
}: Props) {
  const [origin, setOrigin] = useState<DictionaryRecord["origin"]>("missing");
  const [columns, setColumns] = useState<DictionaryRecord["columns"]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load(preferCatalog = false) {
    if (!table.trim()) {
      setMessage("Indique el nombre de la tabla.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
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
      onLoaded?.(data);
      if (data.origin === "sqlite") {
        setMessage("Diccionario leído desde SQLite. Puede ajustar claves y volver a guardar.");
      } else if (data.columns.length > 0) {
        setMessage("Catálogo vivo. Marque las claves y pulse Guardar en SQLite.");
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
      schema,
      table,
      columns: next,
      keyColumns: next.filter((column) => column.isKey).map((column) => column.columnName),
    });
  }

  function toggleKey(columnName: string) {
    publish(
      columns.map((column) =>
        column.columnName === columnName ? { ...column, isKey: !column.isKey } : column,
      ),
    );
  }

  async function save() {
    if (!canWrite || !schema.trim() || !table.trim()) {
      setMessage("Indique esquema y tabla para guardar en SQLite.");
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
        schema: schema.trim(),
        table: table.trim(),
        sourceDsn: dsn,
        columns: columns.map((column) => ({
          ...column,
          isKey: Boolean(column.isKey),
        })),
      });
      setOrigin("sqlite");
      setColumns(response.data.columns);
      onLoaded?.(response.data);
      setMessage(
        `Guardado en SQLite (${response.data.table}). Claves: ${response.data.keyColumns.join(", ")}`,
      );
    } catch (err) {
      setMessage(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          (err instanceof Error ? err.message : "No se pudo guardar en SQLite"),
      );
    } finally {
      setBusy(false);
    }
  }

  const sourceLabel =
    origin === "sqlite"
      ? "Origen: SQLite (local)"
      : origin === "catalog"
        ? "Origen: catálogo vivo (aún no está en SQLite)"
        : "Origen: sin datos";

  return (
    <section className="rounded-xl border-2 border-[color:var(--brand-border)] bg-[color:var(--brand-soft)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold">
            <BookMarked size={16} />
            Guardar diccionario en SQLite
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
            disabled={busy || !table.trim()}
            onClick={() => void load(false)}
          >
            <RefreshCw size={14} />
            {busy ? "Cargando…" : "Buscar en SQLite / catálogo"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy || !table.trim()}
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
            Guardar en SQLite
          </button>
        </div>
      </div>
      {message ? (
        <p className="mb-3 rounded-lg border border-[color:var(--line)] bg-white px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}
      <div className="max-h-[22rem] overflow-auto rounded-lg border bg-white">
        <table className="table table-sm">
          <thead>
            <tr>
              <th className="w-20">Clave</th>
              <th>Campo</th>
              <th>Descripción (diccionario)</th>
              <th>Tipo</th>
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
              </tr>
            ))}
            {columns.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center">
                  <p className="font-semibold">Aún no hay columnas</p>
                  <p className="fin-muted mx-auto mt-1 max-w-md text-sm">
                    Pulse «Cargar desde catálogo» para traer el diccionario de Db2, marque
                    las claves y «Guardar en SQLite».
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
