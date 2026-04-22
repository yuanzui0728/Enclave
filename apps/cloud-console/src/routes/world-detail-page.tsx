import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type {
  CloudComputeProviderSummary,
  CloudWorldAttentionItem,
  CloudWorldLifecycleStatus,
  WorldLifecycleJobStatus,
} from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { useConsoleNotice } from "../components/console-notice";
import { WorldLifecycleActionButtons } from "../components/world-lifecycle-action-buttons";
import { copyTextToClipboard } from "../lib/clipboard";
import {
  groupJobsByQueueState,
  matchesQueueStateFilter,
  QUEUE_STATE_FILTERS,
  type QueueStateFilter,
} from "../lib/job-queue-state";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { describeJobResult, getJobAuditBadgeLabel } from "../lib/job-result";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";
import {
  ALL_WORLD_LIFECYCLE_ACTIONS,
  createWorldActionConfirmationCopy,
  createWorldActionLabel,
  listAllowedWorldActions,
  performWorldLifecycleActionWithMeta,
  requiresWorldActionConfirmation,
  type ConfirmableWorldLifecycleAction,
  type WorldLifecycleAction,
} from "../lib/world-lifecycle-actions";

const WORLD_STATUSES: CloudWorldLifecycleStatus[] = [
  "queued",
  "creating",
  "bootstrapping",
  "starting",
  "ready",
  "sleeping",
  "stopping",
  "failed",
  "disabled",
  "deleting",
];

const SECONDARY_ACTION_BUTTON =
  "rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60";
const JOB_AUDIT_BADGE_CLASS_NAME =
  "rounded-full border border-amber-300/50 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatLeaseOwner(value?: string | null) {
  if (!value) {
    return "Unleased";
  }

  return value;
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

function compareNewest(left?: string | null, right?: string | null) {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

function formatOptional(value?: string | null) {
  return value?.trim() || "Not set";
}

function getJobStatusTone(status: WorldLifecycleJobStatus) {
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

function getEscalationLabel(
  reason?: CloudWorldAttentionItem["escalationReason"] | null,
) {
  switch (reason) {
    case "world_failed":
      return "World failed";
    case "provider_error":
      return "Provider error";
    case "retry_threshold":
      return "Retry threshold";
    case "heartbeat_duration":
      return "Heartbeat duration";
    default:
      return "Not escalated";
  }
}

function resolveCanonicalProviderKey(value?: string | null) {
  return value?.trim() === "manual" ? "manual-docker" : value?.trim() || "";
}

function findProviderByKey(
  providers: CloudComputeProviderSummary[],
  providerKey: string,
) {
  const canonicalProviderKey = resolveCanonicalProviderKey(providerKey);
  return (
    providers.find((provider) => provider.key === canonicalProviderKey) ?? null
  );
}

function buildProviderOptions(
  providers: CloudComputeProviderSummary[],
  providerKey: string,
) {
  const selectedProvider = findProviderByKey(providers, providerKey);
  if (selectedProvider || !providerKey) {
    return providers;
  }

  return [
    ...providers,
    {
      key: providerKey,
      label: `${providerKey} (legacy)`,
      description: "This provider key is not in the current catalog yet.",
      provisionStrategy: providerKey,
      deploymentMode: "custom",
      defaultRegion: null,
      defaultZone: null,
      capabilities: {
        managedProvisioning: false,
        managedLifecycle: false,
        bootstrapPackage: false,
        snapshots: false,
      },
    },
  ];
}

function validateWorldForm(params: {
  phone: string;
  name: string;
  status: CloudWorldLifecycleStatus;
  apiBaseUrl: string;
}) {
  if (!params.phone.trim()) {
    return "Phone is required.";
  }

  if (!params.name.trim()) {
    return "World name is required.";
  }

  if (params.status === "ready" && !params.apiBaseUrl.trim()) {
    return "A ready world must include a world API base URL.";
  }

  return null;
}

function formatBootstrapCallbackEndpoints(endpoints: {
  bootstrap: string;
  heartbeat: string;
  activity: string;
  health: string;
  fail: string;
}) {
  return [
    `BOOTSTRAP=${endpoints.bootstrap}`,
    `HEARTBEAT=${endpoints.heartbeat}`,
    `ACTIVITY=${endpoints.activity}`,
    `HEALTH=${endpoints.health}`,
    `FAIL=${endpoints.fail}`,
  ].join("\n");
}

type WorldConfirmAction =
  | ConfirmableWorldLifecycleAction
  | "rotate-callback-token";

export function WorldDetailPage() {
  const { worldId } = useParams({ from: "/worlds/$worldId" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();

  const worldQuery = useQuery({
    queryKey: ["cloud-console", "world", worldId],
    queryFn: () => cloudAdminApi.getWorld(worldId),
  });
  const providersQuery = useQuery({
    queryKey: ["cloud-console", "providers"],
    queryFn: () => cloudAdminApi.listProviders(),
  });
  const instanceQuery = useQuery({
    queryKey: ["cloud-console", "world-instance", worldId],
    queryFn: () => cloudAdminApi.getWorldInstance(worldId),
  });
  const bootstrapConfigQuery = useQuery({
    queryKey: ["cloud-console", "world-bootstrap-config", worldId],
    queryFn: () => cloudAdminApi.getWorldBootstrapConfig(worldId),
  });
  const runtimeStatusQuery = useQuery({
    queryKey: ["cloud-console", "world-runtime-status", worldId],
    queryFn: () => cloudAdminApi.getWorldRuntimeStatus(worldId),
  });
  const alertSummaryQuery = useQuery({
    queryKey: ["cloud-console", "world-alert-summary", worldId],
    queryFn: () => cloudAdminApi.getWorldAlertSummary(worldId),
  });
  const jobsQuery = useQuery({
    queryKey: ["cloud-console", "jobs", "world", worldId],
    queryFn: () => cloudAdminApi.listJobs({ worldId, page: 1, pageSize: 20 }),
    refetchInterval: 15_000,
  });

  const [draftStatus, setDraftStatus] =
    useState<CloudWorldLifecycleStatus>("queued");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [provisionStrategy, setProvisionStrategy] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [providerRegion, setProviderRegion] = useState("");
  const [providerZone, setProviderZone] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");
  const [formHydrated, setFormHydrated] = useState(false);
  const [queueStateFilter, setQueueStateFilter] =
    useState<QueueStateFilter>("all");
  const [confirmAction, setConfirmAction] = useState<WorldConfirmAction | null>(
    null,
  );
  const validationMessage = formHydrated
    ? validateWorldForm({
        phone,
        name,
        status: draftStatus,
        apiBaseUrl,
      })
    : null;

  async function invalidateWorldQueries() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "world", worldId],
      }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "world-instance", worldId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "world-bootstrap-config", worldId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "world-runtime-status", worldId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "world-alert-summary", worldId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "world-drift-summary"],
      }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "jobs"] }),
    ]);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateWorldWithMeta(worldId, {
        phone,
        name,
        status: draftStatus,
        provisionStrategy,
        providerKey,
        providerRegion,
        providerZone,
        apiBaseUrl,
        adminUrl,
        note,
      }),
    onSuccess: async (response) => {
      await invalidateWorldQueries();
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          "World settings saved.",
          "success",
          response.requestId,
        ),
      );
    },
    onError: (error) => {
      showCloudAdminErrorNotice(showNotice, error);
    },
  });
  const worldActionMutation = useMutation({
    mutationFn: (action: WorldLifecycleAction) =>
      performWorldLifecycleActionWithMeta(worldId, action),
    onSuccess: async (response, action) => {
      await invalidateWorldQueries();
      if (action === "suspend" || action === "retry") {
        setConfirmAction(null);
      }
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          createWorldActionLabel(action, response.data),
          "success",
          response.requestId,
        ),
      );
    },
    onError: (error, action) => {
      if (requiresWorldActionConfirmation(action)) {
        setConfirmAction(null);
      }
      showCloudAdminErrorNotice(showNotice, error);
    },
  });
  const rotateCallbackTokenMutation = useMutation({
    mutationFn: () => cloudAdminApi.rotateWorldCallbackTokenWithMeta(worldId),
    onSuccess: async (response) => {
      await invalidateWorldQueries();
      setConfirmAction(null);
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          "Callback token rotated.",
          "success",
          response.requestId,
        ),
      );
    },
    onError: (error) => {
      setConfirmAction(null);
      showCloudAdminErrorNotice(showNotice, error);
    },
  });

  const world = worldQuery.data;
  const instance = instanceQuery.data;
  const bootstrapConfig = bootstrapConfigQuery.data;
  const runtimeStatus = runtimeStatusQuery.data;
  const alertSummary = alertSummaryQuery.data;
  const currentAlert = alertSummary?.item ?? null;
  const jobs = jobsQuery.data?.items ?? [];
  const now = Date.now();
  const visibleJobs = [...jobs]
    .filter((job) => matchesQueueStateFilter(job, queueStateFilter, now))
    .sort((left, right) => compareNewest(left.updatedAt, right.updatedAt));
  const groupedJobs = groupJobsByQueueState(visibleJobs, now);
  const providers = providersQuery.data ?? [];
  const providerOptions = buildProviderOptions(providers, providerKey);
  const selectedProvider = findProviderByKey(providerOptions, providerKey);
  async function copyValue(text: string, successMessage: string) {
    const copied = await copyTextToClipboard(text);
    showNotice(
      copied ? successMessage : "Clipboard copy failed in this environment.",
      copied ? "success" : "danger",
    );
  }

  function handleProviderKeyChange(nextProviderKey: string) {
    const nextProvider = findProviderByKey(providers, nextProviderKey);
    const previousProvider = findProviderByKey(providers, providerKey);

    setProviderKey(nextProviderKey);
    if (!nextProvider) {
      return;
    }

    setProvisionStrategy(nextProvider.provisionStrategy);

    if (
      !providerRegion ||
      providerRegion === (previousProvider?.defaultRegion ?? "")
    ) {
      setProviderRegion(nextProvider.defaultRegion ?? "");
    }
    if (
      !providerZone ||
      providerZone === (previousProvider?.defaultZone ?? "")
    ) {
      setProviderZone(nextProvider.defaultZone ?? "");
    }
  }

  useEffect(() => {
    if (!world) {
      return;
    }

    setDraftStatus(world.status);
    setPhone(world.phone);
    setName(world.name);
    setProvisionStrategy(world.provisionStrategy ?? "");
    setProviderKey(resolveCanonicalProviderKey(world.providerKey));
    setProviderRegion(world.providerRegion ?? "");
    setProviderZone(world.providerZone ?? "");
    setApiBaseUrl(world.apiBaseUrl ?? "");
    setAdminUrl(world.adminUrl ?? "");
    setNote(world.note ?? "");
    setFormHydrated(true);
  }, [world]);

  if (worldQuery.isError) {
    return <CloudAdminErrorBlock error={worldQuery.error} />;
  }

  if (!world) {
    return (
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">
        Loading world...
      </div>
    );
  }

  const actionPending =
    worldActionMutation.isPending ||
    rotateCallbackTokenMutation.isPending;
  const allowedActions = new Set(
    listAllowedWorldActions(world.status, ALL_WORLD_LIFECYCLE_ACTIONS),
  );
  const disabledDetailActions = ALL_WORLD_LIFECYCLE_ACTIONS.filter(
    (action) => !allowedActions.has(action),
  );
  const pendingWorldAction = worldActionMutation.isPending
    ? worldActionMutation.variables
    : null;
  const confirmLifecycleAction =
    confirmAction && confirmAction !== "rotate-callback-token"
      ? confirmAction
      : null;
  const sharedConfirmCopy =
    confirmLifecycleAction
      ? createWorldActionConfirmationCopy(confirmLifecycleAction, world)
      : null;
  let activeConfirm: {
    title: string;
    description: string;
    confirmLabel: string;
    pendingLabel: string;
    danger: boolean;
    pending: boolean;
    onConfirm: () => void;
  } | null = null;
  if (confirmLifecycleAction && sharedConfirmCopy) {
    const action = confirmLifecycleAction;
    activeConfirm = {
      ...sharedConfirmCopy,
      pending:
        worldActionMutation.isPending &&
        worldActionMutation.variables === action,
      onConfirm: () => worldActionMutation.mutate(action),
    };
  } else if (confirmAction === "rotate-callback-token") {
    activeConfirm = {
      title: "Rotate the callback token?",
      description:
        "Existing bootstrap packages and runtime env overlays will become stale until operators redeploy the updated token.",
      confirmLabel: "Rotate token",
      pendingLabel: "Rotating...",
      danger: true,
      pending: rotateCallbackTokenMutation.isPending,
      onConfirm: () => rotateCallbackTokenMutation.mutate(),
    };
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold text-[color:var(--text-primary)]">
                {world.name}
              </div>
              <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                {world.phone}
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
                {world.status}
              </div>
            </div>

            <WorldLifecycleActionButtons
              actions={ALL_WORLD_LIFECYCLE_ACTIONS}
              world={world}
              pendingAction={pendingWorldAction}
              disabled={actionPending}
              disabledActions={disabledDetailActions}
              onAction={(action) => {
                if (requiresWorldActionConfirmation(action)) {
                  setConfirmAction(action);
                  return;
                }

                worldActionMutation.mutate(action);
              }}
              className="flex flex-wrap gap-2"
              buttonClassName={SECONDARY_ACTION_BUTTON}
            />
          </div>

          <div className="mt-3 text-xs leading-6 text-[color:var(--text-muted)]">
            Resume is available for worlds that still need to move back toward
            running, including sleeping, failed, queued, and stopping states.
            Suspend is limited to worlds that are currently active. Retry is
            reserved for failed or in-flight lifecycle states.
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span>Phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span>World name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span>Status</span>
              <select
                value={draftStatus}
                onChange={(event) =>
                  setDraftStatus(
                    event.target.value as CloudWorldLifecycleStatus,
                  )
                }
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              >
                {WORLD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span>Provision strategy</span>
              <input
                value={provisionStrategy}
                onChange={(event) => setProvisionStrategy(event.target.value)}
                placeholder={selectedProvider?.provisionStrategy ?? "mock"}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span>Provider key</span>
              <select
                value={providerKey}
                onChange={(event) =>
                  handleProviderKeyChange(event.target.value)
                }
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              >
                {!providerKey ? (
                  <option value="">Select provider</option>
                ) : null}
                {providerOptions.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label} ({provider.key})
                  </option>
                ))}
              </select>
            </label>

            {providersQuery.isError && providersQuery.error instanceof Error ? (
              <CloudAdminErrorBlock error={providersQuery.error} />
            ) : null}

            {selectedProvider ? (
              <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Provider profile
                </div>
                <div className="mt-2 font-medium text-[color:var(--text-primary)]">
                  {selectedProvider.label}
                </div>
                <div className="mt-1 leading-6">
                  {selectedProvider.description}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>Deployment: {selectedProvider.deploymentMode}</div>
                  <div>
                    Default region:{" "}
                    {formatOptional(selectedProvider.defaultRegion)}
                  </div>
                  <div>
                    Default zone: {formatOptional(selectedProvider.defaultZone)}
                  </div>
                  <div>
                    Managed lifecycle:{" "}
                    {selectedProvider.capabilities.managedLifecycle
                      ? "Yes"
                      : "No"}
                  </div>
                  <div>
                    Managed provisioning:{" "}
                    {selectedProvider.capabilities.managedProvisioning
                      ? "Yes"
                      : "No"}
                  </div>
                  <div>
                    Snapshots:{" "}
                    {selectedProvider.capabilities.snapshots ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            ) : providersQuery.isLoading ? (
              <div className="text-sm text-[color:var(--text-muted)]">
                Loading provider catalog...
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span>Provider region</span>
                <input
                  value={providerRegion}
                  onChange={(event) => setProviderRegion(event.target.value)}
                  placeholder="mock-local"
                  className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span>Provider zone</span>
                <input
                  value={providerZone}
                  onChange={(event) => setProviderZone(event.target.value)}
                  placeholder="mock-a"
                  className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span>World API base URL</span>
              <input
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://world-api.example.com"
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span>World admin URL</span>
              <input
                value={adminUrl}
                onChange={(event) => setAdminUrl(event.target.value)}
                placeholder="https://world-admin.example.com"
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span>Ops note</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={5}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              />
            </label>

            <button
              type="button"
              disabled={
                updateMutation.isPending ||
                !formHydrated ||
                Boolean(validationMessage)
              }
              onClick={() => updateMutation.mutate()}
              className="rounded-xl bg-[color:var(--surface-secondary)] px-4 py-3 text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateMutation.isPending ? "Saving..." : "Save world"}
            </button>

            {validationMessage ? (
              <ErrorBlock message={validationMessage} />
            ) : null}

          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              Lifecycle summary
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Desired state",
                  value: world.desiredState ?? "running",
                },
                { label: "Health", value: world.healthStatus ?? "unknown" },
                {
                  label: "Strategy",
                  value: world.provisionStrategy ?? "unknown",
                },
                { label: "Provider", value: world.providerKey ?? "unknown" },
                { label: "Region", value: world.providerRegion ?? "unknown" },
                { label: "Zone", value: world.providerZone ?? "unknown" },
                { label: "Failure code", value: world.failureCode ?? "none" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    {item.label}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
              <div>Health message: {formatOptional(world.healthMessage)}</div>
              <div>Failure message: {formatOptional(world.failureMessage)}</div>
              <div>API: {formatOptional(world.apiBaseUrl)}</div>
              <div>Admin: {formatOptional(world.adminUrl)}</div>
              <div>Last accessed: {formatDateTime(world.lastAccessedAt)}</div>
              <div>
                Last interactive: {formatDateTime(world.lastInteractiveAt)}
              </div>
              <div>Last booted: {formatDateTime(world.lastBootedAt)}</div>
              <div>Last heartbeat: {formatDateTime(world.lastHeartbeatAt)}</div>
              <div>Last suspended: {formatDateTime(world.lastSuspendedAt)}</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  Alert status
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  Current alert severity after applying retry and
                  stale-heartbeat thresholds.
                </div>
              </div>

              {currentAlert ? (
                <div
                  className={`rounded-full border px-3 py-2 text-[11px] uppercase tracking-[0.18em] ${getAttentionTone(currentAlert.severity)}`}
                >
                  {currentAlert.severity}
                </div>
              ) : null}
            </div>

            {alertSummaryQuery.isError &&
            alertSummaryQuery.error instanceof Error ? (
              <div className="mt-4">
                <CloudAdminErrorBlock error={alertSummaryQuery.error} />
              </div>
            ) : null}

            {currentAlert ? (
              <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
                <div>{currentAlert.message}</div>
                <div>Reason: {currentAlert.reason}</div>
                <div>Escalated: {currentAlert.escalated ? "Yes" : "No"}</div>
                <div>
                  Escalation reason:{" "}
                  {getEscalationLabel(currentAlert.escalationReason)}
                </div>
                <div>Retry count: {currentAlert.retryCount}</div>
                <div>
                  Stale heartbeat seconds:{" "}
                  {typeof currentAlert.staleHeartbeatSeconds === "number"
                    ? currentAlert.staleHeartbeatSeconds
                    : "Not stale"}
                </div>
                <div>
                  Retry threshold:{" "}
                  {alertSummary?.thresholds.retryCount ?? "Not set"}
                </div>
                <div>
                  Critical stale threshold:{" "}
                  {alertSummary?.thresholds.criticalHeartbeatStaleSeconds
                    ? `${alertSummary.thresholds.criticalHeartbeatStaleSeconds}s`
                    : "Disabled"}
                </div>
              </div>
            ) : alertSummaryQuery.isLoading ? (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                Loading alert status...
              </div>
            ) : (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                No current alert. This world is below escalation thresholds.
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              Instance
            </div>
            {instanceQuery.isError && instanceQuery.error instanceof Error ? (
              <div className="mt-4">
                <CloudAdminErrorBlock error={instanceQuery.error} />
              </div>
            ) : null}

            {instance ? (
              <div className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
                <div>Name: {instance.name}</div>
                <div>Power state: {instance.powerState}</div>
                <div>
                  Provider instance:{" "}
                  {formatOptional(instance.providerInstanceId)}
                </div>
                <div>
                  Provider volume: {formatOptional(instance.providerVolumeId)}
                </div>
                <div>
                  Provider snapshot:{" "}
                  {formatOptional(instance.providerSnapshotId)}
                </div>
                <div>Private IP: {formatOptional(instance.privateIp)}</div>
                <div>Public IP: {formatOptional(instance.publicIp)}</div>
                <div>Region: {formatOptional(instance.region)}</div>
                <div>Zone: {formatOptional(instance.zone)}</div>
                <div>Image: {formatOptional(instance.imageId)}</div>
                <div>Flavor: {formatOptional(instance.flavor)}</div>
                <div>Disk: {instance.diskSizeGb ?? "Not set"} GB</div>
                <div>
                  Bootstrapped: {formatDateTime(instance.bootstrappedAt)}
                </div>
                <div>
                  Last heartbeat: {formatDateTime(instance.lastHeartbeatAt)}
                </div>
                <div>
                  Last operation: {formatDateTime(instance.lastOperationAt)}
                </div>
                <div>Created: {formatDateTime(instance.createdAt)}</div>
                <div>Updated: {formatDateTime(instance.updatedAt)}</div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                No instance record exists yet. Provisioning will create one
                automatically.
              </div>
            )}

            {instance?.launchConfig ? (
              <label className="mt-4 grid gap-2 text-sm">
                <span className="text-[color:var(--text-primary)]">
                  Launch config snapshot
                </span>
                <textarea
                  readOnly
                  value={Object.entries(instance.launchConfig)
                    .map(([key, value]) => `${key}=${value}`)
                    .join("\n")}
                  rows={6}
                  className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]"
                />
              </label>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  Runtime observation
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  Provider-side deployment status observed from the current
                  compute adapter.
                </div>
              </div>

              <button
                type="button"
                onClick={() => runtimeStatusQuery.refetch()}
                disabled={runtimeStatusQuery.isFetching}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
              >
                {runtimeStatusQuery.isFetching
                  ? "Refreshing..."
                  : "Refresh status"}
              </button>
            </div>

            {runtimeStatusQuery.isError &&
            runtimeStatusQuery.error instanceof Error ? (
              <div className="mt-4">
                <CloudAdminErrorBlock error={runtimeStatusQuery.error} />
              </div>
            ) : null}

            {runtimeStatus ? (
              <div className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
                <div>Deployment state: {runtimeStatus.deploymentState}</div>
                <div>
                  Deployment mode:{" "}
                  {formatOptional(runtimeStatus.deploymentMode)}
                </div>
                <div>
                  Executor mode: {formatOptional(runtimeStatus.executorMode)}
                </div>
                <div>
                  Remote host: {formatOptional(runtimeStatus.remoteHost)}
                </div>
                <div>
                  Remote path: {formatOptional(runtimeStatus.remoteDeployPath)}
                </div>
                <div>Project: {formatOptional(runtimeStatus.projectName)}</div>
                <div>
                  Container: {formatOptional(runtimeStatus.containerName)}
                </div>
                <div>Raw status: {formatOptional(runtimeStatus.rawStatus)}</div>
                <div>
                  Observed at: {formatDateTime(runtimeStatus.observedAt)}
                </div>
                <div>
                  Provider message:{" "}
                  {formatOptional(runtimeStatus.providerMessage)}
                </div>
              </div>
            ) : runtimeStatusQuery.isLoading ? (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                Loading runtime status...
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                  Bootstrap package
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  Use this env overlay when deploying the user's dedicated world
                  runtime.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {bootstrapConfig ? (
                  <button
                    type="button"
                    onClick={() =>
                      void copyValue(
                        formatBootstrapCallbackEndpoints(
                          bootstrapConfig.callbackEndpoints,
                        ),
                        "Callback endpoints copied.",
                      )
                    }
                    className={SECONDARY_ACTION_BUTTON}
                  >
                    Copy endpoints
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => setConfirmAction("rotate-callback-token")}
                  className={SECONDARY_ACTION_BUTTON}
                >
                  {rotateCallbackTokenMutation.isPending
                    ? "Rotating..."
                    : "Rotate callback token"}
                </button>
              </div>
            </div>

            {bootstrapConfigQuery.isError &&
            bootstrapConfigQuery.error instanceof Error ? (
              <div className="mt-4">
                <CloudAdminErrorBlock error={bootstrapConfigQuery.error} />
              </div>
            ) : null}

            {bootstrapConfig ? (
              <div className="mt-4 grid gap-4">
                <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <div>
                    Provider:{" "}
                    {formatOptional(
                      bootstrapConfig.providerLabel ??
                        bootstrapConfig.providerKey,
                    )}
                  </div>
                  <div>
                    Deployment: {formatOptional(bootstrapConfig.deploymentMode)}
                  </div>
                  <div>
                    Executor: {formatOptional(bootstrapConfig.executorMode)}
                  </div>
                  <div>
                    Cloud platform: {bootstrapConfig.cloudPlatformBaseUrl}
                  </div>
                  <div>
                    Suggested API:{" "}
                    {formatOptional(bootstrapConfig.suggestedApiBaseUrl)}
                  </div>
                  <div>
                    Suggested admin:{" "}
                    {formatOptional(bootstrapConfig.suggestedAdminUrl)}
                  </div>
                  <div>Image: {formatOptional(bootstrapConfig.image)}</div>
                  <div>
                    Container: {formatOptional(bootstrapConfig.containerName)}
                  </div>
                  <div>
                    Volume: {formatOptional(bootstrapConfig.volumeName)}
                  </div>
                  <div>
                    Project: {formatOptional(bootstrapConfig.projectName)}
                  </div>
                  <div>
                    Remote path:{" "}
                    {formatOptional(bootstrapConfig.remoteDeployPath)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      Callback token:{" "}
                      {bootstrapConfig.callbackToken || "Not set"}
                    </span>
                    {bootstrapConfig.callbackToken ? (
                      <button
                        type="button"
                        onClick={() =>
                          void copyValue(
                            bootstrapConfig.callbackToken,
                            "Callback token copied.",
                          )
                        }
                        aria-label="Copy callback token"
                        className="rounded-lg border border-[color:var(--border-faint)] px-2 py-1 text-xs text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]"
                      >
                        Copy token
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-[color:var(--text-secondary)]">
                  <div>
                    Bootstrap endpoint:{" "}
                    {bootstrapConfig.callbackEndpoints.bootstrap}
                  </div>
                  <div>
                    Heartbeat endpoint:{" "}
                    {bootstrapConfig.callbackEndpoints.heartbeat}
                  </div>
                  <div>
                    Activity endpoint:{" "}
                    {bootstrapConfig.callbackEndpoints.activity}
                  </div>
                  <div>
                    Health endpoint: {bootstrapConfig.callbackEndpoints.health}
                  </div>
                  <div>
                    Fail endpoint: {bootstrapConfig.callbackEndpoints.fail}
                  </div>
                </div>

                <label className="grid gap-2 text-sm">
                  <span className="flex items-center justify-between gap-3 text-[color:var(--text-primary)]">
                    <span>Runtime env overlay</span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyValue(
                          bootstrapConfig.envFileContent,
                          "Runtime env overlay copied.",
                        )
                      }
                      aria-label="Copy runtime env overlay"
                      className="rounded-lg border border-[color:var(--border-faint)] px-2 py-1 text-xs font-normal text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]"
                    >
                      Copy env
                    </button>
                  </span>
                  <textarea
                    readOnly
                    value={bootstrapConfig.envFileContent}
                    rows={6}
                    className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="flex items-center justify-between gap-3 text-[color:var(--text-primary)]">
                    <span>Docker compose snippet</span>
                    <button
                      type="button"
                      onClick={() =>
                        void copyValue(
                          bootstrapConfig.dockerComposeSnippet,
                          "Docker compose snippet copied.",
                        )
                      }
                      aria-label="Copy docker compose snippet"
                      className="rounded-lg border border-[color:var(--border-faint)] px-2 py-1 text-xs font-normal text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]"
                    >
                      Copy compose
                    </button>
                  </span>
                  <textarea
                    readOnly
                    value={bootstrapConfig.dockerComposeSnippet}
                    rows={8}
                    className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]"
                  />
                </label>

                {bootstrapConfig.notes.length ? (
                  <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      Ops notes
                    </div>
                    <div className="mt-2 space-y-2 text-sm text-[color:var(--text-secondary)]">
                      {bootstrapConfig.notes.map((note) => (
                        <div key={note}>{note}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : bootstrapConfigQuery.isLoading ? (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                Loading bootstrap package...
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          Recent lifecycle jobs
        </div>
        <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
          Jobs show how this world moved through provision, resume, and suspend
          work.
        </div>

        {jobsQuery.isError && jobsQuery.error instanceof Error ? (
          <div className="mt-4">
            <CloudAdminErrorBlock error={jobsQuery.error} />
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {groupedJobs.map((group) => (
              <div
                key={group.state.key}
                className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em] ${group.state.tone}`}
              >
                {group.state.label}: {group.jobs.length}
              </div>
            ))}
          </div>

          <select
            value={queueStateFilter}
            onChange={(event) =>
              setQueueStateFilter(event.target.value as QueueStateFilter)
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
          >
            {QUEUE_STATE_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
          <table className="min-w-[52rem] border-collapse text-left text-sm">
            <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Lease</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {groupedJobs.flatMap((group) => [
                <tr
                  key={`group-${group.state.key}`}
                  className="border-t border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"
                >
                  <td colSpan={6} className="px-4 py-3">
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
                  const auditBadgeLabel = getJobAuditBadgeLabel(job);

                  return (
                    <tr
                      key={job.id}
                      className="border-t border-[color:var(--border-faint)]"
                    >
                      <td className="px-4 py-3 text-[color:var(--text-primary)]">
                        <div>{job.jobType}</div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {job.id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${getJobStatusTone(
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
                        {formatDateTime(job.updatedAt)}
                      </td>
                      <td className="max-w-[18rem] px-4 py-3 text-[color:var(--text-secondary)]">
                        {auditBadgeLabel ? (
                          <div className="mb-2">
                            <span className={JOB_AUDIT_BADGE_CLASS_NAME}>
                              {auditBadgeLabel}
                            </span>
                          </div>
                        ) : null}
                        <div>{describeJobResult(job)}</div>
                      </td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>

          {!jobsQuery.isLoading && !jobsQuery.isError && jobs.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              No jobs recorded for this world yet.
            </div>
          ) : null}

          {!jobsQuery.isLoading &&
          !jobsQuery.isError &&
          jobs.length > 0 &&
          visibleJobs.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              No jobs match the selected queue filter.
            </div>
          ) : null}
        </div>
      </div>

      <ConsoleConfirmDialog
        open={Boolean(activeConfirm)}
        title={activeConfirm?.title ?? ""}
        description={activeConfirm?.description ?? ""}
        confirmLabel={activeConfirm?.confirmLabel}
        pendingLabel={activeConfirm?.pendingLabel}
        danger={activeConfirm?.danger}
        pending={activeConfirm?.pending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => activeConfirm?.onConfirm()}
      />
    </section>
  );
}
