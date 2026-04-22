import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type {
  CloudComputeProviderSummary,
  CloudWorldInstanceFleetItem,
  WorldLifecycleJobSummary,
} from "@yinjie/contracts";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { useConsoleNotice } from "../components/console-notice";
import { WorldLifecycleActionButtons } from "../components/world-lifecycle-action-buttons";
import {
  groupJobsByQueueState,
  QUEUE_STATE_FILTERS,
} from "../lib/job-queue-state";
import {
  describeJobResult,
  getJobAuditBadgeLabel,
} from "../lib/job-result";
import {
  JOB_AUDIT_FILTERS,
  JOB_SUPERSEDED_BY_FILTERS,
  buildJobsRouteSearch,
  JOB_STATUS_FILTERS,
  JOB_TYPE_FILTERS,
  type JobAuditFilter,
  type JobSupersededByFilter,
  type JobStatusFilter,
  type JobTypeFilter,
  type JobsRouteSearch,
} from "../lib/job-route-search";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";
import {
  JOBS_PAGE_ACTIONS,
  createWorldActionConfirmationCopy,
  requiresWorldActionConfirmation,
  type ConfirmableWorldLifecycleAction,
  createWorldActionLabel,
  listAllowedWorldActions,
  performWorldLifecycleActionWithMeta,
  type WorldLifecycleAction,
} from "../lib/world-lifecycle-actions";

const UNASSIGNED_PROVIDER_FILTER = "__unassigned__";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatLeaseOwner(value?: string | null) {
  return value || "Unleased";
}

function formatDuration(value?: number | null) {
  if (value == null) {
    return "Not leased";
  }

  if (value <= 0) {
    return "Expired";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function getStatusTone(status: WorldLifecycleJobSummary["status"]) {
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

function resolveProviderKey(item: CloudWorldInstanceFleetItem) {
  return item.instance?.providerKey?.trim() || item.world.providerKey?.trim() || "";
}

function buildProviderLabelMap(providers: CloudComputeProviderSummary[] | undefined) {
  return new Map((providers ?? []).map((provider) => [provider.key, provider.label] as const));
}

const JOB_AUDIT_BADGE_CLASS_NAME =
  "rounded-full border border-amber-300/50 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100";

type QuickActionConfirmState = {
  worldId: string;
  worldName: string;
  action: ConfirmableWorldLifecycleAction;
};

export function JobsPage() {
  const navigate = useNavigate({ from: "/jobs" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const filters = useSearch({ from: "/jobs" });
  const [confirmAction, setConfirmAction] =
    useState<QuickActionConfirmState | null>(null);
  const status = filters.status;
  const jobType = filters.jobType;
  const providerFilter = filters.provider;
  const queueStateFilter = filters.queueState;
  const auditFilter = filters.audit;
  const supersededByFilter = filters.supersededBy;
  const query = filters.query;

  function updateFilters(next: Partial<JobsRouteSearch>) {
    void navigate({
      replace: true,
      search: (previous) => buildJobsRouteSearch({ ...previous, ...next }),
    });
  }

  const jobsQuery = useQuery({
    queryKey: [
      "cloud-console",
      "jobs",
      status,
      jobType,
      providerFilter,
      queueStateFilter,
      auditFilter,
      supersededByFilter,
      query,
    ],
    queryFn: () =>
      cloudAdminApi.listJobs({
        status: status === "all" ? undefined : status,
        jobType: jobType === "all" ? undefined : jobType,
        provider: providerFilter === "all" ? undefined : providerFilter,
        queueState:
          queueStateFilter === "all" ? undefined : queueStateFilter,
        audit: auditFilter === "all" ? undefined : auditFilter,
        supersededBy:
          supersededByFilter === "all" ? undefined : supersededByFilter,
        query: query || undefined,
      }),
    refetchInterval: 15_000,
  });
  const instanceFleetQuery = useQuery({
    queryKey: ["cloud-console", "jobs", "instances"],
    queryFn: () => cloudAdminApi.listInstances(),
    refetchInterval: 15_000,
  });
  const providersQuery = useQuery({
    queryKey: ["cloud-console", "jobs", "providers"],
    queryFn: () => cloudAdminApi.listProviders(),
  });

  const providerLabelByKey = useMemo(
    () => buildProviderLabelMap(providersQuery.data),
    [providersQuery.data],
  );
  const worldInfoById = useMemo(
    () =>
      new Map(
        (instanceFleetQuery.data ?? []).map((item) => {
          const providerKey = resolveProviderKey(item);
          const providerLabel = providerKey
            ? (providerLabelByKey.get(providerKey) ?? providerKey)
            : "Unassigned";

          return [
            item.world.id,
            {
              name: item.world.name,
              phone: item.world.phone,
              status: item.world.status,
              providerKey,
              providerLabel,
              powerState: item.instance?.powerState ?? "absent",
            },
          ] as const;
        }),
      ),
    [instanceFleetQuery.data, providerLabelByKey],
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
  const jobs = useMemo(() => {
    return jobsQuery.data ?? [];
  }, [jobsQuery.data]);
  const groupedJobs = useMemo(
    () => groupJobsByQueueState(jobs, Date.now()),
    [jobs],
  );
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
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "jobs"] }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "jobs", "world", variables.worldId],
        }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "instances"] }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "world"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "world-instance"],
        }),
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
  const pageErrors = [
    jobsQuery.error,
    instanceFleetQuery.error,
    providersQuery.error,
  ].filter((error): error is Error => error instanceof Error);

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            Lifecycle jobs
          </div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            Inspect provisioning, resume, suspend, and reconcile work across the
            managed world fleet.
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <input
            value={query}
            onChange={(event) => updateFilters({ query: event.target.value })}
            placeholder="Search world, phone, job, lease..."
            className="min-w-[16rem] rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
          />

          <select
            value={status}
            onChange={(event) =>
              updateFilters({
                status: event.target.value as JobStatusFilter,
              })
            }
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
            onChange={(event) =>
              updateFilters({
                jobType: event.target.value as JobTypeFilter,
              })
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            {JOB_TYPE_FILTERS.map((item) => (
              <option key={item} value={item}>
                type: {item}
              </option>
              ))}
          </select>

          <select
            value={providerFilter}
            onChange={(event) =>
              updateFilters({ provider: event.target.value })
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            <option value="all">provider: all</option>
            {providerOptions.map((provider) => (
              <option key={provider.key} value={provider.key}>
                provider: {provider.label}
              </option>
            ))}
          </select>

          <select
            value={queueStateFilter}
            onChange={(event) =>
              updateFilters({
                queueState: event.target.value as JobsRouteSearch["queueState"],
              })
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {QUEUE_STATE_FILTERS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </select>

          <select
            value={auditFilter}
            onChange={(event) =>
              updateFilters({
                audit: event.target.value as JobAuditFilter,
              })
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            {JOB_AUDIT_FILTERS.map((item) => (
              <option key={item} value={item}>
                audit: {item}
              </option>
            ))}
          </select>

          <select
            value={supersededByFilter}
            onChange={(event) =>
              updateFilters({
                supersededBy: event.target.value as JobSupersededByFilter,
              })
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            {JOB_SUPERSEDED_BY_FILTERS.map((item) => (
              <option key={item} value={item}>
                superseded by: {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {groupedJobs.map((group) => (
          <div
            key={group.state.key}
            className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] ${group.state.tone}`}
          >
            {group.state.label}: {group.jobs.length}
          </div>
        ))}
      </div>

      {pageErrors.length ? (
        <div className="mt-4 space-y-3">
          {pageErrors.map((error) => (
            <CloudAdminErrorBlock key={error.message} error={error} />
          ))}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
        <table className="min-w-[84rem] border-collapse text-left text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">World</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Lease</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Finished</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupedJobs.flatMap((group) => [
              <tr
                key={`group-${group.state.key}`}
                className="border-t border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
              >
                <td
                  colSpan={10}
                  className="px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${group.state.tone}`}
                    >
                      {group.state.label}
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      {group.jobs.length} jobs
                    </span>
                  </div>
                </td>
              </tr>,
              ...group.jobs.map((job) => {
                const worldInfo = worldInfoById.get(job.worldId);
                const actions: readonly WorldLifecycleAction[] = worldInfo
                  ? listAllowedWorldActions(
                      worldInfo.status,
                      JOBS_PAGE_ACTIONS,
                    )
                  : ["reconcile"];
                const auditBadgeLabel = getJobAuditBadgeLabel(job);

                return (
                  <tr
                    key={job.id}
                    className="border-t border-[color:var(--border-faint)]"
                  >
                    <td className="px-4 py-3">
                      <div className="text-[color:var(--text-primary)]">
                        {job.jobType}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {job.id}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[color:var(--text-primary)]">
                        <Link
                          to="/worlds/$worldId"
                          params={{ worldId: job.worldId }}
                          className="underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text-secondary)]"
                        >
                          {worldInfo?.name ?? job.worldId}
                        </Link>
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {worldInfo?.phone ?? "Phone unavailable"} ·{" "}
                        {worldInfo?.status ?? "unknown"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      <div>{worldInfo?.providerLabel ?? "Unassigned"}</div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        power {worldInfo?.powerState ?? "absent"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getStatusTone(
                          job.status,
                        )}`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {job.attempt} / {job.maxAttempts}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      <div>{formatLeaseOwner(job.leaseOwner)}</div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        remaining {formatDuration(job.leaseRemainingSeconds)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        expires {formatDateTime(job.leaseExpiresAt)}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        available {formatDateTime(job.availableAt)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(job.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(job.finishedAt)}
                    </td>
                    <td className="max-w-[20rem] px-4 py-3 text-[color:var(--text-secondary)]">
                      {auditBadgeLabel ? (
                        <div className="mb-2">
                          <span className={JOB_AUDIT_BADGE_CLASS_NAME}>
                            {auditBadgeLabel}
                          </span>
                        </div>
                      ) : null}
                      <div>{describeJobResult(job)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <WorldLifecycleActionButtons
                        actions={actions}
                        world={{ name: worldInfo?.name ?? job.worldId }}
                        pendingAction={
                          quickActionMutation.isPending &&
                          quickActionMutation.variables?.worldId === job.worldId
                            ? quickActionMutation.variables.action
                            : null
                        }
                        disabled={quickActionMutation.isPending}
                        onAction={(action) => {
                          if (requiresWorldActionConfirmation(action)) {
                            setConfirmAction({
                              worldId: job.worldId,
                              worldName: worldInfo?.name ?? job.worldId,
                              action,
                            });
                            return;
                          }

                          quickActionMutation.mutate({
                            worldId: job.worldId,
                            action,
                          });
                        }}
                      />
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>

        {jobsQuery.isLoading ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">
            Loading jobs...
          </div>
        ) : null}

        {!jobsQuery.isLoading && !pageErrors.length && jobs.length === 0 ? (
          <div className="p-4 text-sm text-[color:var(--text-muted)]">
            No jobs match this filter.
          </div>
        ) : null}
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
