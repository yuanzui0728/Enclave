import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { InlineNotice } from "@yinjie/ui";
import {
  getCloudAdminSecret,
  revokeStoredCloudAdminSession,
  setCloudAdminSecret,
} from "../lib/cloud-admin-api";
import { DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH } from "../lib/admin-sessions-route-search";
import { DEFAULT_JOBS_ROUTE_SEARCH } from "../lib/job-route-search";
import { DEFAULT_REQUESTS_ROUTE_SEARCH } from "../lib/request-route-search";
import { DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH } from "../lib/waiting-session-sync-helpers";
import { DEFAULT_WORLDS_ROUTE_SEARCH } from "../lib/world-route-search";
import { ConsoleNoticeProvider, useConsoleNotice } from "./console-notice";

const NAV_LINK =
  "rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]";
const NAV_LINK_ACTIVE =
  "rounded-full border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-2 font-medium text-[color:var(--brand-primary)]";

function RootLayoutContent() {
  const queryClient = useQueryClient();
  const { notice, showNotice } = useConsoleNotice();
  const [secret, setSecret] = useState(getCloudAdminSecret);
  const [editingSecret, setEditingSecret] = useState(!getCloudAdminSecret());
  const [draft, setDraft] = useState(getCloudAdminSecret);

  async function saveSecret() {
    const nextSecret = draft.trim();
    const previousSecret = secret.trim();
    if (previousSecret && previousSecret !== nextSecret) {
      await revokeStoredCloudAdminSession().catch(() => undefined);
    }
    setCloudAdminSecret(nextSecret);
    setSecret(nextSecret);
    setEditingSecret(false);
    showNotice(
      nextSecret
        ? "Admin secret saved locally. Short-lived admin tokens will refresh automatically."
        : "Admin secret cleared.",
      nextSecret ? "success" : "info",
    );
    void queryClient.invalidateQueries();
  }

  return (
    <div className="min-h-screen px-6 py-6 text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "24px 24px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.42), transparent 88%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-6 rounded-[30px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] px-6 py-5 shadow-[var(--shadow-overlay)]">
          <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            Yinjie Cloud Ops
          </div>
          <div className="mt-2 text-3xl font-semibold">Cloud World Console</div>
          <div className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">
            Manage phone-based world provisioning, wake old worlds, inspect
            lifecycle jobs, and track instance health from one place.
          </div>

          <div className="mt-4">
            {editingSecret ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Enter CLOUD_ADMIN_SECRET"
                  className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--border-brand)]"
                  onKeyDown={(event) =>
                    event.key === "Enter" && void saveSecret()
                  }
                />
                <button
                  type="button"
                  className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]"
                  onClick={() => void saveSecret()}
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                <span>
                  {secret
                    ? "Admin secret saved locally. Console uses short-lived admin tokens."
                    : "Admin secret is missing."}
                </span>
                <button
                  type="button"
                  className="text-xs underline hover:text-[color:var(--text-primary)]"
                  onClick={() => setEditingSecret(true)}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              to="/"
              className={NAV_LINK}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              Dashboard
            </Link>
            <Link
              to="/requests"
              search={DEFAULT_REQUESTS_ROUTE_SEARCH}
              className={NAV_LINK}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              Requests
            </Link>
            <Link
              to="/worlds"
              search={DEFAULT_WORLDS_ROUTE_SEARCH}
              className={NAV_LINK}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              Worlds
            </Link>
            <Link
              to="/jobs"
              search={DEFAULT_JOBS_ROUTE_SEARCH}
              className={NAV_LINK}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              Jobs
            </Link>
            <Link
              to="/sessions"
              search={DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH}
              className={NAV_LINK}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              Sessions
            </Link>
            <Link
              to="/waiting-sync"
              search={DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH}
              className={NAV_LINK}
              activeProps={{ className: NAV_LINK_ACTIVE }}
            >
              Waiting Sync
            </Link>
          </div>
        </div>

        {notice ? (
          <div className="mb-6">
            <InlineNotice tone={notice.tone}>
              <div>{notice.message}</div>
              {notice.requestId ? (
                <div className="mt-3 border-t border-current/15 pt-3 text-xs leading-5 text-current/90">
                  <div className="uppercase tracking-[0.12em] opacity-80">
                    Request id
                  </div>
                  <div className="mt-1 break-all font-mono">
                    {notice.requestId}
                  </div>
                </div>
              ) : null}
            </InlineNotice>
          </div>
        ) : null}

        <Outlet />
      </div>
    </div>
  );
}

export function RootLayout() {
  return (
    <ConsoleNoticeProvider>
      <RootLayoutContent />
    </ConsoleNoticeProvider>
  );
}
