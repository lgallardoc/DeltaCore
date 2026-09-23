import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { apiClient } from "./auth/api.client";
import { Layout } from "./components/layout/Layout";
import { StatusProvider } from "./components/StatusBanner";
import { CatalogView } from "./features/catalog/CatalogView";
import { DictionaryView } from "./features/dictionary/DictionaryView";
import { DictionaryEditView } from "./features/dictionary/DictionaryEditView";
import { CompareView } from "./features/compare/CompareView";
import { RowDetailView } from "./features/compare/RowDetailView";
import { JobDetail } from "./features/jobs/JobDetail";
import { JobList } from "./features/jobs/JobList";
import { ReleaseView } from "./features/release/ReleaseView";
import { ProfileView } from "./features/profiles/ProfileView";
import { UserView } from "./features/users/UserView";
import { LoggedOutView } from "./auth/LoggedOutView";

export function App() {
  const basename = import.meta.env.VITE_HTTP_PREFIX?.replace(/\/$/, "") || undefined;

  return (
    <AuthProvider>
      <BrowserRouter basename={basename}>
        <StatusProvider>
          <Routes>
          <Route path="/logged-out" element={<LoggedOutView />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/compare" replace />} />
            <Route path="/compare" element={<ModuleRoute moduleName="COMPARE"><CompareView /></ModuleRoute>} />
            <Route path="/compare/rows/:kind" element={<ModuleRoute moduleName="COMPARE"><RowDetailView /></ModuleRoute>} />
            <Route path="/dictionary" element={<ModuleRoute moduleName="DICTIONARY"><DictionaryView /></ModuleRoute>} />
            <Route path="/dictionary/edit" element={<ModuleRoute moduleName="DICTIONARY"><DictionaryEditView /></ModuleRoute>} />
            <Route path="/catalog" element={<ModuleRoute moduleName="CATALOG"><CatalogView /></ModuleRoute>} />
            <Route path="/jobs" element={<ModuleRoute moduleName="JOBS_CONFIG"><JobList /></ModuleRoute>} />
            <Route path="/release" element={<ReleaseView />} />
            <Route path="/profiles" element={<ModuleRoute moduleName="PROFILES"><ProfileView /></ModuleRoute>} />
            <Route path="/users" element={<ModuleRoute moduleName="USERS"><UserView /></ModuleRoute>} />
            <Route
              path="/jobs/:jobId"
              element={
                <ModuleRoute moduleName="JOBS_CONFIG"><JobDetail
                  onRunComparison={async (jobId) => {
                    const dsn = import.meta.env.VITE_DB2_ODBC_DSN ?? "AZ7DB";
                    const tables = (import.meta.env.VITE_SCHEMA_COMPARE_TABLES ?? "ACCCR7")
                      .split(",")
                      .map((name) => name.trim())
                      .filter(Boolean);
                    await apiClient.post(`/jobs/${jobId}/schema-compare`, {
                      sourceDsn: dsn,
                      targetDsn: dsn,
                      tables,
                    });
                  }}
                /></ModuleRoute>
              }
            />
          </Route>
          </Routes>
        </StatusProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}

function ModuleRoute({ moduleName, children }: { moduleName: string; children: ReactNode }) {
  return <ProtectedRoute moduleName={moduleName}>{children}</ProtectedRoute>;
}
