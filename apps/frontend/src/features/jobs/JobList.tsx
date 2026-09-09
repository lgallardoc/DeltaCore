import { Link, useLocation } from "react-router-dom";
import type { SmartBackState } from "../../navigation/smartBack";

export function JobList() {
  const location = useLocation();
  const filters = (location.state as SmartBackState | null)?.filters;

  return (
    <section>
      <h1>Jobs</h1>
      <p>status={filters?.status ?? "all"}</p>
      <Link
        id="btnViewJob"
        to="/jobs/job-1"
        state={
          {
            from: "/jobs",
            filters: filters ?? { status: "idle" },
          } satisfies SmartBackState
        }
      >
        Open job
      </Link>
    </section>
  );
}
