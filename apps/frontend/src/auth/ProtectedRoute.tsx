import type { ReactNode } from "react";
import { AccessDenied } from "./AccessDenied";
import { useAuth } from "./AuthProvider";
import { LoggedOutView } from "./LoggedOutView";
import { usePermissions } from "./usePermissions";

export interface ProtectedRouteProps {
  children: ReactNode;
  moduleName?: string;
}

export function ProtectedRoute({ children, moduleName }: ProtectedRouteProps) {
  const { isInitialized, isAuthenticated } = useAuth();
  const { canRead, isResolved } = usePermissions(moduleName);

  if (!isInitialized) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoggedOutView isLoggedOut={false} />;
  }

  if (moduleName && !isResolved) {
    return null;
  }

  if (moduleName && !canRead) {
    return <AccessDenied />;
  }

  return children;
}
