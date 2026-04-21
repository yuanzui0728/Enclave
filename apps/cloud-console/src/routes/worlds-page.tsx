import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type {
  CloudInstancePowerState,
  CloudWorldAttentionItem,
  CloudWorldInstanceFleetItem,
} from "@yinjie/contracts";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { useConsoleNotice } from "../components/console-notice";
import { WorldLifecycleActionButtons } from "../components/world-lifecycle-action-buttons";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";
import {
  ATTENTION_FILTERS,
  buildWorldsRouteSearch,
  HEALTH_FILTERS,
  POWER_STATE_FILTERS,
  UNASSIGNED_PROVIDER_FILTER,
  WORLD_STATUS_FILTERS,
  type AttentionFilter,
  type HealthFilter,
  type PowerStateFilter,
  type WorldsRouteSearch,
  type WorldStatusFilter,
} from "../lib/world-route-search";
import {
  WORLDS_PAGE_ACTIONS,
  createWorldActionConfirmationCopy,
  requiresWorldActionConfirmation,
  type ConfirmableWorldLifecycleAction,
  createWorldActionLabel,
  listAllowedWorldActions,
  performWorldLifecycleActionWithMeta,
  type WorldLifecycleAction,
} from "../lib/world-lifecycle-actions";

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

function getHealthBucket(status?: string | null): HealthFilter {
  const normalized = status?.trim().toLowerCase();
  if (!normalized || normalized === "unknown") {
    return "unknown";
  }
  if (normalized === "healthy" || normalized === "ready") {
    return "healthy";
  }
  return "unhealthy";
}

function getHealthTone(status?: string | null) {
  const bucket = getHealthBucket(status);
  if (bucket === "healthy") {
    return "border-emerald-300/50 bg-emerald-500/10 text-emerald-100";
  }
  if (bucket === "unhealthy") {
    return "border-amber-300/50 bg-amber-500/10 text-amber-100";
  }
  return "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
}

function formatPowerStateLabel(value: CloudInstancePowerState) {
  switch (value) {
    case "provisioning":
      return "Provisioning";
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "starting":
      return "Starting";
    case "stopping":
      return "Stopping";
    case "error":
      return "Error";
    case "absent":
    default:
      return "Absent";
  }
}

function getPowerStateTone(value: CloudInstancePowerState) {
  switch (value) {
    case "running":
      return "border-emerald-300/50 bg-emerald-500/10 text-emerald-100";
    case "starting":
    case "provisioning":
    case "stopping":
      return "border-sky-300/50 bg-sky-500/10 text-sky-100";
    case "error":
      return "border-rose-300/60 bg-rose-500/10 text-rose-200";
    case "stopped":
    case "absent":
    default:
      return "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
  }
}

function resolveProviderKey(item: CloudWorldInstanceFleetItem) {
  return item.instance?.providerKey?.trim() || item.world.providerKey?.trim() || "";
}

function resolveProviderLabel(
  item: CloudWorldInstanceFleetItem,
  labelByKey: Map<string, string>,
) {
  const providerKey = resolveProviderKey(item);
  if (!providerKey) {
    return "Unassigned";
  }
  return labelByKey.get(providerKey) ?? providerKey;
}

function resolvePowerState(item: CloudWorldInstanceFleetItem): CloudInstancePowerState {
  return item.instance?.powerState ?? "absent";
}

function matchesAttentionFilter(
  filter: AttentionFilter,
  attention: CloudWorldAttentionItem | null | undefined,
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "healthy") {
    return !attention;
  }
  return attention?.severity === filter;
}

type QuickActionConfirmState = {
  worldId: string;
  worldName: string;
  action: ConfirmableWorldLifecycleAction;
};

export function WorldsPage() {
  const navigate = useNavigate({ from: "/worlds" });
  const filters = useSearch({ from: "/worlds" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const [confirmAction, setConfirmAction] =
    useState<QuickActionConfirmState | null>(null);
  const statusFilter = filters.status;
  const providerFilter = filters.provider;
  const powerStateFilter = filters.powerState;
  const attentionFilter = filters.attention;
  const healthFilter = filters.health;

  function updateFilters(next: Partial<WorldsRouteSearch>) {
    void navigate({
      replace: true,
      search: (previous) => buildWorldsRouteSearch({ ...previous, ...next }),
    });
  }

  const worldsQuery = useQuery({
    queryKey: ["cloud-console", "worlds", statusFilter],
    queryFn: () =>
      cloudAdminApi.listWorlds(
        statusFilter === "all" ? undefined : statusFilter,
      ),
  });
  const instanceFleetQuery = useQuery({
    queryKey: ["cloud-console", "instances", statusFilter],
    queryFn: () =>
      cloudAdminApi.listInstances(
        statusFilter === "all" ? undefined : statusFilter,
      ),
  });
  const providersQuery = useQuery({
    queryKey: ["cloud-console", "providers"],
    queryFn: () => cloudAdminApi.listProviders(),
  });
  const driftSummaryQuery = useQuery({
    queryKey: ["cloud-console", "world-drift-summary"],
    queryFn: () => cloudAdminApi.getWorldDriftSummary(),
  });

  const attentionByWorldId = useMemo(
    () =>
      new Map(
        (driftSummaryQuery.data?.attentionItems ?? []).map(
          (item) => [item.worldId, item] as const,
        ),
      ),
    [driftSummaryQuery.data?.attentionItems],
  );
  const providerLabelByKey = useMemo(
    () =>
      new Map(
        (providersQuery.data ?? []).map((provider) => [
          provider.key,
          provider.label,
        ] as const),
      ),
    [providersQuery.data],
  );

  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const item of instanceFleetQuery.data ?? []) {
      const providerKey = resolveProviderKey(item);
      seen.add(providerKey || UNASSIGNED_PROVIDER_FILTER);
    }

    return [...seen]
      .sort((left, right) => {
        if (left === UNASSIGNED_PROVIDER_FILTER) {
          return 1;
        }
        if (right === UNASSIGNED_PROVIDER_FILTER) {
          return -1;
        }
        const leftLabel = providerLabelByKey.get(left) ?? left;
        const rightLabel = providerLabelByKey.get(right) ?? right;
        return leftLabel.localeCompare(rightLabel);
      })
      .map((key) => ({
        key,
        label:
          key === UNASSIGNED_PROVIDER_FILTER
            ? "Unassigned"
            : (providerLabelByKey.get(key) ?? key),
      }));
  }, [instanceFleetQuery.data, providerLabelByKey]);

  const filteredInstanceFleet = useMemo(() => {
    return (instanceFleetQuery.data ?? []).filter((item) => {
      const providerKey = resolveProviderKey(item);
      const powerState = resolvePowerState(item);
      const attention = attentionByWorldId.get(item.world.id);
      const healthBucket = getHealthBucket(item.world.healthStatus);

      if (providerFilter !== "all") {
        if (providerFilter === UNASSIGNED_PROVIDER_FILTER) {
          if (providerKey) {
            return false;
          }
        } else if (providerKey !== providerFilter) {
          return false;
        }
      }

      if (powerStateFilter !== "all" && powerState !== powerStateFilter) {
        return false;
      }

      if (!matchesAttentionFilter(attentionFilter, attention)) {
        return false;
      }

      if (healthFilter !== "all" && healthBucket !== healthFilter) {
        return false;
      }

      return true;
    });
  }, [
    attentionByWorldId,
    attentionFilter,
    healthFilter,
    instanceFleetQuery.data,
    powerStateFilter,
    providerFilter,
  ]);

  const fleetMetrics = useMemo(() => {
    const items = filteredInstanceFleet;
    return {
      total: items.length,
      running: items.filter((item) => resolvePowerState(item) === "running")
        .length,
      absent: items.filter((item) => resolvePowerState(item) === "absent")
        .length,
      attention: items.filter((item) => attentionByWorldId.has(item.world.id))
        .length,
    };
  }, [attentionByWorldId, filteredInstanceFleet]);

  const quickActionMutation = useMutation({
    mutationFn: (input: { worldId: string; action: WorldLifecycleAction }) =>
      performWorldLifecycleActionWithMeta(input.worldId, input.action),
    onSuccess: async (response, variables) => {
      setConfirmAction(null);
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          createWorldActionLabel(variables.action, response.data),
          "success",
          response.requestId,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "instances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "world-drift-summary"],
        }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "jobs"] }),
      ]);
    },
    onError: (error, variables) => {
      if (requiresWorldActionConfirmation(variables.action)) {
        setConfirmAction(null);
      }
      showCloudAdminErrorNotice(showNotice, error);
    },
  });
  const activeConfirm = confirmAction
    ? createWorldActionConfirmationCopy(confirmAction.action, {
        name: confirmAction.worldName,
      })
    : null;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">
              World drift summary
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              This panel folds together runtime heartbeat freshness,
              provider-observed drift, and queued recovery jobs.
            </div>
          </div>

          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            Updated {formatDateTime(driftSummaryQuery.data?.generatedAt)}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Attention worlds
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.attentionWorlds ?? 0)}`}
            >
              {driftSummaryQuery.data?.attentionWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Worlds that currently need operator attention.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Critical alerts
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.criticalAttentionWorlds ?? 0)}`}
            >
              {driftSummaryQuery.data?.criticalAttentionWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Worlds already in critical state, including failed and escalated
              alerts.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Escalated worlds
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.escalatedWorlds ?? 0)}`}
            >
              {driftSummaryQuery.data?.escalatedWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Alerts upgraded because retry or stale-heartbeat thresholds were
              crossed.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Recovery queued
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.recoveryQueuedWorlds ?? 0)}`}
            >
              {driftSummaryQuery.data?.recoveryQueuedWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Worlds that already have active `resume` or `provision` work in
              flight.
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Heartbeat stale
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.heartbeatStaleWorlds ?? 0)}`}
            >
              {driftSummaryQuery.data?.heartbeatStaleWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Runtime is not checking in within the configured stale window.
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Provider drift
            </div>
            <div
              className={`mt-2 text-3xl font-semibold ${getMetricTone(driftSummaryQuery.data?.providerDriftWorlds ?? 0)}`}
            >
              {driftSummaryQuery.data?.providerDriftWorlds ?? 0}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Provider reports power state that disagrees with desired world
              state.
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            Top attention items
          </div>
          <div className="mt-3 space-y-3">
            {(driftSummaryQuery.data?.attentionItems ?? [])
              .slice(0, 6)
              .map((item) => (
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
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getAttentionTone(item.severity)}`}
                      >
                        {getAttentionLabel(item)}
                      </span>
                      {item.escalated ? (
                        <span className="rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-rose-200">
                          Escalated
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                      {item.message}
                    </div>
                    <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                      Retry count {item.retryCount}
                      {typeof item.staleHeartbeatSeconds === "number"
                        ? ` • stale ${item.staleHeartbeatSeconds}s`
                        : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[color:var(--text-muted)]">
                    <div>{item.phone}</div>
                    <div className="mt-1 uppercase tracking-[0.18em]">
                      {item.worldStatus}
                    </div>
                  </div>
                </div>
              ))}

            {driftSummaryQuery.isLoading ? (
              <div className="text-sm text-[color:var(--text-muted)]">
                Loading drift summary...
              </div>
            ) : null}

            {driftSummaryQuery.isError &&
            driftSummaryQuery.error instanceof Error ? (
              <CloudAdminErrorBlock error={driftSummaryQuery.error} />
            ) : null}

            {!driftSummaryQuery.isLoading &&
            !driftSummaryQuery.isError &&
            !driftSummaryQuery.data?.attentionItems.length ? (
              <div className="text-sm text-[color:var(--text-muted)]">
                No active drift or heartbeat issues right now.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">
              Managed worlds
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Each phone owns exactly one world. New users provision a fresh
              instance, while returning users wake their previous one.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {WORLD_STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => updateFilters({ status })}
                className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                  statusFilter === status
                    ? "border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] text-[color:var(--text-primary)]"
                    : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
          <table className="min-w-[72rem] border-collapse text-left text-sm">
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
                  <tr
                    key={item.id}
                    className="border-t border-[color:var(--border-faint)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/worlds/$worldId"
                        params={{ worldId: item.id }}
                        className="text-[color:var(--text-primary)] hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {item.phone}
                    </td>
                    <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      {item.status}
                    </td>
                    <td className="px-4 py-3">
                      {attention ? (
                        <div className="space-y-1">
                          <div
                            className={`inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getAttentionTone(attention.severity)}`}
                          >
                            {getAttentionLabel(attention)}
                          </div>
                          {attention.escalated ? (
                            <div className="text-[11px] uppercase tracking-[0.18em] text-rose-200">
                              Escalated
                            </div>
                          ) : null}
                          <div className="max-w-[18rem] text-xs text-[color:var(--text-secondary)]">
                            {attention.message}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[color:var(--text-secondary)]">
                          Healthy
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {item.healthStatus ?? "unknown"}
                    </td>
                    <td className="max-w-[18rem] truncate px-4 py-3 text-[color:var(--text-secondary)]">
                      {item.apiBaseUrl ?? "Not set"}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(item.lastInteractiveAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(item.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {worldsQuery.isError && worldsQuery.error instanceof Error ? (
            <div className="p-4">
              <CloudAdminErrorBlock error={worldsQuery.error} />
            </div>
          ) : null}

          {worldsQuery.isLoading ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              Loading worlds...
            </div>
          ) : null}

          {!worldsQuery.isLoading &&
          !worldsQuery.isError &&
          !worldsQuery.data?.length ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              No worlds match this filter.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">
              Instance fleet
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Work from the instance point of view: provider placement, power
              state, heartbeat freshness, and quick lifecycle actions.
            </div>
          </div>

          <div className="grid min-w-[18rem] gap-2 sm:grid-cols-2">
            <select
              value={providerFilter}
              onChange={(event) =>
                updateFilters({ provider: event.target.value })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              <option value="all">provider: all</option>
              {providerOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  provider: {item.label}
                </option>
              ))}
            </select>

            <select
              value={powerStateFilter}
              onChange={(event) =>
                updateFilters({
                  powerState: event.target.value as PowerStateFilter,
                })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {POWER_STATE_FILTERS.map((item) => (
                <option key={item} value={item}>
                  power: {item}
                </option>
              ))}
            </select>

            <select
              value={attentionFilter}
              onChange={(event) =>
                updateFilters({
                  attention: event.target.value as AttentionFilter,
                })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {ATTENTION_FILTERS.map((item) => (
                <option key={item} value={item}>
                  attention: {item}
                </option>
              ))}
            </select>

            <select
              value={healthFilter}
              onChange={(event) =>
                updateFilters({
                  health: event.target.value as HealthFilter,
                })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {HEALTH_FILTERS.map((item) => (
                <option key={item} value={item}>
                  health: {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Visible rows
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.total}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Running now
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.running}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              No instance
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.absent}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Needs action
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.attention}
            </div>
          </div>
        </div>

        {providersQuery.isError && providersQuery.error instanceof Error ? (
          <div className="mt-4">
            <CloudAdminErrorBlock error={providersQuery.error} />
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
          <table className="min-w-[90rem] border-collapse text-left text-sm">
            <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">World</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Instance</th>
                <th className="px-4 py-3">Power</th>
                <th className="px-4 py-3">Attention</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Heartbeat</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInstanceFleet.map((item) => {
                const attention = attentionByWorldId.get(item.world.id) ?? null;
                const powerState = resolvePowerState(item);
                const providerLabel = resolveProviderLabel(
                  item,
                  providerLabelByKey,
                );
                const lastHeartbeatAt =
                  item.instance?.lastHeartbeatAt ?? item.world.lastHeartbeatAt;

                return (
                  <tr
                    key={item.world.id}
                    className="border-t border-[color:var(--border-faint)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/worlds/$worldId"
                        params={{ worldId: item.world.id }}
                        className="text-[color:var(--text-primary)] hover:underline"
                      >
                        {item.world.name}
                      </Link>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {item.world.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[color:var(--text-primary)]">
                        {providerLabel}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {resolveProviderKey(item) || "No provider key"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[color:var(--text-primary)]">
                        {item.instance?.name ?? "No instance attached"}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                        {item.instance?.publicIp ??
                          item.instance?.privateIp ??
                          item.instance?.providerInstanceId ??
                          "No IP / provider instance id"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getPowerStateTone(powerState)}`}
                      >
                        {formatPowerStateLabel(powerState)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {attention ? (
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getAttentionTone(attention.severity)}`}
                          >
                            {getAttentionLabel(attention)}
                          </span>
                          <div className="max-w-[16rem] text-xs text-[color:var(--text-secondary)]">
                            {attention.message}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[color:var(--text-secondary)]">
                          Healthy
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getHealthTone(item.world.healthStatus)}`}
                      >
                        {item.world.healthStatus ?? "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[16rem] truncate text-[color:var(--text-secondary)]">
                        API: {item.world.apiBaseUrl ?? "Not set"}
                      </div>
                      <div className="mt-1 max-w-[16rem] truncate text-xs text-[color:var(--text-muted)]">
                        Admin: {item.world.adminUrl ?? "Not set"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(lastHeartbeatAt)}
                    </td>
                    <td className="px-4 py-3">
                      <WorldLifecycleActionButtons
                        actions={listAllowedWorldActions(
                          item.world.status,
                          WORLDS_PAGE_ACTIONS,
                        )}
                        world={item.world}
                        pendingAction={
                          quickActionMutation.isPending &&
                          quickActionMutation.variables?.worldId === item.world.id
                            ? quickActionMutation.variables.action
                            : null
                        }
                        disabled={quickActionMutation.isPending}
                        onAction={(action) => {
                          if (requiresWorldActionConfirmation(action)) {
                            setConfirmAction({
                              worldId: item.world.id,
                              worldName: item.world.name,
                              action,
                            });
                            return;
                          }

                          quickActionMutation.mutate({
                            worldId: item.world.id,
                            action,
                          });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {instanceFleetQuery.isError &&
          instanceFleetQuery.error instanceof Error ? (
            <div className="p-4">
              <CloudAdminErrorBlock error={instanceFleetQuery.error} />
            </div>
          ) : null}

          {instanceFleetQuery.isLoading ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              Loading instances...
            </div>
          ) : null}

          {!instanceFleetQuery.isLoading &&
          !instanceFleetQuery.isError &&
          !filteredInstanceFleet.length ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              No instance rows match the current filter set.
            </div>
          ) : null}
        </div>
      </section>

      <ConsoleConfirmDialog
        open={Boolean(activeConfirm && confirmAction)}
        title={activeConfirm?.title ?? ""}
        description={activeConfirm?.description ?? ""}
        confirmLabel={activeConfirm?.confirmLabel}
        pendingLabel={activeConfirm?.pendingLabel}
        danger={activeConfirm?.danger}
        pending={
          Boolean(confirmAction) &&
          quickActionMutation.isPending &&
          quickActionMutation.variables?.worldId === confirmAction?.worldId &&
          quickActionMutation.variables?.action === confirmAction?.action
        }
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) {
            return;
          }

          quickActionMutation.mutate({
            worldId: confirmAction.worldId,
            action: confirmAction.action,
          });
        }}
      />
    </div>
  );
}
