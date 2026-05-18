import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { LanguageSwitcher, translateRuntimeMessage } from "@yinjie/i18n";
import { Button, LoadingBlock } from "@yinjie/ui";
import { clearSession, hasRole, useRoleLabel, type WikiUser } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";

const TUTORIAL_LOCALES = ["zh-CN", "en-US", "ja-JP", "ko-KR"] as const;
type TutorialLocale = (typeof TUTORIAL_LOCALES)[number];

function pickTutorialLocale(locale: string | undefined): TutorialLocale {
  if (!locale) return "zh-CN";
  const exact = TUTORIAL_LOCALES.find((l) => l === locale);
  if (exact) return exact;
  const prefix = locale.split("-")[0]?.toLowerCase();
  const fallback: Record<string, TutorialLocale> = {
    zh: "zh-CN",
    en: "en-US",
    ja: "ja-JP",
    ko: "ko-KR",
  };
  return fallback[prefix ?? ""] ?? "zh-CN";
}

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
        to: "/my-drafts",
        label: msg`我的草稿`,
        icon: "📋",
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
  const { i18n } = useLingui();
  const { user } = useAuth();
  const roleLabel = useRoleLabel();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const urlSearchQ = useRouterState({
    select: (s) => {
      if (s.location.pathname !== "/search") return "";
      const raw = (s.location.search as { q?: unknown } | undefined)?.q;
      return typeof raw === "string" ? raw : "";
    },
  });
  const [q, setQ] = useState(urlSearchQ);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Keep the top-bar input synced with /search?q= so reload / back / forward
  // and direct deep links don't leave the box visually empty.
  useEffect(() => {
    setQ(urlSearchQ);
  }, [urlSearchQ]);

  // index.html 的 <title>隐界角色百科</title> 是硬编码 zh-CN，切到 en/ja/ko
  // 之后浏览器 tab 仍然显示中文。这里在 locale 切换时同步更新 document.title，
  // 同时把 <html lang> 也改掉——影响屏幕阅读器朗读、Google Translate 触发、
  // CSS lang() 选择器与字体 fallback。
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = t(msg`隐界角色百科`);
    if (i18n.locale) {
      document.documentElement.lang = i18n.locale;
    }
  }, [i18n.locale, t]);

  // Close mobile nav on route change.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // 抽屉打开时锁掉背景滚动（fixed + overflow），避免移动端透到下层内容
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (mobileNavOpen) {
      root.classList.add("wiki-nav-open");
    } else {
      root.classList.remove("wiki-nav-open");
    }
    return () => {
      root.classList.remove("wiki-nav-open");
    };
  }, [mobileNavOpen]);

  // ESC 关闭抽屉（无障碍 + 桌面键盘用户）
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

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
        <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white text-lg lg:hidden"
            aria-label={t(msg`打开导航`)}
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            ☰
          </button>
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 text-base font-semibold sm:text-lg"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-base text-[color:var(--text-on-brand)] shadow-[var(--shadow-card)]">
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
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-4">
            <button
              type="button"
              onClick={() => {
                const target = pickTutorialLocale(i18n.locale);
                window.open(
                  `/tutorial-${target}.html`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              title={t(msg`新手教程 / Tutorial`)}
              aria-label={t(msg`新手教程`)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white text-base hover:bg-[color:var(--surface-card-hover)] sm:hidden"
            >
              <span aria-hidden>📖</span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => {
                const target = pickTutorialLocale(i18n.locale);
                window.open(
                  `/tutorial-${target}.html`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              title={t(msg`新手教程 / Tutorial`)}
            >
              <span aria-hidden>📖</span>
              <span className="ml-1">
                <Trans>教程</Trans>
              </span>
            </Button>
            {/* LanguageSwitcher 在 ≤sm 屏挤不下（"界面语言" 标签 + 4 语种 select
                能占 ~110px）。<sm 改藏到移动端抽屉底部；≥sm 仍放在 header 右侧。 */}
            <div className="hidden sm:block">
              <LanguageSwitcher variant="compact" description={null} />
            </div>
            {user ? (
              <UserMenu user={user} roleLabel={roleLabel} />
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => void navigate({ to: "/login" })}
                >
                  <Trans>登录</Trans>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const target =
                      typeof window !== "undefined" &&
                      window.matchMedia("(min-width: 640px)").matches
                        ? "/register"
                        : "/login";
                    void navigate({ to: target });
                  }}
                >
                  <span className="hidden sm:inline">
                    <Trans>注册</Trans>
                  </span>
                  <span className="sm:hidden">
                    <Trans>登录</Trans>
                  </span>
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

      <div className="relative mx-auto flex w-full max-w-screen-2xl flex-1 gap-6 px-3 pb-10 pt-4 sm:px-6 sm:pt-6 sm:pb-12">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label={t(msg`关闭导航`)}
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside
          className={`wiki-touch-scroll fixed inset-y-0 left-0 z-40 w-72 max-w-[85%] transform overflow-y-auto border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)] px-4 py-5 shadow-2xl transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)] lg:static lg:z-auto lg:block lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:border-r-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:overflow-visible ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* 抽屉内顶部一个关闭按钮：移动端用户除了点遮罩，也能在抽屉内直接点 X 关闭 */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label={t(msg`关闭导航`)}
            className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-white text-base lg:hidden"
          >
            ✕
          </button>
          <div className="lg:sticky lg:top-[88px]">
            <NavList groups={visibleGroups} pathname={pathname} />
            {/* 抽屉底部塞一个 LanguageSwitcher，给移动端用户用（顶栏 <sm 隐藏掉了）。
                ≥lg 桌面同样保留，便于一致性。 */}
            <div className="mt-5 lg:mt-6">
              <LanguageSwitcher variant="compact" description={null} />
            </div>
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

function UserMenu({
  user,
  roleLabel,
}: {
  user: WikiUser;
  roleLabel: (role: string) => string;
}) {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const node = wrapRef.current;
      if (!node || !(event.target instanceof Node)) return;
      if (node.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = user.username?.[0]?.toUpperCase() ?? "?";
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.username}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-white p-1 text-left text-xs leading-tight transition-colors hover:bg-[color:var(--surface-card-hover)] sm:px-3 sm:py-1.5"
      >
        {/* 移动端：只显示首字母 avatar 圆点（用户名挪到下拉菜单顶部）。
            ≥sm 显示用户名 + 角色双行。这样窄屏 header 不会被长用户名顶出右边界。
            chip 总尺寸 ≥36×36 保证触控可达。 */}
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[image:var(--brand-gradient)] text-sm font-semibold text-[color:var(--text-on-brand)] sm:hidden">
          {initial}
        </span>
        <div className="hidden md:block">
          <div className="font-medium text-[color:var(--text-primary)]">
            {user.username}
          </div>
          <div className="text-[color:var(--text-muted)]">
            {roleLabel(user.role)}
          </div>
        </div>
        <span className="hidden font-medium text-[color:var(--text-primary)] sm:inline md:hidden">
          {user.username}
        </span>
        <span aria-hidden className="hidden pr-1 text-[10px] text-[color:var(--text-muted)] sm:inline">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-overlay)] shadow-lg"
        >
          {/* 移动端 chip 只显示首字母，把用户名和角色挪进下拉菜单顶部。 */}
          <div className="border-b border-[color:var(--border-subtle)] px-4 py-2.5 sm:hidden">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {user.username}
            </div>
            <div className="truncate text-xs text-[color:var(--text-muted)]">
              {roleLabel(user.role)}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-4 py-2 text-left text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-card-hover)]"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/account" });
            }}
          >
            {t(msg`账户设置`)}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full border-t border-[color:var(--border-subtle)] px-4 py-2 text-left text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-card-hover)]"
            onClick={() => {
              setOpen(false);
              clearSession();
              window.location.href = "/login";
            }}
          >
            {t(msg`退出`)}
          </button>
        </div>
      )}
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
