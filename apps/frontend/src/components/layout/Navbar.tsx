import { LogOut, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { CURRENT_RELEASE } from "../../release";

export function Navbar() {
  const { displayName, logout } = useAuth();

  return (
    <header className="fin-panel mb-3 flex flex-col gap-2 rounded-2xl border px-4 py-2.5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="fin-muted text-[10px] uppercase tracking-[0.18em]">
          DELTACORE
        </p>
        <h1 className="text-lg font-bold leading-tight">
          Reconciliación de metadatos y datos
        </h1>
      </div>
      <div className="flex items-center gap-2 pb-0.5">
        <Link
          to="/release"
          className="btn btn-ghost btn-xs gap-1 text-[color:var(--brand)]"
          aria-label={`Ver cambios de la release ${CURRENT_RELEASE.version}`}
        >
          <Sparkles size={13} />
          v{CURRENT_RELEASE.version}
        </Link>
        <p className="text-xs font-semibold leading-tight">{displayName}</p>
        <button
          id="btnView_session_logout"
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => void logout()}
        >
          <LogOut size={14} />
          Salir
        </button>
      </div>
    </header>
  );
}
