import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CloudWorldLifecycleStatus } from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type WorldStatusFilter = CloudWorldLifecycleStatus | "all";

const WORLD_STATUS_FILTERS: WorldStatusFilter[] = [
  "all",
  "queued",
  "creating",
  "bootstrapping",
  "starting",
  "ready",
  "sleeping",
  "failed",
  "disabled",
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

export function WorldsPage() {
  const [filter, setFilter] = useState<WorldStatusFilter>("all");
  const worldsQuery = useQuery({
    queryKey: ["cloud-console", "worlds", filter],
    queryFn: () => cloudAdminApi.listWorlds(filter === "all" ? undefined : filter),
  });

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">Managed worlds</div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Each phone owns exactly one world. New users provision a fresh instance, while returning users wake their previous one.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {WORLD_STATUS_FILTERS.map((status) => (
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
              <th className="px-4 py-3">World</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">API</th>
              <th className="px-4 py-3">Last interactive</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(worldsQuery.data ?? []).map((item) => (
              <tr key={item.id} className="border-t border-[color:var(--border-faint)]">
                <td className="px-4 py-3">
                  <Link
                    to="/worlds/$worldId"
                    params={{ worldId: item.id }}
                    className="text-[color:var(--text-primary)] hover:underline"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.phone}</td>
                <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{item.status}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.healthStatus ?? "unknown"}</td>
                <td className="max-w-[18rem] truncate px-4 py-3 text-[color:var(--text-secondary)]">{item.apiBaseUrl ?? "Not set"}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(item.lastInteractiveAt)}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {worldsQuery.isError && worldsQuery.error instanceof Error ? (
          <div className="p-4">
            <ErrorBlock message={worldsQuery.error.message} />
          </div>
        ) : null}

        {worldsQuery.isLoading ? <div className="p-4 text-sm text-[color:var(--text-muted)]">Loading worlds...</div> : null}

        {!worldsQuery.isLoading && !worldsQuery.isError && !worldsQuery.data?.length ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">No worlds match this filter.</div>
        ) : null}
      </div>
    </section>
  );
}
