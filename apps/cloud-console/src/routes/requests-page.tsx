import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CloudWorldRequestStatus } from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type RequestStatusFilter = CloudWorldRequestStatus | "all";

const REQUEST_STATUS_FILTERS: RequestStatusFilter[] = [
  "all",
  "pending",
  "provisioning",
  "active",
  "rejected",
  "disabled",
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function RequestsPage() {
  const [filter, setFilter] = useState<RequestStatusFilter>("all");
  const requestsQuery = useQuery({
    queryKey: ["cloud-console", "requests", filter],
    queryFn: () => cloudAdminApi.listRequests(filter === "all" ? undefined : filter),
  });

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">World requests</div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Compatibility view for the older approval workflow. Staff can still use it when manual intervention is needed.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {REQUEST_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                filter === status
                  ? "border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] text-[color:var(--text-primary)]"
                  : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--border-faint)]">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">World name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(requestsQuery.data ?? []).map((item) => (
              <tr key={item.id} className="border-t border-[color:var(--border-faint)]">
                <td className="px-4 py-3">
                  <Link
                    to="/requests/$requestId"
                    params={{ requestId: item.id }}
                    className="text-[color:var(--text-primary)] hover:underline"
                  >
                    {item.worldName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.phone}</td>
                <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{item.status}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {requestsQuery.isError && requestsQuery.error instanceof Error ? (
          <div className="p-4">
            <ErrorBlock message={requestsQuery.error.message} />
          </div>
        ) : null}

        {requestsQuery.isLoading ? <div className="p-4 text-sm text-[color:var(--text-muted)]">Loading requests...</div> : null}

        {!requestsQuery.isLoading && !requestsQuery.isError && !requestsQuery.data?.length ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">No requests match this filter.</div>
        ) : null}
      </div>
    </section>
  );
}
