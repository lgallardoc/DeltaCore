import {
  Activity,
  CalendarDays,
  ChartColumnIncreasing,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogIn,
  MousePointerClick,
  Search,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDeferredValue, useEffect, useState } from "react";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";

type User = { id: string; email: string };
type AuditEntry = {
  id: string;
  userId: string;
  email: string;
  action: string;
  timestamp: string;
  payloadJson: string | null;
};
type Analytics = {
  summary: { events: number; sessions: number; pageViews: number; actions: number; activeUsers: number; returningUsers: number; failedActions: number };
  comparison: { sessions: number; pageViews: number; actions: number; activeUsers: number; returningUsers: number; failedActions: number };
  daily: Array<{ date: string; sessions: number; pageViews: number; actions: number; activeUsers: number }>;
  modules: Array<{ module: string; pageViews: number; actions: number; activeUsers: number; failedActions: number }>;
  users: Array<{ userId: string; email: string; sessions: number; pageViews: number; actions: number; failedActions: number; activeDays: number; lastSeen: string }>;
};
type HistoryPage = { entries: AuditEntry[]; total: number; offset: number; limit: number };
type View = "overview" | "users" | "history";
type Period = "7" | "30" | "90" | "custom";

const VIEW_TABS: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Resumen", icon: ChartColumnIncreasing },
  { id: "users", label: "Usuarios", icon: Users },
  { id: "history", label: "Historial", icon: Clock3 },
];
const HISTORY_PAGE_SIZE = 50;

export function ActivityView() {
  const { notify } = useStatusNotification();
  const [users, setUsers] = useState<User[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [period, setPeriod] = useState<Period>("30");
  const [view, setView] = useState<View>("overview");
  const [from, setFrom] = useState(() => offsetDate(-29));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [historySearch, setHistorySearch] = useState("");
  const deferredHistorySearch = useDeferredValue(historySearch);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void apiClient.get<{ users: User[] }>("/admin/rbac")
      .then((response) => {
        if (!cancelled) setUsers(response.data.users);
      })
      .catch((error: unknown) => {
        if (!cancelled) notify(errorMessage(error), "error");
      });
    return () => { cancelled = true; };
  }, [notify]);

  useEffect(() => {
    if (!isValidRange(from, to)) return;
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ from, to });
    if (selectedUserId) query.set("userId", selectedUserId);
    void apiClient.get<Analytics>(`/admin/audit-analytics?${query.toString()}`)
      .then((response) => {
        if (!cancelled) setAnalytics(response.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) notify(errorMessage(error), "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [from, notify, selectedUserId, to]);

  useEffect(() => {
    if (view !== "history" || !isValidRange(from, to)) return;
    let cancelled = false;
    setHistoryLoading(true);
    const query = new URLSearchParams({
      from,
      to,
      offset: String(historyOffset),
      limit: String(HISTORY_PAGE_SIZE),
      search: deferredHistorySearch,
    });
    if (selectedUserId) query.set("userId", selectedUserId);
    void apiClient.get<HistoryPage>(`/admin/audit-history?${query.toString()}`)
      .then((response) => {
        if (!cancelled) setHistory(response.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) notify(errorMessage(error), "error");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [deferredHistorySearch, from, historyOffset, notify, selectedUserId, to, view]);

  function choosePeriod(nextPeriod: Period) {
    setPeriod(nextPeriod);
    setHistoryOffset(0);
    if (nextPeriod === "custom") return;
    setFrom(offsetDate(-(Number(nextPeriod) - 1)));
    setTo(localDate(new Date()));
  }

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Activity size={22} /> Actividad
          </h2>
          <p className="fin-muted text-sm">Accesos y uso del proyecto por periodo.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="fin-field w-full max-w-xs">
            <span>Usuario</span>
            <select className="select select-bordered select-sm" value={selectedUserId} onChange={(event) => { setSelectedUserId(event.target.value); setHistoryOffset(0); }}>
              <option value="">Todos los usuarios</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
            </select>
          </label>
          <div className="join" aria-label="Periodo de análisis">
            {(["7", "30", "90", "custom"] as Period[]).map((option) => (
              <button key={option} type="button" className={`btn btn-sm join-item ${period === option ? "fin-btn-primary" : ""}`} aria-pressed={period === option} onClick={() => choosePeriod(option)}>
                {option === "custom" ? <CalendarDays size={14} /> : `${option} d`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {period === "custom" ? (
        <div className="flex flex-wrap items-end gap-3 border-b pb-3">
          <label className="fin-field w-40"><span>Desde</span><input className="input input-bordered input-sm" type="date" value={from} max={to} onChange={(event) => { setFrom(event.target.value); setHistoryOffset(0); }} /></label>
          <label className="fin-field w-40"><span>Hasta</span><input className="input input-bordered input-sm" type="date" value={to} min={from} max={localDate(new Date())} onChange={(event) => { setTo(event.target.value); setHistoryOffset(0); }} /></label>
        </div>
      ) : null}

      <div role="tablist" aria-label="Vistas de actividad" className="flex gap-1 border-b">
        {VIEW_TABS.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} className={`flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${view === tab.id ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-transparent fin-muted hover:text-[color:var(--ink)]"}`} onClick={() => setView(tab.id)}><Icon size={15} /> {tab.label}</button>;
        })}
        <span className="fin-muted ml-auto self-center text-xs">{loading ? "Actualizando..." : `${formatDate(from)} – ${formatDate(to)}`}</span>
      </div>

      {!isValidRange(from, to) ? <p className="fin-muted py-8 text-center">Selecciona un rango de fechas válido.</p>
        : analytics ? <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {view === "overview" ? <Overview analytics={analytics} from={from} to={to} /> : null}
          {view === "users" ? <UsersView analytics={analytics} /> : null}
          {view === "history" ? <HistoryView
            history={history}
            loading={historyLoading}
            search={historySearch}
            onSearch={(value) => { setHistorySearch(value); setHistoryOffset(0); }}
            onPageChange={setHistoryOffset}
          /> : null}
        </div>
          : loading ? <p className="fin-muted py-8 text-center">Cargando actividad...</p>
            : <p className="fin-muted py-8 text-center">No hay datos para este periodo.</p>}
    </section>
  );
}

function Overview({ analytics, from, to }: { analytics: Analytics; from: string; to: string }) {
  const { summary, comparison } = analytics;
  const successRate = summary.actions
    ? ((summary.actions - summary.failedActions) / summary.actions) * 100
    : 0;
  const previousSuccessRate = comparison.actions
    ? ((comparison.actions - comparison.failedActions) / comparison.actions) * 100
    : 0;
  const metrics = [
    { label: "Sesiones", value: summary.sessions, previous: comparison.sessions, icon: LogIn, tone: "text-emerald-700" },
    { label: "Usuarios activos", value: summary.activeUsers, previous: comparison.activeUsers, icon: Users, tone: "text-sky-700" },
    { label: "Usuarios recurrentes", value: summary.returningUsers, previous: comparison.returningUsers, icon: Clock3, tone: "text-teal-700" },
    { label: "Páginas vistas", value: summary.pageViews, previous: comparison.pageViews, icon: Activity, tone: "text-amber-700" },
    { label: "Operaciones", value: summary.actions, previous: comparison.actions, icon: MousePointerClick, tone: "text-blue-700" },
    { label: "Éxito", value: `${successRate.toFixed(1)}%`, delta: `${signed((successRate - previousSuccessRate).toFixed(1))} pp vs. anterior`, icon: ChartColumnIncreasing, tone: "text-teal-700" },
    { label: "Errores", value: summary.failedActions, previous: comparison.failedActions, icon: CircleAlert, tone: "text-rose-700" },
  ];
  const trend = fillDaily(analytics.daily, from, to);

  return (
    <>
      <dl className="grid grid-cols-2 border-y md:grid-cols-4 2xl:grid-cols-7">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const change = "previous" in metric
            ? periodChange(metric.value as number, metric.previous ?? 0)
            : metric.delta;
          return (
            <div key={metric.label} className="border-b p-3 md:border-b-0 md:border-r last:md:border-r-0">
              <dt className="fin-muted flex items-center gap-2 text-xs font-semibold">
                <Icon size={15} className={metric.tone} /> {metric.label}
              </dt>
              <dd className={`mt-1 text-2xl font-bold tabular-nums ${metric.tone}`}>
                {typeof metric.value === "number" ? metric.value.toLocaleString("es-CL") : metric.value}
              </dd>
              <dd className="fin-muted mt-1 text-[10px]">{change}</dd>
            </div>
          );
        })}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className="min-w-0">
          <div className="mb-2">
            <h3 className="font-semibold">Evolución de uso</h3>
            <p className="fin-muted text-xs">Sesiones, personas activas y navegación por día.</p>
          </div>
          {trend.length ? (
            <div className="h-72 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 12, right: 12, bottom: 4, left: -16 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sessions" name="Sesiones" stroke="#047857" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="activeUsers" name="Usuarios activos" stroke="#0369a1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pageViews" name="Páginas vistas" stroke="#d97706" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="fin-muted py-6 text-sm">Sin actividad registrada en el periodo.</p>}
        </section>

        <section className="min-w-0 border-t pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <div className="mb-2">
            <h3 className="font-semibold">Uso por módulo</h3>
            <p className="fin-muted text-xs">Páginas visitadas frente a operaciones ejecutadas.</p>
          </div>
          {analytics.modules.length ? (
            <div className="h-72 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.modules} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis type="category" dataKey="module" width={100} tick={{ fill: "#475569", fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pageViews" name="Páginas" fill="#d97706" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="actions" name="Operaciones" fill="#0369a1" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="fin-muted py-6 text-sm">Sin módulos con actividad en el periodo.</p>}
        </section>
      </div>

      <section className="overflow-auto rounded-md border bg-white">
        <table className="table table-sm">
          <thead><tr><th>Módulo</th><th>Usuarios</th><th>Páginas</th><th>Operaciones</th><th>Errores</th><th>Éxito</th></tr></thead>
          <tbody>
            {analytics.modules.map((module) => {
              const rate = module.actions ? ((module.actions - module.failedActions) / module.actions) * 100 : 100;
              return <tr key={module.module}>
                <td className="font-semibold">{module.module}</td>
                <td className="tabular-nums">{module.activeUsers.toLocaleString("es-CL")}</td>
                <td className="tabular-nums">{module.pageViews.toLocaleString("es-CL")}</td>
                <td className="tabular-nums">{module.actions.toLocaleString("es-CL")}</td>
                <td className="tabular-nums">{module.failedActions.toLocaleString("es-CL")}</td>
                <td className="tabular-nums">{rate.toFixed(1)}%</td>
              </tr>;
            })}
            {!analytics.modules.length ? <tr><td colSpan={6} className="fin-muted py-6 text-center">Sin actividad por módulo.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </>
  );
}

function UsersView({ analytics }: { analytics: Analytics }) {
  return (
    <div className="overflow-auto rounded-md border bg-white">
      <table className="table table-sm">
        <thead className="sticky top-0 z-10"><tr><th>Usuario</th><th>Sesiones</th><th>Días activos</th><th>Páginas</th><th>Operaciones</th><th>Errores</th><th>Última actividad</th></tr></thead>
        <tbody>
          {analytics.users.map((user) => (
            <tr key={user.userId}>
              <td className="font-semibold">{user.email}</td>
              <td className="tabular-nums">{user.sessions.toLocaleString("es-CL")}</td>
              <td className="tabular-nums">{user.activeDays.toLocaleString("es-CL")}</td>
              <td className="tabular-nums">{user.pageViews.toLocaleString("es-CL")}</td>
              <td className="tabular-nums">{user.actions.toLocaleString("es-CL")}</td>
              <td className="tabular-nums">{user.failedActions.toLocaleString("es-CL")}</td>
              <td className="whitespace-nowrap">{formatTimestamp(user.lastSeen)}</td>
            </tr>
          ))}
          {!analytics.users.length ? <tr><td colSpan={7} className="fin-muted py-8 text-center">No hay usuarios activos en este periodo.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function HistoryView({ history, loading, search, onSearch, onPageChange }: {
  history: HistoryPage | null;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onPageChange: (offset: number) => void;
}) {
  const entries = history?.entries ?? [];
  const page = history ? Math.floor(history.offset / history.limit) : 0;
  const pages = history ? Math.max(1, Math.ceil(history.total / history.limit)) : 1;
  return (
    <>
      <label className="fin-field relative w-full max-w-sm">
        <span>Buscar en el historial</span>
        <span className="relative"><Search size={14} className="fin-muted absolute left-2 top-2" /><input className="input input-bordered input-sm w-full pl-7" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Usuario o acción" /></span>
      </label>
      <div className="min-h-0 overflow-auto rounded-md border bg-white">
        <table className="table table-sm">
          <thead className="sticky top-0 z-10"><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Resultado</th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap">{formatTimestamp(entry.timestamp)}</td>
                <td>{entry.email}</td>
                <td><span className="block font-semibold">{formatAction(entry.action)}</span>{entry.action !== "login" ? <span className="font-code fin-muted text-xs">{entry.action}</span> : null}</td>
                <td>{formatStatus(entry)}</td>
              </tr>
            ))}
            {!entries.length ? <tr><td colSpan={4} className="fin-muted py-8 text-center">{loading ? "Cargando historial..." : "No hay eventos que coincidan."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="fin-muted text-xs">{history ? `${history.total.toLocaleString("es-CL")} eventos` : "Cargando historial..."}</p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="Página anterior" title="Página anterior" disabled={!history || page === 0 || loading} onClick={() => onPageChange(Math.max(0, (page - 1) * HISTORY_PAGE_SIZE))}><ChevronLeft size={16} /></button>
          <span className="fin-muted text-xs tabular-nums">{page + 1} / {pages}</span>
          <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="Página siguiente" title="Página siguiente" disabled={!history || page + 1 >= pages || loading} onClick={() => onPageChange((page + 1) * HISTORY_PAGE_SIZE)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </>
  );
}

function signed(value: string): string {
  return Number(value) > 0 ? `+${value}` : value;
}

function periodChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "Sin cambio vs. anterior" : "Nuevo vs. anterior";
  const change = ((current - previous) / previous) * 100;
  return `${signed(change.toFixed(0))}% vs. anterior`;
}

function fillDaily(daily: Analytics["daily"], from: string, to: string) {
  const byDate = new Map(daily.map((item) => [item.date, item]));
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const result: Array<Analytics["daily"][number] & { label: string }> = [];
  for (const date = start; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    result.push({
      ...(byDate.get(key) ?? {
        date: key,
        sessions: 0,
        pageViews: 0,
        actions: 0,
        activeUsers: 0,
      }),
      label: formatDate(key),
    });
  }
  return result;
}

function formatAction(action: string): string {
  if (action === "login") return "Inicio de sesión";
  const match = action.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
  if (!match) return action;
  const [, method, route] = match;
  const category = route.startsWith("/api/catalog") ? "Catálogo"
    : route.startsWith("/api/compare") ? "Comparación"
      : route.startsWith("/api/dictionaries") ? "Diccionario"
        : route.startsWith("/api/jobs") ? "Jobs"
          : route.startsWith("/api/admin") ? "Administración"
            : route.startsWith("/api/data-sources") ? "Fuentes de datos" : "Proyecto";
  const verb = method === "GET" ? "Consulta" : method === "POST" ? "Ejecución / creación"
    : method === "DELETE" ? "Eliminación" : "Actualización";
  return `${category} · ${verb}`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString("es-CL");
}

function formatStatus(entry: AuditEntry): string {
  if (entry.action === "login") return "Autenticado";
  try {
    const payload = JSON.parse(entry.payloadJson ?? "{}") as { statusCode?: unknown };
    if (typeof payload.statusCode !== "number") return "Registrado";
    return payload.statusCode >= 400 ? `Error ${payload.statusCode}` : `${payload.statusCode} OK`;
  } catch {
    return "Registrado";
  }
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function isValidRange(from: string, to: string): boolean {
  return Boolean(from && to && from <= to && to <= localDate(new Date()));
}

function errorMessage(error: unknown): string {
  return (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
    (error instanceof Error ? error.message : "No se pudo cargar la actividad.");
}