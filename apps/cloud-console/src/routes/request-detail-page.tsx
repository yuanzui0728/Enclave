import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { CloudWorldRequestStatus } from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";

const REQUEST_STATUSES: CloudWorldRequestStatus[] = ["pending", "provisioning", "active", "rejected", "disabled"];

function formatOptional(value?: string | null) {
  return value?.trim() || "Not set";
}

export function RequestDetailPage() {
  const { requestId } = useParams({ from: "/requests/$requestId" });
  const queryClient = useQueryClient();
  const requestQuery = useQuery({
    queryKey: ["cloud-console", "request", requestId],
    queryFn: () => cloudAdminApi.getRequest(requestId),
  });

  const [draftStatus, setDraftStatus] = useState<CloudWorldRequestStatus>("pending");
  const [phone, setPhone] = useState("");
  const [worldName, setWorldName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateRequest(requestId, {
        phone,
        worldName,
        status: draftStatus,
        apiBaseUrl,
        adminUrl,
        note,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "requests"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
      ]);
    },
  });

  const request = requestQuery.data;
  const requestError = requestQuery.error instanceof Error ? requestQuery.error.message : null;

  useEffect(() => {
    if (!request) {
      return;
    }

    setDraftStatus(request.status);
    setPhone(request.phone);
    setWorldName(request.worldName);
    setApiBaseUrl(request.apiBaseUrl ?? "");
    setAdminUrl(request.adminUrl ?? "");
    setNote(request.note ?? "");
  }, [request]);

  if (requestError) {
    return <ErrorBlock message={requestError} />;
  }

  if (!request) {
    return (
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">
        Loading request...
      </div>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-xl font-semibold text-[color:var(--text-primary)]">{request.worldName}</div>
        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{request.phone}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{request.status}</div>

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
              value={worldName}
              onChange={(event) => setWorldName(event.target.value)}
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span>Status</span>
            <select
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value as CloudWorldRequestStatus)}
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]"
            >
              {REQUEST_STATUSES.map((status) => (
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
            {updateMutation.isPending ? "Saving..." : "Save request"}
          </button>

          {updateMutation.isError && updateMutation.error instanceof Error ? (
            <ErrorBlock message={updateMutation.error.message} />
          ) : null}
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">Request guidance</div>
        <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          <p>`pending` means the request is still awaiting staff action.</p>
          <p>`provisioning` means staff accepted it and the world is being prepared outside of the old orchestration path.</p>
          <p>`active` should only be used when the world already has a reachable `apiBaseUrl`.</p>
          <p>`rejected` and `disabled` should always be paired with a clear ops note.</p>
        </div>

        <div className="mt-6 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] p-4 text-sm text-[color:var(--text-secondary)]">
          <div className="font-medium text-[color:var(--text-primary)]">Current endpoints</div>
          <div className="mt-2">API: {formatOptional(request.apiBaseUrl)}</div>
          <div className="mt-1">Admin: {formatOptional(request.adminUrl)}</div>
        </div>
      </div>
    </section>
  );
}
