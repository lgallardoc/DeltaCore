import { LogIn } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { keycloak } from "./keycloak";

export function LoggedOutView({ isLoggedOut = true }: { isLoggedOut?: boolean }) {
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  async function startLogin() {
    setBusy(true);
    try {
      const prefix = import.meta.env.VITE_HTTP_PREFIX?.replace(/\/$/, "") ?? "";
      const destination =
        location.pathname === "/" || location.pathname === "/logged-out"
          ? "/compare"
          : `${location.pathname}${location.search}${location.hash}`;
      await keycloak.login({
        prompt: "login",
        redirectUri: `${window.location.origin}${prefix}${destination}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-login-page">
      <section className="auth-login-panel" aria-labelledby="auth-login-title">
        <header className="auth-login-brand">
          <img src={`${import.meta.env.BASE_URL}icono_DeltaCore.png`} alt="" />
          <div>
            <span>DELTACORE</span>
            <p>Comparación y análisis de datos</p>
          </div>
        </header>
        <div className="auth-login-copy">
          <p className="auth-login-eyebrow">Acceso corporativo</p>
          <h1 id="auth-login-title">{isLoggedOut ? "Sesión cerrada" : "Bienvenido"}</h1>
          <p className="fin-muted">
            {isLoggedOut
              ? "Tu sesión finalizó. Inicia sesión nuevamente para continuar."
              : "Inicia sesión para continuar a la consola de comparación."}
          </p>
        </div>
        <button
          id="btnView_auth_login"
          type="button"
          className="btn fin-btn-primary auth-login-button"
          disabled={busy}
          onClick={() => void startLogin()}
        >
          <LogIn size={17} aria-hidden="true" />
          {busy ? "Abriendo inicio de sesión…" : "Iniciar sesión"}
        </button>
        <p className="auth-login-security">Autenticación segura mediante Keycloak</p>
      </section>
    </main>
  );
}
