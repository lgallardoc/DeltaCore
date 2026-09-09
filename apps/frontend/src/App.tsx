import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { apiClient } from "./auth/api.client";
import { JobDetail } from "./features/jobs/JobDetail";
import { JobList } from "./features/jobs/JobList";

const JOBS_MODULE = "JOBS_CONFIG";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route
            path="/jobs"
            element={
              <ProtectedRoute moduleName={JOBS_MODULE}>
                <JobList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:jobId"
            element={
              <ProtectedRoute moduleName={JOBS_MODULE}>
                <JobDetail
                  onRunComparison={async (jobId) => {
                    const dsn =
                      import.meta.env.VITE_DB2_ODBC_DSN ?? "AZ7DB";
                    const tables = (
                      import.meta.env.VITE_SCHEMA_COMPARE_TABLES ?? "ACCCR7"
                    )
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
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
