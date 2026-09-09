import { useEffect, useState } from "react";
import type { RBACPermission } from "@deltacore/shared";
import { apiClient } from "./api.client";
import { useAuth } from "./AuthProvider";

const DENY: RBACPermission = {
  canView: false,
  canRead: false,
  canWrite: false,
};

export function usePermissions(moduleName?: string): RBACPermission & {
  isResolved: boolean;
} {
  const { isAuthenticated } = useAuth();
  const [permission, setPermission] = useState<RBACPermission>(DENY);
  const [isResolved, setIsResolved] = useState(!moduleName);

  useEffect(() => {
    if (!moduleName || !isAuthenticated) {
      setPermission(DENY);
      setIsResolved(!moduleName);
      return;
    }

    let cancelled = false;
    setIsResolved(false);
    void apiClient
      .get<RBACPermission>(`/rbac/modules/${encodeURIComponent(moduleName)}`)
      .then((response) => {
        if (!cancelled) {
          setPermission(response.data);
          setIsResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermission(DENY);
          setIsResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [moduleName, isAuthenticated]);

  return { ...permission, isResolved };
}
