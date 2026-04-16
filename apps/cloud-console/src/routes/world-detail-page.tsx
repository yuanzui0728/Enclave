import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { CloudComputeProviderSummary, CloudWorldLifecycleStatus } from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";

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

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function formatOptional(value?: string | null) {
  return value?.trim() || "Not set";
}

function resolveCanonicalProviderKey(value?: string | null) {
  return value?.trim() === "manual" ? "manual-docker" : value?.trim() || "";
}

function findProviderByKey(providers: CloudComputeProviderSummary[], providerKey: string) {
  const canonicalProviderKey = resolveCanonicalProviderKey(providerKey);
  return providers.find((provider) => provider.key === canonicalProviderKey) ?? null;
}

function buildProviderOptions(providers: CloudComputeProviderSummary[], providerKey: string) {
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

export function WorldDetailPage() {
  const { worldId } = useParams({ from: "/worlds/$worldId" });
  const queryClient = useQueryClient();

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
  const jobsQuery = useQuery({
    queryKey: ["cloud-console", "jobs", "world", worldId],
    queryFn: () => cloudAdminApi.listJobs({ worldId }),
  });

  const [draftStatus, setDraftStatus] = useState<CloudWorldLifecycleStatus>("queued");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [provisionStrategy, setProvisionStrategy] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [providerRegion, setProviderRegion] = useState("");
  const [providerZone, setProviderZone] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");

  async function invalidateWorldQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "world", worldId] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "world-instance", worldId] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "world-bootstrap-config", worldId] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "jobs"] }),
    ]);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateWorld(worldId, {
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
    onSuccess: invalidateWorldQueries,
  });
  const resumeMutation = useMutation({
    mutationFn: () => cloudAdminApi.resumeWorld(worldId),
    onSuccess: invalidateWorldQueries,
  });
  const suspendMutation = useMutation({
    mutationFn: () => cloudAdminApi.suspendWorld(worldId),
    onSuccess: invalidateWorldQueries,
  });
  const retryMutation = useMutation({
    mutationFn: () => cloudAdminApi.retryWorld(worldId),
    onSuccess: invalidateWorldQueries,
  });
  const rotateCallbackTokenMutation = useMutation({
    mutationFn: () => cloudAdminApi.rotateWorldCallbackToken(worldId),
    onSuccess: invalidateWorldQueries,
  });

  const world = worldQuery.data;
  const instance = instanceQuery.data;
  const bootstrapConfig = bootstrapConfigQuery.data;
  const jobs = jobsQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const providerOptions = buildProviderOptions(providers, providerKey);
  const selectedProvider = findProviderByKey(providerOptions, providerKey);
  const worldError = worldQuery.error instanceof Error ? worldQuery.error.message : null;

  function handleProviderKeyChange(nextProviderKey: string) {
    const nextProvider = findProviderByKey(providers, nextProviderKey);
    const previousProvider = findProviderByKey(providers, providerKey);

    setProviderKey(nextProviderKey);
    if (!nextProvider) {
      return;
    }

    setProvisionStrategy(nextProvider.provisionStrategy);

    if (!providerRegion || providerRegion === (previousProvider?.defaultRegion ?? "")) {
      setProviderRegion(nextProvider.defaultRegion ?? "");
    }
    if (!providerZone || providerZone === (previousProvider?.defaultZone ?? "")) {
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
  }, [world]);

  if (worldError) {
    return <ErrorBlock message={worldError} />;
  }

  if (!world) {
    return (
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">
        Loading world...
      </div>
    );
  }

  const actionPending =
    resumeMutation.isPending ||
    suspendMutation.isPending ||
    retryMutation.isPending ||
    rotateCallbackTokenMutation.isPending;

  return (
    <section className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold text-[color:var(--text-primary)]">{world.name}</div>
              <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{world.phone}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{world.status}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => resumeMutation.mutate()}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
              >
                {resumeMutation.isPending ? "Resuming..." : "Resume"}
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => suspendMutation.mutate()}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
              >
                {suspendMutation.isPending ? "Suspending..." : "Suspend"}
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => retryMutation.mutate()}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
              >
                {retryMutation.isPending ? "Retrying..." : "Retry"}
              </button>
            </div>
          </div>

          {(
            resumeMutation.error instanceof Error ||
            suspendMutation.error instanceof Error ||
            retryMutation.error instanceof Error ||
            rotateCallbackTokenMutation.error instanceof Error
          ) && (
            <div className="mt-4">
              <ErrorBlock
                message={
                  resumeMutation.error instanceof Error
                    ? resumeMutation.error.message
                    : suspendMutation.error instanceof Error
                      ? suspendMutation.error.message
                      : retryMutation.error instanceof Error
                        ? retryMutation.error.message
                        : rotateCallbackTokenMutation.error instanceof Error
                          ? rotateCallbackTokenMutation.error.message
                          : "Unknown action error."
                }
              />
            </div>
          )}

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
                onChange={(event) => setDraftStatus(event.target.value as CloudWorldLifecycleStatus)}
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
                onChange={(event) => handleProviderKeyChange(event.target.value)}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
              >
                {!providerKey ? <option value="">Select provider</option> : null}
                {providerOptions.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label} ({provider.key})
                  </option>
                ))}
              </select>
            </label>

            {providersQuery.isError && providersQuery.error instanceof Error ? (
              <ErrorBlock message={providersQuery.error.message} />
            ) : null}

            {selectedProvider ? (
              <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Provider profile</div>
                <div className="mt-2 font-medium text-[color:var(--text-primary)]">{selectedProvider.label}</div>
                <div className="mt-1 leading-6">{selectedProvider.description}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>Deployment: {selectedProvider.deploymentMode}</div>
                  <div>Default region: {formatOptional(selectedProvider.defaultRegion)}</div>
                  <div>Default zone: {formatOptional(selectedProvider.defaultZone)}</div>
                  <div>Managed lifecycle: {selectedProvider.capabilities.managedLifecycle ? "Yes" : "No"}</div>
                  <div>Managed provisioning: {selectedProvider.capabilities.managedProvisioning ? "Yes" : "No"}</div>
                  <div>Snapshots: {selectedProvider.capabilities.snapshots ? "Yes" : "No"}</div>
                </div>
              </div>
            ) : providersQuery.isLoading ? (
              <div className="text-sm text-[color:var(--text-muted)]">Loading provider catalog...</div>
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
              onClick={() => updateMutation.mutate()}
              className="rounded-xl bg-[color:var(--surface-secondary)] px-4 py-3 text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)]"
            >
              {updateMutation.isPending ? "Saving..." : "Save world"}
            </button>

            {updateMutation.isError && updateMutation.error instanceof Error ? (
              <ErrorBlock message={updateMutation.error.message} />
            ) : null}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">Lifecycle summary</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: "Desired state", value: world.desiredState ?? "running" },
                { label: "Health", value: world.healthStatus ?? "unknown" },
                { label: "Strategy", value: world.provisionStrategy ?? "unknown" },
                { label: "Provider", value: world.providerKey ?? "unknown" },
                { label: "Region", value: world.providerRegion ?? "unknown" },
                { label: "Zone", value: world.providerZone ?? "unknown" },
                { label: "Failure code", value: world.failureCode ?? "none" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{item.label}</div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
              <div>Health message: {formatOptional(world.healthMessage)}</div>
              <div>Failure message: {formatOptional(world.failureMessage)}</div>
              <div>API: {formatOptional(world.apiBaseUrl)}</div>
              <div>Admin: {formatOptional(world.adminUrl)}</div>
              <div>Last accessed: {formatDateTime(world.lastAccessedAt)}</div>
              <div>Last interactive: {formatDateTime(world.lastInteractiveAt)}</div>
              <div>Last booted: {formatDateTime(world.lastBootedAt)}</div>
              <div>Last heartbeat: {formatDateTime(world.lastHeartbeatAt)}</div>
              <div>Last suspended: {formatDateTime(world.lastSuspendedAt)}</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">Instance</div>
            {instanceQuery.isError && instanceQuery.error instanceof Error ? (
              <div className="mt-4">
                <ErrorBlock message={instanceQuery.error.message} />
              </div>
            ) : null}

            {instance ? (
              <div className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
                <div>Name: {instance.name}</div>
                <div>Power state: {instance.powerState}</div>
                <div>Provider instance: {formatOptional(instance.providerInstanceId)}</div>
                <div>Provider volume: {formatOptional(instance.providerVolumeId)}</div>
                <div>Provider snapshot: {formatOptional(instance.providerSnapshotId)}</div>
                <div>Private IP: {formatOptional(instance.privateIp)}</div>
                <div>Public IP: {formatOptional(instance.publicIp)}</div>
                <div>Region: {formatOptional(instance.region)}</div>
                <div>Zone: {formatOptional(instance.zone)}</div>
                <div>Image: {formatOptional(instance.imageId)}</div>
                <div>Flavor: {formatOptional(instance.flavor)}</div>
                <div>Disk: {instance.diskSizeGb ?? "Not set"} GB</div>
                <div>Bootstrapped: {formatDateTime(instance.bootstrappedAt)}</div>
                <div>Last heartbeat: {formatDateTime(instance.lastHeartbeatAt)}</div>
                <div>Last operation: {formatDateTime(instance.lastOperationAt)}</div>
                <div>Created: {formatDateTime(instance.createdAt)}</div>
                <div>Updated: {formatDateTime(instance.updatedAt)}</div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                No instance record exists yet. Provisioning will create one automatically.
              </div>
            )}

            {instance?.launchConfig ? (
              <label className="mt-4 grid gap-2 text-sm">
                <span className="text-[color:var(--text-primary)]">Launch config snapshot</span>
                <textarea
                  readOnly
                  value={Object.entries(instance.launchConfig)
                    .map(([key, value]) => `${key}=${value}`)
                    .join("\n")}
                  rows={6}
                  className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]"
                />
              </label>
            ) : (
              null
            )}
          </div>

          <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">Bootstrap package</div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
                  Use this env overlay when deploying the user's dedicated world runtime.
                </div>
              </div>

              <button
                type="button"
                disabled={actionPending}
                onClick={() => rotateCallbackTokenMutation.mutate()}
                className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)] disabled:opacity-60"
              >
                {rotateCallbackTokenMutation.isPending ? "Rotating..." : "Rotate callback token"}
              </button>
            </div>

            {bootstrapConfigQuery.isError && bootstrapConfigQuery.error instanceof Error ? (
              <div className="mt-4">
                <ErrorBlock message={bootstrapConfigQuery.error.message} />
              </div>
            ) : null}

            {bootstrapConfig ? (
              <div className="mt-4 grid gap-4">
                <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                  <div>Provider: {formatOptional(bootstrapConfig.providerLabel ?? bootstrapConfig.providerKey)}</div>
                  <div>Deployment: {formatOptional(bootstrapConfig.deploymentMode)}</div>
                  <div>Executor: {formatOptional(bootstrapConfig.executorMode)}</div>
                  <div>Cloud platform: {bootstrapConfig.cloudPlatformBaseUrl}</div>
                  <div>Suggested API: {formatOptional(bootstrapConfig.suggestedApiBaseUrl)}</div>
                  <div>Suggested admin: {formatOptional(bootstrapConfig.suggestedAdminUrl)}</div>
                  <div>Image: {formatOptional(bootstrapConfig.image)}</div>
                  <div>Container: {formatOptional(bootstrapConfig.containerName)}</div>
                  <div>Volume: {formatOptional(bootstrapConfig.volumeName)}</div>
                  <div>Project: {formatOptional(bootstrapConfig.projectName)}</div>
                  <div>Remote path: {formatOptional(bootstrapConfig.remoteDeployPath)}</div>
                  <div>Callback token: {bootstrapConfig.callbackToken || "Not set"}</div>
                </div>

                <div className="grid gap-3 text-sm text-[color:var(--text-secondary)]">
                  <div>Bootstrap endpoint: {bootstrapConfig.callbackEndpoints.bootstrap}</div>
                  <div>Heartbeat endpoint: {bootstrapConfig.callbackEndpoints.heartbeat}</div>
                  <div>Activity endpoint: {bootstrapConfig.callbackEndpoints.activity}</div>
                  <div>Health endpoint: {bootstrapConfig.callbackEndpoints.health}</div>
                  <div>Fail endpoint: {bootstrapConfig.callbackEndpoints.fail}</div>
                </div>

                <label className="grid gap-2 text-sm">
                  <span className="text-[color:var(--text-primary)]">Runtime env overlay</span>
                  <textarea
                    readOnly
                    value={bootstrapConfig.envFileContent}
                    rows={6}
                    className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]"
                  />
                </label>

                <label className="grid gap-2 text-sm">
                  <span className="text-[color:var(--text-primary)]">Docker compose snippet</span>
                  <textarea
                    readOnly
                    value={bootstrapConfig.dockerComposeSnippet}
                    rows={8}
                    className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 font-mono text-xs text-[color:var(--text-primary)]"
                  />
                </label>

                {bootstrapConfig.notes.length ? (
                  <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Ops notes</div>
                    <div className="mt-2 space-y-2 text-sm text-[color:var(--text-secondary)]">
                      {bootstrapConfig.notes.map((note) => (
                        <div key={note}>{note}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : bootstrapConfigQuery.isLoading ? (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">Loading bootstrap package...</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">Recent lifecycle jobs</div>
        <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
          Jobs show how this world moved through provision, resume, and suspend work.
        </div>

        {jobsQuery.isError && jobsQuery.error instanceof Error ? (
          <div className="mt-4">
            <ErrorBlock message={jobsQuery.error.message} />
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--border-faint)]">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Failure</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-[color:var(--border-faint)]">
                  <td className="px-4 py-3 text-[color:var(--text-primary)]">
                    <div>{job.jobType}</div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">{job.id}</div>
                  </td>
                  <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{job.status}</td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {job.attempt} / {job.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">{formatDateTime(job.updatedAt)}</td>
                  <td className="max-w-[18rem] px-4 py-3 text-[color:var(--text-secondary)]">
                    {job.failureMessage ?? "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!jobsQuery.isLoading && !jobsQuery.isError && jobs.length === 0 ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">No jobs recorded for this world yet.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
