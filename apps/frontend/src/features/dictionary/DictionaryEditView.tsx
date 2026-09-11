import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { usePermissions } from "../../auth/usePermissions";
import type { SmartBackState } from "../../navigation/smartBack";
import { DictionaryPanel } from "../compare/DictionaryPanel";

export function DictionaryEditView() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { canWrite } = usePermissions("JOBS_CONFIG");
  const dsn = params.get("dsn") ?? "";
  const schema = params.get("schema") ?? "";
  const table = params.get("table") ?? "";
  const backState = (location.state as SmartBackState | null) ?? {};

  function returnToDictionary() {
    navigate(backState.from ?? "/dictionary", {
      state: backState.dictionary
        ? ({
            dictionary: backState.dictionary,
            dictionaryPanel: backState.dictionaryPanel,
          } satisfies SmartBackState)
        : undefined,
    });
  }

  return (
    <section className="space-y-4">
      <button type="button" className="btn btn-sm" onClick={returnToDictionary}>
        <ArrowLeft size={14} /> Volver
      </button>
      <div>
        <h2 className="text-2xl font-bold">Editar diccionario</h2>
        <p className="fin-muted text-sm">{schema}.{table}</p>
      </div>
      <DictionaryPanel
        dsn={dsn}
        schema={schema}
        table={table}
        canWrite={canWrite}
        autoLoad
      />
    </section>
  );
}