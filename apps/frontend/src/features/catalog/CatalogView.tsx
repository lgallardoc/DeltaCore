import { useState } from "react";
import { Search } from "lucide-react";
import { apiClient } from "../../auth/api.client";

type CatalogPayload = Record<string, unknown>;

export function CatalogView() {
  const [dsn, setDsn] = useState("AZ7DB");
  const [table, setTable] = useState("ACCTX");
  const [schema, setSchema] = useState("");
  const [allSchemas, setAllSchemas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<CatalogPayload | null>(null);

  async function run(kind: "schemas" | "tables" | "describe") {
    setBusy(true);
    setError("");
    try {
      const params: Record<string, string> = { dsn };
      if (kind === "tables") {
        if (table) params.table = table;
        if (allSchemas) params.allSchemas = "1";
      }
      if (kind === "describe") {
        params.table = table;
        if (schema) params.schema = schema;
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
          <span>Tabla</span>
          <input
            className="input input-bordered input-sm"
            value={table}
            onChange={(event) => setTable(event.target.value)}
          />
        </label>
        <label className="fin-field">
          <span>Esquema (describe-table)</span>
          <input
            className="input input-bordered input-sm"
            value={schema}
            onChange={(event) => setSchema(event.target.value)}
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
        <button className="btn btn-sm" disabled={busy} onClick={() => void run("schemas")}>
          <Search size={14} /> list-schemas
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => void run("tables")}>
          <Search size={14} /> find-table
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={() => void run("describe")}>
          <Search size={14} /> describe-table
        </button>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {payload ? <CatalogPayloadView payload={payload} /> : null}
    </section>
  );
}

function CatalogPayloadView({ payload }: { payload: CatalogPayload }) {
  const columns = payload.columns;
  if (Array.isArray(columns) && columns.length > 0) {
    return (
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
    );
  }
  return (
    <pre className="font-code max-h-[28rem] overflow-auto rounded-lg border bg-slate-50 p-3 text-xs">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
