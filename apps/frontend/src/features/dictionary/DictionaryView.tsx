import { useState } from "react";
import { usePermissions } from "../../auth/usePermissions";
import { DictionaryPanel } from "../compare/DictionaryPanel";

const JOBS_MODULE = "JOBS_CONFIG";

export function DictionaryView() {
  const { canWrite } = usePermissions(JOBS_MODULE);
  const [dsn, setDsn] = useState("AZ7DB");
  const [schema, setSchema] = useState("AZBASWQA");
  const [table, setTable] = useState("ACCTX");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Diccionario de datos</h2>
        <p className="fin-muted max-w-2xl text-sm">
          Primero se lee el catálogo vivo (IBM i / Db2). Usted marca los campos clave y
          guarda el diccionario en SQLite. En la comparación, si ya existe en SQLite se
          usa esa copia (descripciones y claves); si no, se vuelve a consultar el catálogo.
        </p>
      </div>

      <ol className="grid gap-2 text-sm md:grid-cols-3">
        <li className="rounded-xl border border-[color:var(--line)] bg-white p-3">
          <p className="fin-primary text-[10px] font-semibold uppercase">Paso 1</p>
          <p className="font-semibold">Cargar catálogo</p>
          <p className="fin-muted text-xs">DSN, esquema y tabla, luego «Cargar desde catálogo».</p>
        </li>
        <li className="rounded-xl border border-[color:var(--line)] bg-white p-3">
          <p className="fin-primary text-[10px] font-semibold uppercase">Paso 2</p>
          <p className="font-semibold">Elegir claves</p>
          <p className="fin-muted text-xs">Checkbox «Clave» en cada campo que identifica la fila.</p>
        </li>
        <li className="rounded-xl border border-[color:var(--line)] bg-white p-3">
          <p className="fin-primary text-[10px] font-semibold uppercase">Paso 3</p>
          <p className="font-semibold">Guardar en SQLite</p>
          <p className="fin-muted text-xs">Queda en la base local para los próximos compares.</p>
        </li>
      </ol>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="fin-field">
          <span>DSN</span>
          <input
            className="input input-bordered input-sm"
            value={dsn}
            onChange={(event) => setDsn(event.target.value)}
          />
        </label>
        <label className="fin-field">
          <span>Esquema</span>
          <input
            className="input input-bordered input-sm"
            value={schema}
            onChange={(event) => setSchema(event.target.value)}
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

      <DictionaryPanel
        dsn={dsn}
        schema={schema}
        table={table}
        canWrite={canWrite}
        autoLoad={false}
      />
    </section>
  );
}
