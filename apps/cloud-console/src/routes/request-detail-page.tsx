import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { CloudWorldRequestStatus } from "@yinjie/contracts";
import { ErrorBlock } from "@yinjie/ui";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { useConsoleNotice } from "../components/console-notice";
import {
  RequestProjectionBadges,
  RequestStatusBadge,
  RequestStatusSelect,
} from "../components/request-controls";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";
import {
  getRequestEndpointLockMessage,
  getRequestGuidanceParagraphs,
  getProjectedWorldStatusToneStyles,
  isTerminalRequestStatus,
  requiresRequestApiBaseUrl,
  requiresRequestOpsNote,
} from "../lib/request-helpers";

function formatOptional(value?: string | null) {
  return value?.trim() || "Not set";
}

function validateRequestForm(params: {
  phone: string;
  worldName: string;
  status: CloudWorldRequestStatus;
  apiBaseUrl: string;
  note: string;
}) {
  if (!params.phone.trim()) {
    return "Phone is required.";
  }

  if (!params.worldName.trim()) {
    return "World name is required.";
  }

  if (
    requiresRequestApiBaseUrl(params.status) &&
    !params.apiBaseUrl.trim()
  ) {
    return "An active request must include a world API base URL.";
  }

  if (requiresRequestOpsNote(params.status) && !params.note.trim()) {
    return "Rejected or disabled requests need an ops note.";
  }

  return null;
}

export function RequestDetailPage() {
  const { requestId } = useParams({ from: "/requests/$requestId" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const requestQuery = useQuery({
    queryKey: ["cloud-console", "request", requestId],
    queryFn: () => cloudAdminApi.getRequest(requestId),
  });

  const [draftStatus, setDraftStatus] =
    useState<CloudWorldRequestStatus>("pending");
  const [phone, setPhone] = useState("");
  const [worldName, setWorldName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");
  const [formHydrated, setFormHydrated] = useState(false);
  const terminalRequestStatus = isTerminalRequestStatus(draftStatus);
  const validationMessage = formHydrated
    ? validateRequestForm({
        phone,
        worldName,
        status: draftStatus,
        apiBaseUrl,
        note,
      })
    : null;

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateRequestWithMeta(requestId, {
        phone,
        worldName,
        status: draftStatus,
        apiBaseUrl: terminalRequestStatus ? undefined : apiBaseUrl,
        adminUrl: terminalRequestStatus ? undefined : adminUrl,
        note,
      }),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "request", requestId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "requests"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "worlds"],
        }),
      ]);
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          "World request saved.",
          "success",
          response.requestId,
        ),
      );
    },
    onError: (error) => {
      showCloudAdminErrorNotice(showNotice, error);
    },
  });

  const request = requestQuery.data;

  function handleStatusChange(nextStatus: CloudWorldRequestStatus) {
    setDraftStatus(nextStatus);

    if (!request || !isTerminalRequestStatus(nextStatus)) {
      return;
    }

    // Terminal request states should not carry unsaved endpoint edits forward.
    setApiBaseUrl(request.apiBaseUrl ?? "");
    setAdminUrl(request.adminUrl ?? "");
  }

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
    setFormHydrated(true);
  }, [request]);

  if (requestQuery.isError) {
    return <CloudAdminErrorBlock error={requestQuery.error} />;
  }

  if (!request) {
    return (
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">
        Loading request...
      </div>
    );
  }

  const projectedWorldToneStyles = getProjectedWorldStatusToneStyles(
    request.projectedWorldStatus,
  );
  const endpointLockMessage = getRequestEndpointLockMessage(draftStatus);
  const guidanceParagraphs = getRequestGuidanceParagraphs();

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-xl font-semibold text-[color:var(--text-primary)]">
          {request.worldName}
        </div>
        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
          {request.phone}
        </div>
        <div className="mt-3">
          <RequestStatusBadge status={request.status} />
        </div>
        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
          {request.displayStatus ?? "No request status detail."}
        </div>
        {request.failureReason ? (
          <div className="mt-1 text-sm text-[color:var(--text-muted)]">
            {request.failureReason}
          </div>
        ) : null}

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
            <RequestStatusSelect
              value={draftStatus}
              ariaLabel="Status"
              onChange={handleStatusChange}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span>World API base URL</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              disabled={terminalRequestStatus}
              placeholder="https://world-api.example.com"
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span>World admin URL</span>
            <input
              value={adminUrl}
              onChange={(event) => setAdminUrl(event.target.value)}
              disabled={terminalRequestStatus}
              placeholder="https://world-admin.example.com"
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          {endpointLockMessage ? (
            <div className="text-xs leading-6 text-[color:var(--text-muted)]">
              {endpointLockMessage}
            </div>
          ) : null}

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
            {updateMutation.isPending ? "Saving..." : "Save request"}
          </button>

          {validationMessage ? (
            <ErrorBlock message={validationMessage} />
          ) : null}

        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          Request guidance
        </div>
        <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {guidanceParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div
          className={`mt-6 rounded-2xl border p-4 text-sm ${projectedWorldToneStyles.panel} ${projectedWorldToneStyles.detail}`}
        >
          <div className="font-medium text-[color:var(--text-primary)]">
            Projected world
          </div>
          <RequestProjectionBadges
            projectedWorldStatus={request.projectedWorldStatus}
            projectedDesiredState={request.projectedDesiredState}
            projectedLabel="Status:"
            desiredLabel="Desired state:"
            projectedRowClassName="mt-2 flex flex-wrap items-center gap-2"
            desiredRowClassName="mt-1 flex flex-wrap items-center gap-2"
          />
        </div>

        <div className="mt-6 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] p-4 text-sm text-[color:var(--text-secondary)]">
          <div className="font-medium text-[color:var(--text-primary)]">
            Current endpoints
          </div>
          <div className="mt-2">API: {formatOptional(request.apiBaseUrl)}</div>
          <div className="mt-1">Admin: {formatOptional(request.adminUrl)}</div>
        </div>
      </div>
    </section>
  );
}
