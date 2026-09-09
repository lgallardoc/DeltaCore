import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "../../auth/usePermissions";
import type { SmartBackState } from "../../navigation/smartBack";

type JobDetailProps = {
  onRunComparison: (jobId: string) => Promise<void>;
};

export function JobDetail({ onRunComparison }: JobDetailProps) {
  const { jobId = "" } = useParams<{ jobId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { canView, canWrite } = usePermissions("JOBS_CONFIG");
  const backState = (location.state as SmartBackState | null) ?? {};

  const handleRunComparison = async () => {
    if (!canWrite) {
      return;
    }
    await onRunComparison(jobId);
  };

  const handleCancelJob = () => {
    const from = backState.from ?? "/jobs";
    navigate(from, {
      state: { filters: backState.filters } satisfies SmartBackState,
    });
  };

  if (!canView) {
    return <p>Forbidden</p>;
  }

  return (
    <section>
      <h1>Job {jobId}</h1>
      <button
        type="button"
        id="btnRunComparison"
        disabled={!canWrite}
        onClick={() => {
          void handleRunComparison();
        }}
      >
        Run comparison
      </button>
      <button type="button" id="btnCancelJob" onClick={handleCancelJob}>
        Back
      </button>
    </section>
  );
}
