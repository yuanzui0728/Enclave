import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  CloudComputeProviderSummary,
  CloudInstancePowerState,
  CloudWorldAttentionItem,
  CloudWorldInstanceFleetItem,
  WorldLifecycleJobSummary,
} from "@yinjie/contracts";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { useConsoleNotice } from "../components/console-notice";
import {
  RequestProjectionBadges,
  RequestStatusBadge,
} from "../components/request-controls";
import { WorldLifecycleActionButtons } from "../components/world-lifecycle-action-buttons";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { resolveQueueState } from "../lib/job-queue-state";
import { buildJobsRouteSearch } from "../lib/job-route-search";
import {
  getRequestStatusTone,
  getRequestToneStyles,
  getRequestWorkflowProjection,
  isRequestWorkflowCardStatus,
  REQUEST_WORKFLOW_CARD_STATUSES,
} from "../lib/request-helpers";
import { buildRequestsRouteSearch } from "../lib/request-route-search";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";
import {
  DASHBOARD_ACTIVE_JOB_ACTIONS,
  DASHBOARD_ATTENTION_ACTIONS,
  DASHBOARD_FAILED_JOB_ACTIONS,
  createWorldActionConfirmationCopy,
  createWorldActionLabel,
  listAllowedWorldActions,
  performWorldLifecycleActionWithMeta,
  requiresWorldActionConfirmation,
  type ConfirmableWorldLifecycleAction,
  type WorldLifecycleAction,
} from "../lib/world-lifecycle-actions";
import {
  buildWorldsRouteSearch,
  UNASSIGNED_PROVIDER_FILTER,
} from "../lib/world-route-search";

function getMetricTone(value: number) {
  if (value > 0) {
    return "text-[color:var(--text-primary)]";
  }

  return "text-[color:var(--text-secondary)]";
}

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

function getPowerStateTone(powerState: CloudInstancePowerState) {
  switch (powerState) {
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

function formatPowerState(powerState: CloudInstancePowerState) {
  switch (powerState) {
    case "running":
      return "Running";
    case "starting":
      return "Starting";
    case "provisioning":
      return "Provisioning";
    case "stopped":
      return "Stopped";
    case "stopping":
      return "Stopping";
    case "error":
      return "Error";
    case "absent":
    default:
      return "Absent";
  }
}

function resolveProviderKey(item: CloudWorldInstanceFleetItem) {
  return item.instance?.providerKey?.trim() || item.world.providerKey?.trim() || "";
}

function resolvePowerState(item: CloudWorldInstanceFleetItem): CloudInstancePowerState {
  return item.instance?.powerState ?? "absent";
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

function buildProviderLabelMap(providers: CloudComputeProviderSummary[] | undefined) {
  return new Map((providers ?? []).map((provider) => [provider.key, provider.label] as const));
}

function getJobStatusTone(status: WorldLifecycleJobSummary["status"]) {
  switch (status) {
    case "running":
      return "border-sky-300/50 bg-sky-500/10 text-sky-100";
    case "pending":
      return "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-primary)]";
    case "failed":
      return "border-rose-300/60 bg-rose-500/10 text-rose-200";
    case "succeeded":
      return "border-emerald-300/50 bg-emerald-500/10 text-emerald-100";
    case "cancelled":
    default:
      return "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
  }
}

function describeJobResult(job: WorldLifecycleJobSummary) {
  if (typeof job.resultPayload?.action === "string") {
    return job.resultPayload.action;
  }

  return job.failureMessage ?? "No result payload";
}

function compareNewest(left?: string | null, right?: string | null) {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

function buildAttentionWorldSearch(item: CloudWorldAttentionItem) {
  return buildWorldsRouteSearch({
    attention: item.severity,
  });
}

function buildAttentionJobsSearch(item: CloudWorldAttentionItem) {
  return buildJobsRouteSearch({
    query: item.phone,
    jobType: item.activeJobType ?? "all",
    status:
      item.reason === "failed_world" || item.reason === "provider_error"
        ? "failed"
        : "all",
  });
}

function describeAttentionJobsLabel(item: CloudWorldAttentionItem) {
  if (item.activeJobType) {
    return `${item.activeJobType} jobs`;
  }

  return "Related jobs";
}

function buildPendingRequestsSearch() {
  return buildRequestsRouteSearch({
    status: "pending",
    projectedWorldStatus: "queued",
    desiredState: "running",
  });
}

function buildProvisioningRequestsSearch() {
  return buildRequestsRouteSearch({
    status: "provisioning",
    projectedWorldStatus: "creating",
    desiredState: "running",
  });
}

function buildRejectedRequestsSearch() {
  return buildRequestsRouteSearch({
    status: "rejected",
    projectedWorldStatus: "failed",
    desiredState: "running",
  });
}

function buildDisabledRequestsSearch() {
  return buildRequestsRouteSearch({
    status: "disabled",
    projectedWorldStatus: "disabled",
    desiredState: "sleeping",
  });
}

type QuickActionConfirmState = {
  worldId: string;
  worldName: string;
  action: ConfirmableWorldLifecycleAction;
};

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const [confirmAction, setConfirmAction] =
    useState<QuickActionConfirmState | null>(null);
  const driftSummaryQuery = useQuery({
    queryKey: ["cloud-console", "dashboard", "drift-summary"],
    queryFn: () => cloudAdminApi.getWorldDriftSummary(),
    refetchInterval: 15_000,
  });
  const instanceFleetQuery = useQuery({
    queryKey: ["cloud-console", "dashboard", "instances"],
    queryFn: () => cloudAdminApi.listInstances(),
    refetchInterval: 15_000,
  });
  const providersQuery = useQuery({
    queryKey: ["cloud-console", "dashboard", "providers"],
    queryFn: () => cloudAdminApi.listProviders(),
  });
  const jobsQuery = useQuery({
    queryKey: ["cloud-console", "dashboard", "jobs"],
    queryFn: () => cloudAdminApi.listJobs(),
    refetchInterval: 15_000,
  });
  const requestsQuery = useQuery({
    queryKey: ["cloud-console", "dashboard", "requests"],
    queryFn: () => cloudAdminApi.listRequests(),
    refetchInterval: 15_000,
  });

  const driftSummary = driftSummaryQuery.data;
  const attentionItems = driftSummary?.attentionItems ?? [];
  const fleetItems = instanceFleetQuery.data ?? [];
  const providerLabelByKey = useMemo(
    () => buildProviderLabelMap(providersQuery.data),
    [providersQuery.data],
  );
  const fleetSummary = useMemo(() => {
    const summary = {
      running: 0,
      stopped: 0,
      error: 0,
      absent: 0,
      assignedProviders: new Set<string>(),
      unassignedWorlds: 0,
    };

    for (const item of fleetItems) {
      const powerState = resolvePowerState(item);
      if (powerState === "running") {
        summary.running += 1;
      } else if (powerState === "stopped") {
        summary.stopped += 1;
      } else if (powerState === "error") {
        summary.error += 1;
      } else if (powerState === "absent") {
        summary.absent += 1;
      }

      const providerKey = resolveProviderKey(item);
      if (providerKey) {
        summary.assignedProviders.add(providerKey);
      } else {
        summary.unassignedWorlds += 1;
      }
    }

    return summary;
  }, [fleetItems]);
  const providerSummary = useMemo(() => {
    const summaryByProvider = new Map<
      string,
      {
        key: string;
        label: string;
        worlds: number;
        running: number;
        error: number;
      }
    >();

    for (const item of fleetItems) {
      const providerKey = resolveProviderKey(item) || "__unassigned__";
      const label =
        providerKey === "__unassigned__"
          ? "Unassigned"
          : (providerLabelByKey.get(providerKey) ?? providerKey);
      const powerState = resolvePowerState(item);
      const entry = summaryByProvider.get(providerKey) ?? {
        key: providerKey,
        label,
        worlds: 0,
        running: 0,
        error: 0,
      };

      entry.worlds += 1;
      if (powerState === "running") {
        entry.running += 1;
      }
      if (powerState === "error") {
        entry.error += 1;
      }

      summaryByProvider.set(providerKey, entry);
    }

    return [...summaryByProvider.values()]
      .sort((left, right) => right.worlds - left.worlds || left.label.localeCompare(right.label))
      .slice(0, 4);
  }, [fleetItems, providerLabelByKey]);
  const fleetMetaByWorldId = useMemo(
    () =>
      new Map(
        fleetItems.map((item) => [
          item.world.id,
          {
            worldName: item.world.name,
            phone: item.world.phone,
            status: item.world.status,
            providerLabel: resolveProviderLabel(item, providerLabelByKey),
            powerState: resolvePowerState(item),
          },
        ] as const),
      ),
    [fleetItems, providerLabelByKey],
  );
  const activeJobs = useMemo(
    () =>
      (jobsQuery.data ?? [])
        .filter((job) => job.status === "pending" || job.status === "running")
        .sort((left, right) => compareNewest(left.updatedAt, right.updatedAt))
        .slice(0, 6),
    [jobsQuery.data],
  );
  const queueStateSummary = useMemo(() => {
    const counts = {
      running_now: 0,
      lease_expired: 0,
      delayed: 0,
    };

    for (const job of jobsQuery.data ?? []) {
      const queueState = resolveQueueState(job).key;
      if (queueState === "running_now") {
        counts.running_now += 1;
      } else if (queueState === "lease_expired") {
        counts.lease_expired += 1;
      } else if (queueState === "delayed") {
        counts.delayed += 1;
      }
    }

    return [
      {
        key: "running_now",
        label: "Running jobs",
        count: counts.running_now,
      },
      {
        key: "lease_expired",
        label: "Lease expired jobs",
        count: counts.lease_expired,
      },
      {
        key: "delayed",
        label: "Delayed jobs",
        count: counts.delayed,
      },
    ] as const;
  }, [jobsQuery.data]);
  const failedJobCount = useMemo(
    () => (jobsQuery.data ?? []).filter((job) => job.status === "failed").length,
    [jobsQuery.data],
  );
  const failedJobs = useMemo(
    () =>
      (jobsQuery.data ?? [])
        .filter((job) => job.status === "failed")
        .sort((left, right) => compareNewest(left.updatedAt, right.updatedAt))
        .slice(0, 4),
    [jobsQuery.data],
  );
  const requestWorkflowSummary = useMemo(() => {
    const counts = {
      pending: 0,
      provisioning: 0,
      rejected: 0,
      disabled: 0,
    } satisfies Record<(typeof REQUEST_WORKFLOW_CARD_STATUSES)[number], number>;

    for (const request of requestsQuery.data ?? []) {
      if (isRequestWorkflowCardStatus(request.status)) {
        counts[request.status] += 1;
      }
    }

    return {
      total: (requestsQuery.data ?? []).length,
      cards: [
        {
          key: "pending",
          label: "Pending approvals",
          compactLabel: "Pending",
          tone: getRequestStatusTone("pending"),
          ...getRequestWorkflowProjection("pending"),
          count: counts.pending,
          search: buildPendingRequestsSearch(),
          ariaLabel: "Open pending requests",
          alertAriaLabel: "Open pending requests from request alerts",
        },
        {
          key: "provisioning",
          label: "Provisioning handoffs",
          compactLabel: "Provisioning",
          tone: getRequestStatusTone("provisioning"),
          ...getRequestWorkflowProjection("provisioning"),
          count: counts.provisioning,
          search: buildProvisioningRequestsSearch(),
          ariaLabel: "Open provisioning requests",
          alertAriaLabel: "Open provisioning requests from request alerts",
        },
        {
          key: "rejected",
          label: "Rejected requests",
          compactLabel: "Rejected",
          tone: getRequestStatusTone("rejected"),
          ...getRequestWorkflowProjection("rejected"),
          count: counts.rejected,
          search: buildRejectedRequestsSearch(),
          ariaLabel: "Open rejected requests",
          alertAriaLabel: "Open rejected requests from request alerts",
        },
        {
          key: "disabled",
          label: "Disabled requests",
          compactLabel: "Disabled",
          tone: getRequestStatusTone("disabled"),
          ...getRequestWorkflowProjection("disabled"),
          count: counts.disabled,
          search: buildDisabledRequestsSearch(),
          ariaLabel: "Open disabled requests",
          alertAriaLabel: "Open disabled requests from request alerts",
        },
      ] as const,
    };
  }, [requestsQuery.data]);
  const recentRequests = useMemo(
    () =>
      [...(requestsQuery.data ?? [])]
        .sort((left, right) => compareNewest(left.updatedAt, right.updatedAt))
        .slice(0, 4),
    [requestsQuery.data],
  );
  const quickActionMutation = useMutation({
    mutationFn: (input: { worldId: string; action: WorldLifecycleAction }) =>
      performWorldLifecycleActionWithMeta(input.worldId, input.action),
    onSuccess: async (response, variables) => {
      if (requiresWorldActionConfirmation(variables.action)) {
        setConfirmAction(null);
      }
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          createWorldActionLabel(variables.action, response.data),
          "success",
          response.requestId,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "instances"] }),
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
  const pageErrors = [
    driftSummaryQuery.error,
    instanceFleetQuery.error,
    providersQuery.error,
    jobsQuery.error,
    requestsQuery.error,
  ].filter((error): error is Error => error instanceof Error);
  const activeConfirm = confirmAction
    ? createWorldActionConfirmationCopy(confirmAction.action, {
        name: confirmAction.worldName,
      })
    : null;

  function handleQuickAction(
    worldId: string,
    worldName: string,
    action: WorldLifecycleAction,
  ) {
    if (requiresWorldActionConfirmation(action)) {
      setConfirmAction({
        worldId,
        worldName,
        action,
      });
      return;
    }

    quickActionMutation.mutate({
      worldId,
      action,
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">
              Fleet Dashboard
            </div>
            <div className="mt-1 max-w-3xl text-sm text-[color:var(--text-secondary)]">
              Quick view of world availability, queued recovery, and the most
              urgent runtime drift signals across the cloud fleet.
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              to="/worlds"
              search={buildWorldsRouteSearch()}
              className="rounded-full border border-[color:var(--border-faint)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              Open worlds
            </Link>
            <Link
              to="/jobs"
              search={buildJobsRouteSearch()}
              className="rounded-full border border-[color:var(--border-faint)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
            >
              Inspect jobs
            </Link>
          </div>
        </div>

        {pageErrors.length ? (
          <div className="mt-4 space-y-3">
            {pageErrors.map((error) => (
              <CloudAdminErrorBlock key={error.message} error={error} />
            ))}
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                Request alerts
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                Approval and projected-world shortcuts surfaced in the main
                dashboard header.
              </div>
            </div>

            <Link
              to="/requests"
              search={buildRequestsRouteSearch()}
              aria-label="Open all requests from request alerts"
              className="text-sm text-[color:var(--text-secondary)] underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text-primary)]"
            >
              Review requests ({requestWorkflowSummary.total})
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {requestWorkflowSummary.cards.map((item) => {
              const toneStyles = getRequestToneStyles(item.tone);
              return (
                <Link
                  key={`alert-${item.key}`}
                  to="/requests"
                  search={item.search}
                  aria-label={item.alertAriaLabel}
                  data-tone={item.tone}
                  className={`rounded-2xl border p-3 transition ${toneStyles.panel}`}
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    {item.compactLabel}
                  </div>
                  <div className={`mt-2 text-2xl font-semibold ${toneStyles.count}`}>
                    {item.count}
                  </div>
                  <RequestProjectionBadges
                    projectedWorldStatus={item.projectedWorldStatus}
                    projectedDesiredState={item.projectedDesiredState}
                    projectedLabel="Projected:"
                    desiredLabel="Desired:"
                    projectedRowClassName={`mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${toneStyles.detail}`}
                    desiredRowClassName={`mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${toneStyles.detail}`}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            to="/worlds"
            search={buildWorldsRouteSearch({ status: "ready" })}
            aria-label="Filter worlds by ready status"
            className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 transition hover:border-[color:var(--border-strong)]"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Ready worlds
            </div>
            <div
              className={`mt-3 text-3xl font-semibold ${getMetricTone(
                driftSummary?.readyWorlds ?? 0,
              )}`}
            >
              {driftSummary?.readyWorlds ?? 0}
            </div>
            <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
              Total fleet: {driftSummary?.totalWorlds ?? 0}
            </div>
          </Link>

          <Link
            to="/worlds"
            search={buildWorldsRouteSearch({ attention: "critical" })}
            aria-label="Filter worlds by critical attention"
            className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 transition hover:border-[color:var(--border-strong)]"
          >
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Critical attention
            </div>
            <div
              className={`mt-3 text-3xl font-semibold ${getMetricTone(
                driftSummary?.criticalAttentionWorlds ?? 0,
              )}`}
            >
              {driftSummary?.criticalAttentionWorlds ?? 0}
            </div>
            <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
              Warning: {driftSummary?.warningAttentionWorlds ?? 0}
            </div>
          </Link>

          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Recovery queued
            </div>
            <div
              className={`mt-3 text-3xl font-semibold ${getMetricTone(
                driftSummary?.recoveryQueuedWorlds ?? 0,
              )}`}
            >
              {driftSummary?.recoveryQueuedWorlds ?? 0}
            </div>
            <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
              Heartbeat stale: {driftSummary?.heartbeatStaleWorlds ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Provider drift
            </div>
            <div
              className={`mt-3 text-3xl font-semibold ${getMetricTone(
                driftSummary?.providerDriftWorlds ?? 0,
              )}`}
            >
              {driftSummary?.providerDriftWorlds ?? 0}
            </div>
            <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
              Failed: {driftSummary?.failedWorlds ?? 0}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                Instance pool
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                {fleetItems.length} worlds
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Link
                to="/worlds"
                search={buildWorldsRouteSearch({ powerState: "running" })}
                aria-label="Filter worlds by running instances"
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Running
                </div>
                <div className={`mt-2 text-2xl font-semibold ${getMetricTone(fleetSummary.running)}`}>
                  {fleetSummary.running}
                </div>
              </Link>
              <Link
                to="/worlds"
                search={buildWorldsRouteSearch({ powerState: "stopped" })}
                aria-label="Filter worlds by stopped instances"
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Stopped
                </div>
                <div className={`mt-2 text-2xl font-semibold ${getMetricTone(fleetSummary.stopped)}`}>
                  {fleetSummary.stopped}
                </div>
              </Link>
              <Link
                to="/worlds"
                search={buildWorldsRouteSearch({ powerState: "error" })}
                aria-label="Filter worlds by error instances"
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Error
                </div>
                <div className={`mt-2 text-2xl font-semibold ${getMetricTone(fleetSummary.error)}`}>
                  {fleetSummary.error}
                </div>
              </Link>
              <Link
                to="/worlds"
                search={buildWorldsRouteSearch({
                  provider: UNASSIGNED_PROVIDER_FILTER,
                })}
                aria-label="Filter worlds by unassigned provider"
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Unassigned
                </div>
                <div
                  className={`mt-2 text-2xl font-semibold ${getMetricTone(fleetSummary.unassignedWorlds)}`}
                >
                  {fleetSummary.unassignedWorlds}
                </div>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                Provider spread
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                {fleetSummary.assignedProviders.size} active providers
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {providerSummary.map((provider) => (
                <Link
                  key={provider.key}
                  to="/worlds"
                  search={buildWorldsRouteSearch({ provider: provider.key })}
                  aria-label={`Filter worlds by provider ${provider.label}`}
                  className="block rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 transition hover:border-[color:var(--border-strong)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[color:var(--text-primary)]">
                      {provider.label}
                    </div>
                    <div className="text-xs text-[color:var(--text-muted)]">
                      {provider.worlds} worlds
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[color:var(--text-secondary)]">
                    Running {provider.running} · Error {provider.error}
                  </div>
                </Link>
              ))}

              {!instanceFleetQuery.isLoading && providerSummary.length === 0 ? (
                <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3 text-sm text-[color:var(--text-muted)]">
                  No provider allocation data yet.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          Last generated {formatDateTime(driftSummary?.generatedAt)}
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[color:var(--text-primary)]">
              Request Workflow
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Approval and manual delivery queue shortcuts wired to the request
              projection filters.
            </div>
          </div>

          <Link
            to="/requests"
            search={buildRequestsRouteSearch()}
            className="text-sm text-[color:var(--text-secondary)] underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text-primary)]"
          >
            Open requests ({requestWorkflowSummary.total})
          </Link>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {requestWorkflowSummary.cards.map((item) => {
            const toneStyles = getRequestToneStyles(item.tone);
            return (
              <Link
                key={item.key}
                to="/requests"
                search={item.search}
                aria-label={item.ariaLabel}
                data-tone={item.tone}
                className={`rounded-2xl border p-4 transition ${toneStyles.panel}`}
              >
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                  {item.label}
                </div>
                <div className={`mt-3 text-3xl font-semibold ${toneStyles.count}`}>
                  {item.count}
                </div>
                <RequestProjectionBadges
                  projectedWorldStatus={item.projectedWorldStatus}
                  projectedDesiredState={item.projectedDesiredState}
                  projectedLabel="Projected:"
                  desiredLabel="Desired:"
                  projectedRowClassName={`mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${toneStyles.detail}`}
                  desiredRowClassName={`mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${toneStyles.detail}`}
                />
              </Link>
            );
          })}
        </div>

        {recentRequests.length ? (
          <div className="mt-5">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              Recent request changes
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {recentRequests.map((request) => {
                return (
                  <Link
                    key={request.id}
                    to="/requests/$requestId"
                    params={{ requestId: request.id }}
                    aria-label={`Open request ${request.worldName}`}
                    className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 transition hover:border-[color:var(--border-strong)]"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <RequestStatusBadge status={request.status} />
                      <span className="text-xs text-[color:var(--text-muted)]">
                        Updated {formatDateTime(request.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-[color:var(--text-primary)]">
                      {request.worldName}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                      {request.phone}
                    </div>
                    <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                      {request.displayStatus ?? request.note ?? "No request status detail"}
                    </div>
                    <RequestProjectionBadges
                      projectedWorldStatus={request.projectedWorldStatus}
                      projectedDesiredState={request.projectedDesiredState}
                      projectedLabel="Projected:"
                      desiredLabel="Desired:"
                      projectedRowClassName="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
                      desiredRowClassName="mt-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        {!requestsQuery.isLoading && requestWorkflowSummary.total === 0 ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-secondary)]">
            No request workflow items yet.
          </div>
        ) : null}

        {requestsQuery.isLoading ? (
          <div className="mt-4 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-muted)]">
            Loading request workflow...
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                Operator Queue
              </div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Pending and running lifecycle work across the instance fleet.
              </div>
            </div>

            <Link
              to="/jobs"
              search={buildJobsRouteSearch()}
              className="text-sm text-[color:var(--text-secondary)] underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text-primary)]"
            >
              Open jobs
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {queueStateSummary.map((item) => (
              <Link
                key={item.key}
                to="/jobs"
                search={buildJobsRouteSearch({ queueState: item.key })}
                className="rounded-full border border-[color:var(--border-faint)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
              >
                {item.label} {item.count}
              </Link>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {activeJobs.map((job) => {
              const worldMeta = fleetMetaByWorldId.get(job.worldId);
              const actions: readonly WorldLifecycleAction[] = worldMeta
                ? listAllowedWorldActions(
                    worldMeta.status,
                    DASHBOARD_ACTIVE_JOB_ACTIONS,
                  )
                : ["reconcile"];

              return (
                <div
                  key={job.id}
                  className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4"
                >
                  <Link
                    to="/worlds/$worldId"
                    params={{ worldId: job.worldId }}
                    className="block transition hover:opacity-90"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getJobStatusTone(
                          job.status,
                        )}`}
                      >
                        {job.status}
                      </span>
                      <span className="text-sm text-[color:var(--text-primary)]">
                        {job.jobType}
                      </span>
                      <span className="text-xs text-[color:var(--text-muted)]">
                        attempt {job.attempt}/{job.maxAttempts}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                      {worldMeta?.worldName ?? job.worldId}
                      {worldMeta?.phone ? ` · ${worldMeta.phone}` : ""}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-[color:var(--text-secondary)]">
                        {worldMeta?.providerLabel ?? "Unassigned"}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] ${getPowerStateTone(
                          worldMeta?.powerState ?? "absent",
                        )}`}
                      >
                        {formatPowerState(worldMeta?.powerState ?? "absent")}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                      Updated {formatDateTime(job.updatedAt)}
                    </div>
                  </Link>

                  <WorldLifecycleActionButtons
                    actions={actions}
                    world={{ name: worldMeta?.worldName ?? job.worldId }}
                    pendingAction={
                      quickActionMutation.isPending &&
                      quickActionMutation.variables?.worldId === job.worldId
                        ? quickActionMutation.variables.action
                        : null
                    }
                    disabled={quickActionMutation.isPending}
                    onAction={(action) =>
                      handleQuickAction(
                        job.worldId,
                        worldMeta?.worldName ?? job.worldId,
                        action,
                      )
                    }
                    className="mt-4 flex flex-wrap gap-2"
                    buttonClassName="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] disabled:opacity-60"
                  />
                </div>
              );
            })}

            {!jobsQuery.isLoading && activeJobs.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-secondary)]">
                No pending or running jobs in the operator queue.
              </div>
            ) : null}

            {jobsQuery.isLoading ? (
              <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-muted)]">
                Loading lifecycle jobs...
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                Recent Failures
              </div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                Latest failed lifecycle work that may need manual recovery.
              </div>
            </div>

            <Link
              to="/jobs"
              search={buildJobsRouteSearch({ status: "failed" })}
              className="text-sm text-[color:var(--text-secondary)] underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text-primary)]"
            >
              Open failed jobs ({failedJobCount})
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {failedJobs.map((job) => {
              const worldMeta = fleetMetaByWorldId.get(job.worldId);
              const actions: readonly WorldLifecycleAction[] = worldMeta
                ? listAllowedWorldActions(
                    worldMeta.status,
                    DASHBOARD_FAILED_JOB_ACTIONS,
                  )
                : ["reconcile"];

              return (
                <div
                  key={job.id}
                  className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4"
                >
                  <Link
                    to="/worlds/$worldId"
                    params={{ worldId: job.worldId }}
                    className="block transition hover:opacity-90"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getJobStatusTone(
                          job.status,
                        )}`}
                      >
                        {job.status}
                      </span>
                      <span className="text-sm text-[color:var(--text-primary)]">
                        {job.jobType}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                      {worldMeta?.worldName ?? job.worldId}
                      {worldMeta?.phone ? ` · ${worldMeta.phone}` : ""}
                    </div>
                    <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                      {describeJobResult(job)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-[color:var(--text-secondary)]">
                        {worldMeta?.providerLabel ?? "Unassigned"}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] ${getPowerStateTone(
                          worldMeta?.powerState ?? "absent",
                        )}`}
                      >
                        {formatPowerState(worldMeta?.powerState ?? "absent")}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                      Updated {formatDateTime(job.updatedAt)}
                    </div>
                  </Link>

                  <WorldLifecycleActionButtons
                    actions={actions}
                    world={{ name: worldMeta?.worldName ?? job.worldId }}
                    pendingAction={
                      quickActionMutation.isPending &&
                      quickActionMutation.variables?.worldId === job.worldId
                        ? quickActionMutation.variables.action
                        : null
                    }
                    disabled={quickActionMutation.isPending}
                    onAction={(action) =>
                      handleQuickAction(
                        job.worldId,
                        worldMeta?.worldName ?? job.worldId,
                        action,
                      )
                    }
                    className="mt-4 flex flex-wrap gap-2"
                    buttonClassName="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] disabled:opacity-60"
                  />
                </div>
              );
            })}

            {!jobsQuery.isLoading && failedJobs.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-secondary)]">
                No recent failed jobs.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[color:var(--text-primary)]">
              Attention Queue
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Most urgent worlds needing manual inspection or follow-up.
            </div>
          </div>

          <Link
            to="/worlds"
            search={buildWorldsRouteSearch()}
            className="text-sm text-[color:var(--text-secondary)] underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text-primary)]"
          >
            Open world fleet
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {attentionItems.map((item) => {
            const fleetMeta = fleetMetaByWorldId.get(item.worldId);
            const actions = listAllowedWorldActions(
              item.worldStatus,
              DASHBOARD_ATTENTION_ACTIONS,
            );

            return (
              <div
                key={item.worldId}
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4"
              >
                <Link
                  to="/worlds/$worldId"
                  params={{ worldId: item.worldId }}
                  className="block transition hover:opacity-90"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${getAttentionTone(
                        item.severity,
                      )}`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-sm text-[color:var(--text-primary)]">
                      {item.worldName}
                    </span>
                    <span className="text-xs text-[color:var(--text-muted)]">
                      {item.phone}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
                    {item.message}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-[color:var(--border-faint)] px-3 py-1 text-[color:var(--text-secondary)]">
                      {fleetMeta?.providerLabel ?? "Unassigned"}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 uppercase tracking-[0.18em] ${getPowerStateTone(
                        fleetMeta?.powerState ?? "absent",
                      )}`}
                    >
                      {formatPowerState(fleetMeta?.powerState ?? "absent")}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                    Status {item.worldStatus} · Updated{" "}
                    {formatDateTime(item.updatedAt)}
                  </div>
                </Link>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/worlds"
                    search={buildAttentionWorldSearch(item)}
                    aria-label={`Open worlds with ${item.severity} attention`}
                    className="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]"
                  >
                    {item.severity} worlds
                  </Link>
                  <Link
                    to="/jobs"
                    search={buildAttentionJobsSearch(item)}
                    aria-label={`Open jobs for ${item.worldName}`}
                    className="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]"
                  >
                    {describeAttentionJobsLabel(item)}
                  </Link>
                </div>

                <WorldLifecycleActionButtons
                  actions={actions}
                  world={{ name: item.worldName }}
                  pendingAction={
                    quickActionMutation.isPending &&
                    quickActionMutation.variables?.worldId === item.worldId
                      ? quickActionMutation.variables.action
                      : null
                  }
                  disabled={quickActionMutation.isPending}
                  onAction={(action) =>
                    handleQuickAction(item.worldId, item.worldName, action)
                  }
                  className="mt-4 flex flex-wrap gap-2"
                  buttonClassName="rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)] disabled:opacity-60"
                />
              </div>
            );
          })}

          {!driftSummaryQuery.isLoading &&
          !driftSummaryQuery.isError &&
          attentionItems.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-secondary)]">
              No active attention items. The fleet currently looks healthy.
            </div>
          ) : null}

          {driftSummaryQuery.isLoading ? (
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 text-sm text-[color:var(--text-muted)]">
              Loading fleet dashboard...
            </div>
          ) : null}
        </div>
      </div>

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
    </section>
  );
}
