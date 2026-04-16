import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CloudWorldAttentionItem, CloudWorldLifecycleStatus } from "@yinjie/contracts";
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

function getAttentionTone(severity: CloudWorldAttentionItem["severity"]) {
  switch (severity) {
    case "critical":
      return "border-rose-300/60 bg-rose-500/10 text-rose-200";
    case "warning":
      return "border-amber-300/50 bg-amber-500/10 text-amber-100";
    case "info":
    default:
      return "border-sky-300/50 bg-sky-500/10 text-sky-100";
  }
}

function getAttentionLabel(item: CloudWorldAttentionItem) {
  switch (item.reason) {
    case "failed_world":
      return "Failed";
    case "provider_error":
      return "Provider error";
    case "deployment_drift":
      return "Runtime drift";
    case "sleep_drift":
      return "Sleep drift";
    case "heartbeat_stale":
      return "Heartbeat stale";
    case "recovery_queued":
      return "Recovery queued";
    default:
      return "Attention";
  }
}

function getMetricTone(value: number) {
  if (value > 0) {
    return "text-[color:var(--text-primary)]";
  }

  return "text-[color:var(--text-secondary)]";
}

export function WorldsPage() {
  const [filter, setFilter] = useState<WorldStatusFilter>("all");
  const worldsQuery = useQuery({
    queryKey: ["cloud-console", "worlds", filter],
    queryFn: () => cloudAdminApi.listWorlds(filter === "all" ? undefined : filter),
  });
  const driftSummaryQuery = useQuery({
    queryKey: ["cloud-console", "world-drift-summary"],
    queryFn: () => cloudAdminApi.getWorldDriftSummary(),
  });
  const attentionByWorldId = new Map(
    (driftSummaryQuery.data?.attentionItems ?? []).map((item) => [item.worldId, item] as const),
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">World drift summary</div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              This panel folds together runtime heartbeat freshness, provider-observed drift, and queued recovery jobs.
            </div>
          </div>

          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Updated {formatDateTime(driftSummaryQuery.data?.generatedAt)}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Attention worlds</div>
            <div className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.attentionWorlds ?? 0)}`}>
              {driftSummaryQuery.data?.attentionWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Worlds that currently need operator attention.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Critical alerts</div>
            <div className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.criticalAttentionWorlds ?? 0)}`}>
              {driftSummaryQuery.data?.criticalAttentionWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Worlds already in critical state, including failed and escalated alerts.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Escalated worlds</div>
            <div className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.escalatedWorlds ?? 0)}`}>
              {driftSummaryQuery.data?.escalatedWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Alerts upgraded because retry or stale-heartbeat thresholds were crossed.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Recovery queued</div>
            <div className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.recoveryQueuedWorlds ?? 0)}`}>
              {driftSummaryQuery.data?.recoveryQueuedWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Worlds that already have active `resume` or `provision` work in flight.
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Heartbeat stale</div>
            <div className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.heartbeatStaleWorlds ?? 0)}`}>
              {driftSummaryQuery.data?.heartbeatStaleWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Runtime is not checking in within the configured stale window.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Provider drift</div>
            <div className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.providerDriftWorlds ?? 0)}`}>
              {driftSummaryQuery.data?.providerDriftWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Provider reports power state that disagrees with desired world state.
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">Top attention items</div>
          <div className="mt-3 space-y-3">
            {(driftSummaryQuery.data?.attentionItems ?? []).slice(0, 6).map((item) => (
              <div
                key={item.worldId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/worlds/$worldId"
                      params={{ worldId: item.worldId }}
                      className="text-sm font-medium text-[color:var(--text-primary)] hover:underline"
                    >
                      {item.worldName}
                    </Link>
                    <span className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getAttentionTone(item.severity)}`}>
                      {getAttentionLabel(item)}
                    </span>
                    {item.escalated ? (
                      <span className="rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-rose-200">
                        Escalated
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{item.message}</div>
                  <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                    Retry count {item.retryCount}
                    {typeof item.staleHeartbeatSeconds === "number" ? ` • stale ${item.staleHeartbeatSeconds}s` : ""}
                  </div>
                </div>
                <div className="text-right text-xs text-[color:var(--text-muted)]">
                  <div>{item.phone}</div>
                  <div className="mt-1 uppercase tracking-[0.18em]">{item.worldStatus}</div>
                </div>
              </div>
            ))}

            {driftSummaryQuery.isLoading ? (
              <div className="text-sm text-[color:var(--text-muted)]">Loading drift summary...</div>
            ) : null}

            {driftSummaryQuery.isError && driftSummaryQuery.error instanceof Error ? (
              <ErrorBlock message={driftSummaryQuery.error.message} />
            ) : null}

            {!driftSummaryQuery.isLoading && !driftSummaryQuery.isError && !driftSummaryQuery.data?.attentionItems.length ? (
              <div className="text-sm text-[color:var(--text-muted)]">No active drift or heartbeat issues right now.</div>
            ) : null}
          </div>
        </div>
      </section>

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
                <th className="px-4 py-3">Attention</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">API</th>
                <th className="px-4 py-3">Last interactive</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(worldsQuery.data ?? []).map((item) => {
                const attention = attentionByWorldId.get(item.id);

                return (
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
                    <td className="px-4 py-3">
                      {attention ? (
                        <div className="space-y-1">
                          <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getAttentionTone(attention.severity)}`}>
                            {getAttentionLabel(attention)}
                          </div>
                          {attention.escalated ? (
                            <div className="text-[11px] uppercase tracking-[0.18em] text-rose-200">Escalated</div>
                          ) : null}
                          <div className="max-w-[18rem] text-xs text-[color:var(--text-secondary)]">{attention.message}</div>
                        </div>
                      ) : (
                        <span className="text-[color:var(--text-secondary)]">Healthy</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.healthStatus ?? "unknown"}</td>
                    <td className="max-w-[18rem] truncate px-4 py-3 text-[color:var(--text-secondary)]">{item.apiBaseUrl ?? "Not set"}</td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(item.lastInteractiveAt)}</td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(item.updatedAt)}</td>
                  </tr>
                );
              })}
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
    </div>
  );
}
