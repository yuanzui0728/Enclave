import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { CloudWorldLifecycleStatus } from "@yinjie/contracts";
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

export function WorldDetailPage() {
  const { worldId } = useParams({ from: "/worlds/$worldId" });
  const queryClient = useQueryClient();

  const worldQuery = useQuery({
    queryKey: ["cloud-console", "world", worldId],
    queryFn: () => cloudAdminApi.getWorld(worldId),
  });
  const instanceQuery = useQuery({
    queryKey: ["cloud-console", "world-instance", worldId],
    queryFn: () => cloudAdminApi.getWorldInstance(worldId),
  });
  const jobsQuery = useQuery({
    queryKey: ["cloud-console", "jobs", "world", worldId],
    queryFn: () => cloudAdminApi.listJobs({ worldId }),
  });

  const [draftStatus, setDraftStatus] = useState<CloudWorldLifecycleStatus>("queued");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");

  async function invalidateWorldQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "world", worldId] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "world-instance", worldId] }),
      queryClient.invalidateQueries({ queryKey: ["cloud-console", "jobs"] }),
    ]);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateWorld(worldId, {
        phone,
        name,
        status: draftStatus,
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

  const world = worldQuery.data;
  const instance = instanceQuery.data;
  const jobs = jobsQuery.data ?? [];
  const worldError = worldQuery.error instanceof Error ? worldQuery.error.message : null;

  useEffect(() => {
    if (!world) {
      return;
    }

    setDraftStatus(world.status);
    setPhone(world.phone);
    setName(world.name);
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

  const actionPending = resumeMutation.isPending || suspendMutation.isPending || retryMutation.isPending;

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

          {(resumeMutation.error instanceof Error || suspendMutation.error instanceof Error || retryMutation.error instanceof Error) && (
            <div className="mt-4">
              <ErrorBlock
                message={
                  resumeMutation.error instanceof Error
                    ? resumeMutation.error.message
                    : suspendMutation.error instanceof Error
                      ? suspendMutation.error.message
                      : retryMutation.error instanceof Error
                        ? retryMutation.error.message
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
                <div>Private IP: {formatOptional(instance.privateIp)}</div>
                <div>Public IP: {formatOptional(instance.publicIp)}</div>
                <div>Region: {formatOptional(instance.region)}</div>
                <div>Zone: {formatOptional(instance.zone)}</div>
                <div>Created: {formatDateTime(instance.createdAt)}</div>
                <div>Updated: {formatDateTime(instance.updatedAt)}</div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[color:var(--text-muted)]">
                No instance record exists yet. Provisioning will create one automatically.
              </div>
            )}
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
