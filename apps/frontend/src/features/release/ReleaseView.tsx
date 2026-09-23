import { ArrowLeft, CalendarDays, Check, GitBranch } from "lucide-react";
import { Link } from "react-router-dom";
import { CURRENT_RELEASE } from "../../release";

export function ReleaseView() {
  return (
    <section className="mx-auto w-full max-w-3xl">
      <Link
        to="/compare"
        className="btn btn-ghost btn-sm mb-4 inline-flex gap-2 px-0"
      >
        <ArrowLeft size={15} />
        Volver
      </Link>

      <div className="fin-panel rounded-2xl border p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--line)] pb-5">
          <div>
            <p className="fin-primary text-[10px] font-bold uppercase tracking-[0.18em]">
              Release actual
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              {CURRENT_RELEASE.title}
            </h2>
            <p className="fin-muted mt-2 text-sm">
              Cambios incluidos en DeltaCore {CURRENT_RELEASE.version}.
            </p>
          </div>
          <span className="badge badge-primary gap-1 rounded-md px-3 py-3 text-sm">
            <GitBranch size={14} /> v{CURRENT_RELEASE.version}
          </span>
        </div>

        <div className="fin-muted mt-5 flex items-center gap-2 text-xs font-semibold">
          <CalendarDays size={14} />
          Publicada el {CURRENT_RELEASE.date}
        </div>

        <ul className="mt-5 grid gap-3">
          {CURRENT_RELEASE.changes.map((change) => (
            <li key={change} className="flex gap-3 text-sm leading-6">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                <Check size={13} strokeWidth={3} />
              </span>
              <span>{change}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}