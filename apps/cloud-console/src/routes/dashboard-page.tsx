import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ErrorBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";

function countByStatus(items: { status: string }[], target: string) {
  return items.filter((item) => item.status === target).length;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

export function DashboardPage() {
  const requestsQuery = useQuery({
    queryKey: ["cloud-console", "requests"],
    queryFn: () => cloudAdminApi.listRequests(),
  });
  const worldsQuery = useQuery({
    queryKey: ["cloud-console", "worlds"],
    queryFn: () => cloudAdminApi.listWorlds(),
  });
  const jobsQuery = useQuery({
    queryKey: ["cloud-console", "jobs"],
    queryFn: () => cloudAdminApi.listJobs(),
  });

  const requests = requestsQuery.data ?? [];
  const worlds = worldsQuery.data ?? [];
  const jobs = jobsQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Pending requests", value: countByStatus(requests, "pending") },
          { label: "Ready worlds", value: countByStatus(worlds, "ready") },
          { label: "Sleeping worlds", value: countByStatus(worlds, "sleeping") },
          { label: "Failed worlds", value: countByStatus(worlds, "failed") },
          { label: "Running jobs", value: countByStatus(jobs, "running") },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]"
          >
            <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{item.label}</div>
            <div className="mt-4 text-4xl font-semibold text-[color:var(--text-primary)]">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">Recent requests</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                Manual request records remain visible for compatibility and backoffice follow-up.
              </div>
            </div>
            <Link to="/requests" className="text-sm text-[color:var(--brand)]">
              View all
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {requestsQuery.isError && requestsQuery.error instanceof Error ? <ErrorBlock message={requestsQuery.error.message} /> : null}
            {requests.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                to="/requests/$requestId"
                params={{ requestId: item.id }}
                className="block rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">{item.worldName}</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{item.status}</div>
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-secondary)]">{item.phone}</div>
              </Link>
            ))}
            {!requestsQuery.isError && requests.length === 0 ? (
              <div className="text-sm text-[color:var(--text-muted)]">No requests yet.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">World fleet</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                The lifecycle view shows whether a phone's world is ready, sleeping, or recovering.
              </div>
            </div>
            <Link to="/worlds" className="text-sm text-[color:var(--brand)]">
              View all
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {worldsQuery.isError && worldsQuery.error instanceof Error ? <ErrorBlock message={worldsQuery.error.message} /> : null}
            {worlds.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                to="/worlds/$worldId"
                params={{ worldId: item.id }}
                className="block rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">{item.name}</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{item.status}</div>
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-secondary)]">{item.phone}</div>
              </Link>
            ))}
            {!worldsQuery.isError && worlds.length === 0 ? (
              <div className="text-sm text-[color:var(--text-muted)]">No worlds yet.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">Recent jobs</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                Resume, suspend, and provision work is tracked through lifecycle jobs.
              </div>
            </div>
            <Link to="/jobs" className="text-sm text-[color:var(--brand)]">
              View all
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {jobsQuery.isError && jobsQuery.error instanceof Error ? <ErrorBlock message={jobsQuery.error.message} /> : null}
            {jobs.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {item.jobType} · {item.worldId.slice(0, 8)}
                  </div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{item.status}</div>
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-secondary)]">{formatDateTime(item.updatedAt)}</div>
              </div>
            ))}
            {!jobsQuery.isError && jobs.length === 0 ? (
              <div className="text-sm text-[color:var(--text-muted)]">No jobs yet.</div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
