import { useEffect, type ReactNode } from "react";
import { AccessDenied } from "./AccessDenied";
import { useAuth } from "./AuthProvider";
import { usePermissions } from "./usePermissions";

export interface ProtectedRouteProps {
  children: ReactNode;
  moduleName?: string;
}

export function ProtectedRoute({ children, moduleName }: ProtectedRouteProps) {
  const { isInitialized, isAuthenticated, login } = useAuth();
  const { canRead, isResolved } = usePermissions(moduleName);

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      void login();
    }
  }, [isInitialized, isAuthenticated, login]);

  if (!isInitialized || !isAuthenticated) {
    return null;
  }

  if (moduleName && !isResolved) {
    return null;
  }

  if (moduleName && !canRead) {
    return <AccessDenied />;
  }

  return children;
}
