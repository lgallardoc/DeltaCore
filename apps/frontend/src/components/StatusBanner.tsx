import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type NoticeTone = "error" | "info" | "success" | "warning";

type Notice = {
  id: number;
  message: string;
  tone: NoticeTone;
};

type StatusNotifier = {
  notify: (message: string, tone?: NoticeTone) => void;
};

const StatusContext = createContext<StatusNotifier | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timeout = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    if (!message.trim()) {
      return;
    }
    setNotice({ id: Date.now(), message, tone });
  }, []);

  const notifier = useMemo(() => ({ notify }), [notify]);

  const Icon = notice?.tone === "error" ? TriangleAlert : notice?.tone === "success" ? CheckCircle2 : Info;

  return (
    <StatusContext.Provider value={notifier}>
      {children}
      {notice ? (
        <div className={`fin-status-banner fin-status-${notice.tone}`} role="status" aria-live="polite">
          <Icon size={19} aria-hidden="true" />
          <p className="fin-status-message">{notice.message}</p>
          <button
            type="button"
            className="fin-status-close"
            aria-label="Cerrar mensaje"
            title="Cerrar mensaje"
            onClick={() => setNotice(null)}
          >
            <X size={18} />
          </button>
        </div>
      ) : null}
    </StatusContext.Provider>
  );
}

export function useStatusNotification(): StatusNotifier {
  const notifier = useContext(StatusContext);
  if (!notifier) {
    throw new Error("useStatusNotification must be used within StatusProvider");
  }
  return notifier;
}