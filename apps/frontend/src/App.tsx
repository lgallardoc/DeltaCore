import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { apiClient } from "./auth/api.client";
import { Layout } from "./components/layout/Layout";
import { CatalogView } from "./features/catalog/CatalogView";
import { DictionaryView } from "./features/dictionary/DictionaryView";
import { CompareView } from "./features/compare/CompareView";
import { JobDetail } from "./features/jobs/JobDetail";
import { JobList } from "./features/jobs/JobList";

const JOBS_MODULE = "JOBS_CONFIG";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <ProtectedRoute moduleName={JOBS_MODULE}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/compare" replace />} />
            <Route path="/compare" element={<CompareView />} />
            <Route path="/dictionary" element={<DictionaryView />} />
            <Route path="/catalog" element={<CatalogView />} />
            <Route path="/jobs" element={<JobList />} />
            <Route
              path="/jobs/:jobId"
              element={
                <JobDetail
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
                />
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
