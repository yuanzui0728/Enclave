import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LanguageSwitcher } from "@yinjie/i18n";
import { InlineNotice } from "@yinjie/ui";
import { JobsPermalinkLink } from "./jobs-permalink-link";
import { SessionsPermalinkLink } from "./sessions-permalink-link";
import { WaitingSyncPermalinkLink } from "./waiting-sync-permalink-link";
import { WorldsPermalinkLink } from "./worlds-permalink-link";
import {
  addCloudAdminSecretInvalidListener,
  getCloudAdminSecret,
  revokeStoredCloudAdminSession,
  setCloudAdminSecret,
} from "../lib/cloud-admin-api";
import {
  translateCloudConsoleTextForActiveLocale,
  useCloudConsoleText,
} from "../lib/cloud-console-i18n";
import { ConsoleNoticeProvider, useConsoleNotice } from "./console-notice";

const NAV_LINK =
  "block rounded-[20px] border border-transparent px-3.5 py-2.5 text-sm text-[color:var(--text-secondary)] transition-[background-color,border-color,color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]";
const NAV_LINK_ACTIVE =
  "block rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--surface-card)] px-3.5 py-2.5 text-sm font-semibold text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]";
const SECRET_INPUT =
  "w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none transition focus:border-[color:var(--border-brand)]";

type RouteMeta = {
  eyebrow: string;
  title: string;
  detail: string;
};

// i18n-ignore-start: Cloud console route metadata is localized by the surface text dictionary.
function getRouteMeta(pathname: string): RouteMeta {
  if (pathname.startsWith("/users/")) {
    return {
      eyebrow: "SaaS operations",
      title: "User detail",
      detail:
        "Inspect subscription history, invite rewards, and one cloud account's world linkage.",
    };
  }

  if (pathname.startsWith("/users")) {
    return {
      eyebrow: "SaaS operations",
      title: "Users",
      detail:
        "Review cloud account status, subscription expiry, inviter attribution, and world linkage.",
    };
  }

  if (pathname.startsWith("/wiki-users/")) {
    return {
      eyebrow: "Wiki operations",
      title: "Wiki user detail",
      detail:
        "Inspect one wiki user's private characters, full recipe / profile / trigger scenes.",
    };
  }

  if (pathname.startsWith("/wiki-users")) {
    return {
      eyebrow: "Wiki operations",
      title: "Wiki users",
      detail:
        "Review wiki account roles, edit stats, registered emails, and private character counts.",
    };
  }

  if (pathname.startsWith("/subscription-plans")) {
    return {
      eyebrow: "SaaS operations",
      title: "Plans",
      detail:
        "Configure trial, monthly, quarterly, yearly, and invite reward plans shown to the app.",
    };
  }

  if (pathname.startsWith("/configs")) {
    return {
      eyebrow: "SaaS operations",
      title: "Configs",
      detail:
        "Manage SaaS trial, invite, feature, copy, and public app URL configuration.",
    };
  }

  if (pathname.startsWith("/invite-audit")) {
    return {
      eyebrow: "SaaS operations",
      title: "Invite audit",
      detail:
        "Review reward redemptions, device and IP signals, and manual reversals.",
    };
  }

  if (pathname.startsWith("/feedbacks")) {
    return {
      eyebrow: "SaaS operations",
      title: "Feedbacks",
      detail:
        "Review user-submitted desktop and web feedback, triage status, and assign handler notes.",
    };
  }

  if (pathname.startsWith("/worlds/")) {
    return {
      eyebrow: "Cloud operations",
      title: "World detail",
      detail:
        "Inspect instance placement, runtime status, bootstrap material, and lifecycle jobs.",
    };
  }

  if (pathname.startsWith("/worlds")) {
    return {
      eyebrow: "Cloud operations",
      title: "Worlds",
      detail:
        "Track provider placement, power state, heartbeat freshness, and operator attention.",
    };
  }

  if (pathname.startsWith("/jobs")) {
    return {
      eyebrow: "Cloud operations",
      title: "Jobs",
      detail:
        "Inspect provisioning, resume, suspend, and reconcile work across the managed world fleet.",
    };
  }

  if (pathname.startsWith("/sessions")) {
    return {
      eyebrow: "Cloud operations",
      title: "Sessions",
      detail:
        "Review admin access, risk groups, revocation paths, and source activity.",
    };
  }

  if (pathname.startsWith("/waiting-sync")) {
    return {
      eyebrow: "Cloud operations",
      title: "Waiting Sync",
      detail:
        "Replay exhausted compensation tasks and clear stale failures from one queue.",
    };
  }

  if (pathname.startsWith("/revenue-sharing")) {
    return {
      eyebrow: "Cloud monetization",
      title: "Revenue Sharing",
      detail:
        "Configure role usage pricing, payees, contribution weights, and settlement ledgers.",
    };
  }

  if (pathname.startsWith("/token-usage/")) {
    return {
      eyebrow: "Cloud monetization",
      title: "Token Usage Detail",
      detail:
        "Drill into one world's LLM token consumption by character, model, scene, and conversation.",
    };
  }

  if (pathname.startsWith("/token-usage")) {
    return {
      eyebrow: "Cloud monetization",
      title: "Token Usage",
      detail:
        "Track LLM token consumption and cost across worlds, with platform-level budgets and pricing.",
    };
  }

  return {
    eyebrow: "Cloud operations",
    title: "Dashboard",
    detail:
      "Monitor world availability, lifecycle jobs, request flow, and cloud runtime drift.",
  };
}
// i18n-ignore-end

function NavLinkContent({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate leading-5">{label}</span>
      <span
        aria-hidden="true"
        className="mt-0.5 block truncate text-xs font-normal text-[color:var(--text-muted)]"
      >
        {hint}
      </span>
    </span>
  );
}

function StatusDot({ tone }: { tone: "ready" | "warning" }) {
  const label = translateCloudConsoleTextForActiveLocale(
    tone === "ready" ? "System ready" : "System warning",
  );
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={
        tone === "ready"
          ? "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
          : "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
      }
    />
  );
}

function RootLayoutContent() {
  const t = useCloudConsoleText();
  const queryClient = useQueryClient();
  const { notice, showNotice } = useConsoleNotice();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [secret, setSecret] = useState(getCloudAdminSecret);
  const [editingSecret, setEditingSecret] = useState(!getCloudAdminSecret());
  const [draft, setDraft] = useState(getCloudAdminSecret);
  const moreSectionPaths = ["/jobs", "/waiting-sync", "/sessions", "/configs"];
  const moreSectionActive = moreSectionPaths.some((p) => pathname.startsWith(p));
  const [moreExpanded, setMoreExpanded] = useState(moreSectionActive);
  const hasSecret = Boolean(secret.trim());
  const rawRouteMeta = getRouteMeta(pathname);
  const routeMeta = {
    eyebrow: t(rawRouteMeta.eyebrow),
    title: t(rawRouteMeta.title),
    detail: t(rawRouteMeta.detail),
  };

  useEffect(() => {
    if (moreSectionActive) {
      setMoreExpanded(true);
    }
  }, [moreSectionActive]);

  useEffect(
    () =>
      addCloudAdminSecretInvalidListener(({ requestId }) => {
        setSecret("");
        setDraft("");
        setEditingSecret(true);
        void queryClient.cancelQueries({ queryKey: ["cloud-console"] });
        queryClient.removeQueries({ queryKey: ["cloud-console"] });
        showNotice(
          translateCloudConsoleTextForActiveLocale(
            "CLOUD_ADMIN_SECRET is invalid.",
          ),
          "danger",
          { requestId },
        );
      }),
    [queryClient, showNotice],
  );

  async function saveSecret() {
    const nextSecret = draft.trim();
    const previousSecret = secret.trim();
    if (previousSecret && previousSecret !== nextSecret) {
      await revokeStoredCloudAdminSession().catch(() => undefined);
    }
    setCloudAdminSecret(nextSecret);
    setSecret(nextSecret);
    setEditingSecret(!nextSecret);
    showNotice(
      nextSecret
        ? "Admin secret saved locally. Short-lived admin tokens will refresh automatically."
        : "Admin secret cleared.",
      nextSecret ? "success" : "info",
    );
    void queryClient.invalidateQueries();
  }

  // i18n-ignore-start: Cloud console navigation copy is localized by the surface text dictionary.
  const primaryNavItems = [
    {
      key: "dashboard",
      content: (
        <Link
          to="/"
          className={pathname === "/" ? NAV_LINK_ACTIVE : NAV_LINK}
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Dashboard")}
            hint={t("Availability and drift")}
          />
        </Link>
      ),
    },
    {
      key: "worlds",
      content: (
        <WorldsPermalinkLink
          className={
            pathname.startsWith("/worlds") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={pathname.startsWith("/worlds") ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Worlds")}
            hint={t("Instances and health")}
          />
        </WorldsPermalinkLink>
      ),
    },
    {
      key: "users",
      content: (
        <Link
          to="/users"
          className={pathname.startsWith("/users") ? NAV_LINK_ACTIVE : NAV_LINK}
          aria-current={pathname.startsWith("/users") ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Users")}
            hint={t("Accounts and expiry")}
          />
        </Link>
      ),
    },
    {
      key: "wiki-users",
      content: (
        <Link
          to="/wiki-users"
          className={
            pathname.startsWith("/wiki-users") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={
            pathname.startsWith("/wiki-users") ? "page" : undefined
          }
        >
          <NavLinkContent
            label={t("Wiki users")}
            hint={t("Roles and private characters")}
          />
        </Link>
      ),
    },
    {
      key: "plans",
      content: (
        <Link
          to="/subscription-plans"
          className={
            pathname.startsWith("/subscription-plans")
              ? NAV_LINK_ACTIVE
              : NAV_LINK
          }
          aria-current={
            pathname.startsWith("/subscription-plans") ? "page" : undefined
          }
        >
          <NavLinkContent
            label={t("Plans")}
            hint={t("Pricing and access")}
          />
        </Link>
      ),
    },
    {
      key: "invite-audit",
      content: (
        <Link
          to="/invite-audit"
          className={
            pathname.startsWith("/invite-audit") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={
            pathname.startsWith("/invite-audit") ? "page" : undefined
          }
        >
          <NavLinkContent
            label={t("Invite Audit")}
            hint={t("Rewards and risk")}
          />
        </Link>
      ),
    },
    {
      key: "feedbacks",
      content: (
        <Link
          to="/feedbacks"
          className={
            pathname.startsWith("/feedbacks") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={pathname.startsWith("/feedbacks") ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Feedbacks")}
            hint={t("User-submitted reports")}
          />
        </Link>
      ),
    },
    {
      key: "telemetry",
      content: (
        <Link
          to="/telemetry"
          className={
            pathname.startsWith("/telemetry") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={pathname.startsWith("/telemetry") ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Telemetry")}
            hint={t("Client analytics")}
          />
        </Link>
      ),
    },
    {
      key: "revenue-sharing",
      content: (
        <Link
          to="/revenue-sharing"
          className={
            pathname === "/revenue-sharing" ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={pathname === "/revenue-sharing" ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Revenue Sharing")}
            hint={t("Payees and ledgers")}
          />
        </Link>
      ),
    },
    {
      key: "token-usage",
      content: (
        <Link
          to="/token-usage"
          className={
            pathname.startsWith("/token-usage") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={pathname.startsWith("/token-usage") ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Token Usage")}
            hint={t("LLM consumption and cost")}
          />
        </Link>
      ),
    },
  ] as const;

  const moreNavItems = [
    {
      key: "configs",
      content: (
        <Link
          to="/configs"
          className={
            pathname.startsWith("/configs") ? NAV_LINK_ACTIVE : NAV_LINK
          }
          aria-current={pathname.startsWith("/configs") ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Configs")}
            hint={t("Trial and copy")}
          />
        </Link>
      ),
    },
    {
      key: "jobs",
      content: (
        <JobsPermalinkLink
          className={pathname === "/jobs" ? NAV_LINK_ACTIVE : NAV_LINK}
          aria-current={pathname === "/jobs" ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Jobs")}
            hint={t("Queue and leases")}
          />
        </JobsPermalinkLink>
      ),
    },
    {
      key: "waiting-sync",
      content: (
        <WaitingSyncPermalinkLink
          className={pathname === "/waiting-sync" ? NAV_LINK_ACTIVE : NAV_LINK}
          aria-current={pathname === "/waiting-sync" ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Waiting Sync")}
            hint={t("Durable tasks")}
          />
        </WaitingSyncPermalinkLink>
      ),
    },
    {
      key: "sessions",
      content: (
        <SessionsPermalinkLink
          className={pathname === "/sessions" ? NAV_LINK_ACTIVE : NAV_LINK}
          aria-current={pathname === "/sessions" ? "page" : undefined}
        >
          <NavLinkContent
            label={t("Sessions")}
            hint={t("Access audit")}
          />
        </SessionsPermalinkLink>
      ),
    },
  ] as const;
  // i18n-ignore-end

  return (
    <div className="relative min-h-screen text-[color:var(--text-primary)]">
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

      <div className="relative min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-b border-[color:var(--border-faint)] bg-[color:var(--surface-shell)]/92 px-4 py-4 shadow-[var(--shadow-shell)] backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden lg:border-b-0 lg:border-r xl:px-5 xl:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">
                {t("Yinjie Cloud Ops")}
              </div>
              <div className="break-words text-base font-semibold leading-tight text-[color:var(--text-primary)]">
                {t("Cloud World Console")}
              </div>
            </div>
            <span
              className={
                hasSecret
                  ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  : "rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
              }
            >
              {hasSecret ? t("Ready") : t("Setup")}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <StatusDot tone={hasSecret ? "ready" : "warning"} />
              <span className="min-w-0 break-words text-xs leading-4 text-[color:var(--text-muted)]">
                {hasSecret
                  ? t("Admin secret configured")
                  : t("Admin secret missing")}
              </span>
            </div>
          </div>

          <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
            <section>
              <div className="px-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {t("Navigation")}
              </div>
              <div className="mt-2 space-y-1">
                {primaryNavItems.map((item) => (
                  <div key={item.key}>{item.content}</div>
                ))}
              </div>
            </section>

            <section>
              <button
                type="button"
                onClick={() => setMoreExpanded((value) => !value)}
                aria-expanded={moreExpanded}
                className="flex w-full items-center justify-between px-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-secondary)]"
              >
                <span>{t("More")}</span>
                <span aria-hidden="true">{moreExpanded ? "−" : "+"}</span>
              </button>
              {moreExpanded ? (
                <div className="mt-2 space-y-1">
                  {moreNavItems.map((item) => (
                    <div key={item.key}>{item.content}</div>
                  ))}
                </div>
              ) : null}
            </section>
          </nav>

          <div className="mt-4 border-t border-[color:var(--border-faint)] pt-4">
            {editingSecret ? (
              <div className="space-y-2">
                <div className="px-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  {t("Cloud access")}
                </div>
                <input
                  type="password"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("Enter CLOUD_ADMIN_SECRET")}
                  className={SECRET_INPUT}
                  onKeyDown={(event) =>
                    event.key === "Enter" && void saveSecret()
                  }
                />
                <button
                  type="button"
                  className="w-full rounded-2xl border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-3 py-2 text-sm font-medium text-[color:var(--brand-primary)] transition hover:border-[color:var(--border-strong)]"
                  onClick={() => void saveSecret()}
                >
                  {t("Save")}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-[color:var(--text-muted)]">
                  {secret
                    ? t(
                        "Admin secret saved locally. Console uses short-lived admin tokens.",
                      )
                    : t("Admin secret is missing.")}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-[color:var(--brand-primary)] transition hover:text-[color:var(--brand-secondary)]"
                  onClick={() => setEditingSecret(true)}
                >
                  {t("Edit")}
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-20 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
            <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-5 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                    {routeMeta.eyebrow}
                  </div>
                  <h1 className="mt-0.5 break-words text-xl font-semibold text-[color:var(--text-primary)]">
                    {routeMeta.title}
                  </h1>
                  <div className="mt-1 max-w-3xl text-xs leading-5 text-[color:var(--text-secondary)]">
                    {routeMeta.detail}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
                  <LanguageSwitcher variant="compact" description={null} />
                  <div className="max-w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1 text-center text-xs text-[color:var(--text-muted)]">
                    {hasSecret ? t("Ready") : t("Setup")}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="px-4 pb-6 pt-4 sm:px-6 lg:px-8 lg:pb-8">
            {notice ? (
              <div className="mb-6">
                <InlineNotice tone={notice.tone}>
                  <div>{notice.message}</div>
                  {notice.requestId ? (
                    <div className="mt-3 border-t border-current/15 pt-3 text-xs leading-5 text-current/90">
                      <div className="uppercase tracking-[0.12em] opacity-80">
                        {t("Request id")}
                      </div>
                      <div className="mt-1 break-all font-mono">
                        {notice.requestId}
                      </div>
                    </div>
                  ) : null}
                </InlineNotice>
              </div>
            ) : null}

            {hasSecret ? (
              <Outlet />
            ) : (
              <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
                <InlineNotice tone="warning">
                  <div className="font-semibold">
                    {t("Admin access required")}
                  </div>
                  <div className="mt-2 text-sm leading-6">
                    {t(
                      "Enter CLOUD_ADMIN_SECRET to unlock the console. Cloud requests are paused until a secret is saved locally.",
                    )}
                  </div>
                </InlineNotice>
              </section>
            )}
          </div>
        </main>
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
