import { LogOut } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";

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
        <p className="text-xs font-semibold leading-tight">{displayName}</p>
        <button
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
