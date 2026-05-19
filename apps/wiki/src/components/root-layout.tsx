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
  // <aside id=wiki-mobile-nav> 是个永久挂在 DOM 里的"屉式"导航：mobile 视口下用
  // -translate-x-full 推到屏外。translate 不脱离 tab 序列，键盘用户从顶栏一路
  // Tab，第 5~6 个 tab 会落到 -288px 处那颗 unseen "关闭导航" 按钮然后失踪。
  // 用 matchMedia 跟踪 lg 断点；mobile 视口下若抽屉关闭，给 <aside> 标 inert
  // + aria-hidden，把整组 16 个 tabbable 控件移出 tab 路径。lg 桌面是常驻 sidebar
  // 不该 inert，所以读 isLargeViewport。
  const [isLargeViewport, setIsLargeViewport] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLargeViewport(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const drawerInert = !isLargeViewport && !mobileNavOpen;

  // 抽屉关闭后把焦点还给最初的 ☰ 触发按钮 —— 键盘 / SR 用户点 ☰ 打开 → 按
  // Escape 或点 X 关闭，原写法焦点会丢到 body（document.activeElement=BODY），
  // 用户必须用 Shift+Tab 一路退回头部才能再操作。WAI-ARIA APG 的 disclosure
  // pattern 要求 disclosure 关闭后焦点回到 trigger。
  const navTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const prevMobileNavOpenRef = useRef(false);
  useEffect(() => {
    if (prevMobileNavOpenRef.current && !mobileNavOpen) {
      // 关闭瞬间：把焦点还给 ☰。如果 ☰ 在 lg 视口不可见就跳过（≥lg 时
      // mobileNavOpen 不会被用户主动开，这条分支理论上不会触发）。
      navTriggerRef.current?.focus();
    } else if (!prevMobileNavOpenRef.current && mobileNavOpen) {
      // 打开瞬间：把焦点送进抽屉的 ✕ 按钮 —— 否则焦点仍停在 ☰ 触发按钮
      // 上（视觉被遮罩遮住，键盘 / SR 用户感觉不到 modal 已展开）。
      drawerCloseRef.current?.focus();
    }
    prevMobileNavOpenRef.current = mobileNavOpen;
  }, [mobileNavOpen]);

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
            ref={navTriggerRef}
            type="button"
            // 抽屉是 disclosure 模式：触发按钮 + 受其控制的 region。挂
            // aria-expanded 让 SR 念出"折叠 / 展开"，原写法仅 aria-label
            // 用户听到的只是"打开导航 button"，不知道当前状态。
            aria-expanded={mobileNavOpen}
            aria-controls="wiki-mobile-nav"
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
            {/* 头像方块只是装饰：紧挨着的 span 已经把 "隐界世界角色管理平台" /
                "隐界角色管理" 给出 SR 可访问名。原本 <Trans>隐</Trans> 会让屏读
                先念一遍翻译版的"隐"再念全名，整条链接读出来像 "Yin / Enclave
                Yinjie shijie jiaose guanli pingtai"。整块 aria-hidden 让 SR 只读
                全称。 */}
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-base text-[color:var(--text-on-brand)] shadow-[var(--shadow-card)]"
            >
              隐
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
                // aria-label：placeholder 在 screen reader 里不可靠（部分浏览器
                // 焦点后就吃掉只读"edit"），加显式 aria-label 给屏读用户。
                aria-label={t(msg`搜索角色词条`)}
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
                aria-label={t(msg`搜索角色词条`)}
                className="h-10 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] pl-9 pr-3 text-sm shadow-[var(--shadow-soft)] outline-none focus:border-[color:var(--brand-primary)]"
              />
            </div>
          </form>
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-screen-2xl flex-1 gap-6 px-3 pb-10 pt-4 sm:px-6 sm:pt-6 sm:pb-12">
        {mobileNavOpen && (
          // 遮罩 backdrop：原写法和抽屉内的 X 关闭按钮共用 aria-label="关闭
          // 导航"，SR 用户 Tab 时会听到"关闭导航 button"两次完全一样，分不清
          // 哪个是主关闭目标。遮罩仅服务鼠标/触摸"点空白处关闭"的便利，
          // 不应是键盘/SR 的关闭入口（焦点应该走抽屉内的 X 按钮）。
          // tabIndex=-1 + aria-hidden=true 把它从 SR / Tab 路径里隐藏，保留
          // 视觉与点击行为。
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside
          id="wiki-mobile-nav"
          // mobile 视口下抽屉关闭时 inert + aria-hidden，把 16 个屏外 tab 目标
          // （✕、导航链接、语言下拉等）从键盘 / SR 路径里隐藏。lg+ 桌面常驻
          // sidebar 一直可达，不能 inert。
          inert={drawerInert ? true : undefined}
          aria-hidden={drawerInert ? "true" : undefined}
          className={`wiki-touch-scroll fixed inset-y-0 left-0 z-40 w-72 max-w-[85%] transform overflow-y-auto border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)] px-4 py-5 shadow-2xl transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)] lg:static lg:z-auto lg:block lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:border-r-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:overflow-visible ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* 抽屉内顶部一个关闭按钮：移动端用户除了点遮罩，也能在抽屉内直接点 X 关闭。
              ref 让"打开抽屉" useEffect 把初始焦点送进来，符合 modal 打开标准模式。 */}
          <button
            ref={drawerCloseRef}
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
        // 原写法 aria-label 只塞 user.username，SR 用户听到 "yuanzui0728_5999,
        // menu" 不知道这个 menu 是干什么的（账户菜单？通知菜单？切语言？）。
        // 显式说明这是"账户菜单"，并把用户名嵌进去做区分（如果同页有多个
        // 用户菜单触发器）。
        aria-label={t(msg`${user.username} 账户菜单`)}
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
    // 整个 wiki 后台已经有 root-layout 顶栏导航 + 角色编辑章节跳转 + admin
    // 二级 tab，盲用用户的 SR 在"跳到下一个导航 landmark"时听到三个无名
    // "navigation"，区分不出来。给主侧栏 nav 显式 aria-label。
    <nav aria-label={t(msg`主导航`)} className="space-y-5">
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
