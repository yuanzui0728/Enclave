import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { LanguageSwitcher, translateRuntimeMessage } from "@yinjie/i18n";
import { Button, LoadingBlock } from "@yinjie/ui";
import { clearSession, hasRole, useRoleLabel } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";

type NavItem = {
  to: string;
  label: MessageDescriptor;
  icon: string;
  /** True when the item should be highlighted given the current pathname. */
  match?: (pathname: string) => boolean;
  /** Returns true if this item should be visible for the current user. */
  show: (user: ReturnType<typeof useAuth>["user"]) => boolean;
};

type NavGroup = {
  title: MessageDescriptor;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: msg`浏览`,
    items: [
      {
        to: "/",
        label: msg`角色目录`,
        icon: "📚",
        match: (p) =>
          p === "/" ||
          (p.startsWith("/character/") && !p.endsWith("/diff")),
        show: () => true,
      },
      {
        to: "/recent-changes",
        label: msg`最近修改`,
        icon: "🕘",
        show: () => true,
      },
      {
        to: "/search",
        label: msg`搜索`,
        icon: "🔍",
        show: () => true,
      },
    ],
  },
  {
    title: msg`编辑`,
    items: [
      {
        to: "/create",
        label: msg`创建角色`,
        icon: "✨",
        show: (u) => !!u,
      },
      {
        to: "/my-characters",
        label: msg`我的私有角色`,
        icon: "🗂",
        match: (p) => p === "/my-characters" || p.startsWith("/my-characters/"),
        show: (u) => !!u,
      },
      {
        to: "/watchlist",
        label: msg`我的观察列表`,
        icon: "👁",
        show: (u) => !!u,
      },
    ],
  },
  {
    title: msg`巡查`,
    items: [
      {
        to: "/pending-reviews",
        label: msg`待审编辑`,
        icon: "📝",
        show: (u) => hasRole(u, "patroller"),
      },
    ],
  },
  {
    title: msg`管理`,
    items: [
      {
        to: "/admin/users",
        label: msg`用户与权限`,
        icon: "👤",
        show: (u) => hasRole(u, "admin"),
      },
      {
        to: "/admin/blocks",
        label: msg`封禁`,
        icon: "⛔",
        show: (u) => hasRole(u, "admin"),
      },
      {
        to: "/admin/protection",
        label: msg`页面保护`,
        icon: "🛡",
        show: (u) => hasRole(u, "admin"),
      },
      {
        to: "/admin/reports",
        label: msg`举报队列`,
        icon: "🚩",
        show: (u) => hasRole(u, "admin"),
      },
      {
        to: "/admin/abuse-filters",
        label: msg`反破坏过滤器`,
        icon: "🧪",
        show: (u) => hasRole(u, "admin"),
      },
      {
        to: "/admin/wiki-stats",
        label: msg`治理仪表盘`,
        icon: "📊",
        show: (u) => hasRole(u, "admin"),
      },
    ],
  },
];

export function RootLayout() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const roleLabel = useRoleLabel();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [q, setQ] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile nav on route change.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((it) => it.show(user)),
      })).filter((g) => g.items.length > 0),
    [user],
  );

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = q.trim();
    if (!term) return;
    void navigate({ to: "/search", search: { q: term } });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white text-lg lg:hidden"
            aria-label={t(msg`打开导航`)}
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            ☰
          </button>
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-base font-semibold sm:text-lg"
          >
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-base text-[color:var(--text-on-brand)] shadow-[var(--shadow-card)]">
              <Trans>隐</Trans>
            </span>
            <span className="hidden truncate sm:inline">
              <Trans>隐界世界角色管理平台</Trans>
            </span>
            <span className="truncate sm:hidden">
              <Trans>隐界角色管理</Trans>
            </span>
          </Link>
          <form
            className="ml-auto hidden flex-1 max-w-md md:block"
            onSubmit={submitSearch}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]">
                🔍
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t(msg`搜索角色词条…（回车）`)}
                className="h-10 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] pl-9 pr-3 text-sm shadow-[var(--shadow-soft)] outline-none focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <LanguageSwitcher variant="compact" description={null} />
            {user ? (
              <>
                <div className="hidden text-right text-xs leading-tight md:block">
                  <div className="font-medium text-[color:var(--text-primary)]">
                    {user.username}
                  </div>
                  <div className="text-[color:var(--text-muted)]">
                    {roleLabel(user.role)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearSession();
                    window.location.href = "/login";
                  }}
                >
                  <Trans>退出</Trans>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate({ to: "/login" })}
                >
                  <Trans>登录</Trans>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void navigate({ to: "/register" })}
                >
                  <Trans>注册</Trans>
                </Button>
              </>
            )}
          </div>
        </div>
        {/* Mobile search */}
        <div className="mx-auto w-full max-w-screen-2xl px-4 pb-3 md:hidden">
          <form onSubmit={submitSearch}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]">
                🔍
              </span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t(msg`搜索词条…`)}
                className="h-10 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] pl-9 pr-3 text-sm shadow-[var(--shadow-soft)] outline-none focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </form>
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-screen-2xl flex-1 gap-6 px-4 pb-12 pt-6 sm:px-6">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label={t(msg`关闭导航`)}
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85%] transform overflow-y-auto border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)] px-4 py-5 shadow-2xl transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)] lg:static lg:z-auto lg:block lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:border-r-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:overflow-visible ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="lg:sticky lg:top-[88px]">
            <NavList groups={visibleGroups} pathname={pathname} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <Suspense fallback={<LoadingBlock className="m-6" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <footer className="border-t border-[color:var(--border-subtle)] py-4 text-center text-xs text-[color:var(--text-muted)]">
        <Trans>
          隐界世界角色管理平台 ·
          任何登录用户都可以提交角色创建、编辑和生命周期变更，由巡查员审核生效
        </Trans>
      </footer>
    </div>
  );
}

function NavList({
  groups,
  pathname,
}: {
  groups: NavGroup[];
  pathname: string;
}) {
  const t = translateRuntimeMessage;
  return (
    <nav className="space-y-5">
      {groups.map((group) => {
        const groupTitle = t(group.title);
        return (
          <div key={groupTitle}>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {groupTitle}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.match
                  ? item.match(pathname)
                  : pathname === item.to ||
                    pathname.startsWith(`${item.to}/`);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]"
                          : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                      }`}
                    >
                      <span aria-hidden className="text-base leading-none">
                        {item.icon}
                      </span>
                      <span className="truncate">{t(item.label)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
