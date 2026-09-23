import { LogIn } from "lucide-react";
import { useState } from "react";
import { keycloak } from "./keycloak";

export function LoggedOutView() {
  const [busy, setBusy] = useState(false);

  async function startLogin() {
    setBusy(true);
    try {
      const prefix = import.meta.env.VITE_HTTP_PREFIX?.replace(/\/$/, "") ?? "";
      await keycloak.login({
        prompt: "login",
        redirectUri: `${window.location.origin}${prefix}/compare`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--bg)] p-4">
      <section className="fin-panel w-full max-w-md rounded-2xl border p-6 text-center">
        <h1 className="text-xl font-bold">Sesión cerrada</h1>
        <p className="fin-muted mt-2 text-sm">Debe iniciar sesión nuevamente para continuar.</p>
        <button
          id="btnView_auth_login"
          type="button"
          className="btn fin-btn-primary mt-5"
          disabled={busy}
          onClick={() => void startLogin()}
        >
          <LogIn size={15} />
          {busy ? "Abriendo inicio de sesión…" : "Iniciar sesión"}
        </button>
      </section>
    </main>
  );
}
