import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initKeycloak, keycloak } from "./keycloak";

export interface IAuthContext {
  isAuthenticated: boolean;
  isInitialized: boolean;
  token: string | null;
  userId: string | null;
  displayName: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<IAuthContext | null>(null);

function tokenFromKeycloak(): Pick<
  IAuthContext,
  "isAuthenticated" | "token" | "userId" | "displayName"
> {
  const parsed = keycloak.tokenParsed as
    | { sub?: string; preferred_username?: string; email?: string; name?: string }
    | undefined;
  return {
    isAuthenticated: Boolean(keycloak.authenticated),
    token: keycloak.token ?? null,
    userId: parsed?.sub ?? null,
    displayName: parsed?.name ?? parsed?.preferred_username ?? parsed?.email ?? "operador",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [session, setSession] = useState(tokenFromKeycloak);

  useEffect(() => {
    const sync = () => setSession(tokenFromKeycloak());

    keycloak.onTokenExpired = () => {
      void keycloak.updateToken(70).then(sync).catch(() => {
        void keycloak.login();
      });
    };
    keycloak.onAuthSuccess = sync;
    keycloak.onAuthRefreshSuccess = sync;
    keycloak.onAuthLogout = sync;

    void initKeycloak()
      .then(sync)
      .finally(() => setIsInitialized(true));

    return () => {
      keycloak.onTokenExpired = undefined;
      keycloak.onAuthSuccess = undefined;
      keycloak.onAuthRefreshSuccess = undefined;
      keycloak.onAuthLogout = undefined;
    };
  }, []);

  const value = useMemo<IAuthContext>(
    () => ({
      isInitialized,
      isAuthenticated: session.isAuthenticated,
      token: session.token,
      userId: session.userId,
      displayName: session.displayName,
      login: async () => {
        await keycloak.login();
      },
      logout: async () => {
        await keycloak.logout({ redirectUri: window.location.origin });
      },
    }),
    [isInitialized, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): IAuthContext {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
