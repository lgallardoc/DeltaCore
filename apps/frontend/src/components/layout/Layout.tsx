import { Activity, BookMarked, ClipboardList, Database, GitCompare, ShieldCheck, Users } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { apiClient } from "../../auth/api.client";
import { usePermissions } from "../../auth/usePermissions";
import { Navbar } from "./Navbar";

const NAV_ITEMS = [
  { to: "/compare", label: "Comparar", icon: GitCompare, moduleName: "COMPARE" },
  { to: "/dictionary", label: "Diccionario", icon: BookMarked, moduleName: "DICTIONARY" },
  { to: "/catalog", label: "Catálogo", icon: Database, moduleName: "CATALOG" },
  { to: "/jobs", label: "Jobs", icon: ClipboardList, moduleName: "JOBS_CONFIG" },
  { to: "/profiles", label: "Perfiles", icon: ShieldCheck, moduleName: "PROFILES" },
  { to: "/users", label: "Usuarios", icon: Users, moduleName: "USERS" },
  { to: "/activity", label: "Actividad", icon: Activity, moduleName: "USERS" },
] as const;

export function Layout() {
  const location = useLocation();
  const lastTrackedLocation = useRef("");

  useEffect(() => {
    const page = trackedPage(location.pathname);
    if (!page || lastTrackedLocation.current === location.key) return;
    lastTrackedLocation.current = location.key;
    void apiClient.post("/usage-events", { page }).catch(() => undefined);
  }, [location.key, location.pathname]);

  return (
    <div className="fin-app-bg flex h-screen flex-col overflow-hidden text-slate-900">
      <div className="mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col p-3 md:p-4">
        <Navbar />
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden md:grid-cols-[184px_1fr]">
          <aside className="fin-panel overflow-y-auto rounded-2xl border p-3 backdrop-blur">
            <p className="fin-primary text-[10px] font-semibold uppercase tracking-wide">
              Navegación
            </p>
            <nav className="mt-2 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => <PermissionNavItem key={item.to} item={item} active={location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)} />)}
            </nav>
          </aside>
          <main className="fin-panel-soft flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border p-3 backdrop-blur">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-1">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function trackedPage(pathname: string): string | undefined {
  if (pathname.startsWith("/compare")) return "/compare";
  if (pathname.startsWith("/dictionary")) return "/dictionary";
  if (pathname.startsWith("/catalog")) return "/catalog";
  if (pathname.startsWith("/jobs")) return "/jobs";
  if (pathname.startsWith("/profiles")) return "/profiles";
  if (pathname.startsWith("/users")) return "/users";
  if (pathname.startsWith("/activity")) return "/activity";
  if (pathname.startsWith("/release")) return "/release";
  return undefined;
}

function PermissionNavItem({
  item,
  active,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
}) {
  const { canView, isResolved } = usePermissions(item.moduleName);
  if (!isResolved || !canView) {
    return null;
  }
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={[
        "rounded-lg border px-2 py-1.5 text-xs transition",
        active
          ? "border-[color:var(--brand-border)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]"
          : "border-[color:var(--line)] bg-white hover:border-[color:var(--brand-border)] hover:bg-[color:var(--brand-soft)]",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        <Icon size={14} />
        {item.label}
      </span>
    </Link>
  );
}
