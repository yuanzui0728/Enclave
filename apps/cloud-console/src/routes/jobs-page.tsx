import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorldLifecycleJobStatus, WorldLifecycleJobType } from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type JobStatusFilter = WorldLifecycleJobStatus | "all";
type JobTypeFilter = WorldLifecycleJobType | "all";

const JOB_STATUS_FILTERS: JobStatusFilter[] = ["all", "pending", "running", "succeeded", "failed", "cancelled"];
const JOB_TYPE_FILTERS: JobTypeFilter[] = ["all", "provision", "resume", "suspend"];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

export function JobsPage() {
  const [status, setStatus] = useState<JobStatusFilter>("all");
  const [jobType, setJobType] = useState<JobTypeFilter>("all");

  const jobsQuery = useQuery({
    queryKey: ["cloud-console", "jobs", status, jobType],
    queryFn: () =>
      cloudAdminApi.listJobs({
        status: status === "all" ? undefined : status,
        jobType: jobType === "all" ? undefined : jobType,
      }),
  });

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">Lifecycle jobs</div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Inspect provisioning, resume, and suspend work across the managed world fleet.
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as JobStatusFilter)}
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            {JOB_STATUS_FILTERS.map((item) => (
              <option key={item} value={item}>
                status: {item}
              </option>
            ))}
          </select>

          <select
            value={jobType}
            onChange={(event) => setJobType(event.target.value as JobTypeFilter)}
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            {JOB_TYPE_FILTERS.map((item) => (
              <option key={item} value={item}>
                type: {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {jobsQuery.isError && jobsQuery.error instanceof Error ? (
        <div className="mt-4">
          <ErrorBlock message={jobsQuery.error.message} />
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--border-faint)]">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">World</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Finished</th>
            </tr>
          </thead>
          <tbody>
            {(jobsQuery.data ?? []).map((job) => (
              <tr key={job.id} className="border-t border-[color:var(--border-faint)]">
                <td className="px-4 py-3">
                  <div className="text-[color:var(--text-primary)]">{job.jobType}</div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">{job.id}</div>
                </td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{job.worldId}</td>
                <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{job.status}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                  {job.attempt} / {job.maxAttempts}
                </td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(job.startedAt)}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(job.finishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {jobsQuery.isLoading ? <div className="p-4 text-sm text-[color:var(--text-muted)]">Loading jobs...</div> : null}

        {!jobsQuery.isLoading && !jobsQuery.isError && !jobsQuery.data?.length ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">No jobs match this filter.</div>
        ) : null}
      </div>
    </section>
  );
}
