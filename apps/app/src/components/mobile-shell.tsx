import {
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { getConversations } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  Compass,
  MessageCircleMore,
  UserRound,
  UsersRound,
} from "lucide-react";
import { cn } from "@yinjie/ui";
import { useMessageReminders } from "../features/chat/use-message-reminders";
import { useChatReminderEntries } from "../features/chat/use-chat-reminder-entries";
import { MobileReminderToastHost } from "../features/chat/mobile-reminder-toast-host";
import { persistMobileWebRoute } from "../features/shell/mobile-web-route-persistence";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import { recordAppNavigation } from "../lib/history-back";
import { isMobileWebRuntime } from "../runtime/platform";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const EMPTY_CONVERSATIONS = Object.freeze([]);

const tabs = [
  { to: "/tabs/chat", label: msg`消息`, icon: MessageCircleMore },
  { to: "/tabs/contacts", label: msg`通讯录`, icon: UsersRound },
  { to: "/tabs/discover", label: msg`发现`, icon: Compass },
  { to: "/tabs/profile", label: msg`我`, icon: UserRound },
];
const KEEP_ALIVE_TAB_PATHS = new Set(tabs.map((tab) => tab.to));

export function MobileShell({ children }: PropsWithChildren) {
  const t = useRuntimeTranslator();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const showTabs = KEEP_ALIVE_TAB_PATHS.has(pathname);
  const activeKeepAlivePath = KEEP_ALIVE_TAB_PATHS.has(pathname)
    ? pathname
    : null;
  const runtimeConfig = useAppRuntimeConfig();
  const { reminders } = useMessageReminders();

  // 走查 R4（第 4 轮）：和 chat-list-page / chat-room-page / chat-details /
  // mobile-ai-call-screen 共享 ["app-conversations", baseUrl]，其它 4 处都
  // 对齐到 15s staleTime。本观察者裸跑 → 用户切 tab / 进/退聊天页时跨页面
  // 都用同一 cache，原生壳 10s 默认 stale 跨页面切换很容易踩到，触发重复
  // GET /conversations（公网隧道 ~600ms）。对齐 15s。
  const { data: conversations } = useQuery({
    queryKey: ["app-conversations", runtimeConfig.apiBaseUrl],
    queryFn: () => getConversations(runtimeConfig.apiBaseUrl),
    enabled: showTabs,
    staleTime: 15_000,
  });
  const conversationList = useMemo(
    () => conversations ?? EMPTY_CONVERSATIONS,
    [conversations],
  );

  const chatUnreadCount = useMemo(
    () =>
      conversationList
        .filter((c) => !c.isMuted && c.unreadCount > 0)
        .reduce((sum, c) => sum + c.unreadCount, 0),
    [conversationList],
  );
  const { dueReminderCount } = useChatReminderEntries({
    reminders,
    conversations: conversationList,
  });

  const lastPersistedPathRef = useRef<string | null>(null);
  useEffect(() => {
    const currentPath = `${pathname}${search}${hash}`;
    if (lastPersistedPathRef.current === currentPath) {
      return;
    }
    lastPersistedPathRef.current = currentPath;
    // recordAppNavigation 喂给硬件 Back 键的 canSafelyNavigateBack；
    // 原生壳（Capacitor android/ios）也要靠它判断"能不能 history.back"，
    // 不只是 mobile web。所以无条件 record，但 persistMobileWebRoute 只
    // 给 web 跑——后者是浏览器刷新场景下的路由恢复。
    recordAppNavigation(currentPath);
    if (isMobileWebRuntime(runtimeConfig.appPlatform)) {
      persistMobileWebRoute(currentPath);
    }
  }, [hash, pathname, runtimeConfig.appPlatform, search]);

  useEffect(() => {
    document.documentElement.classList.add("yj-mobile");
    document.body.classList.add("yj-mobile");

    return () => {
      document.documentElement.classList.remove("yj-mobile");
      document.body.classList.remove("yj-mobile");
    };
  }, []);

  const { keyboardInset } = useKeyboardInset();
  useEffect(() => {
    const value = keyboardInset > 0 ? `${keyboardInset}px` : "0px";
    document.documentElement.style.setProperty("--keyboard-inset", value);
    return () => {
      document.documentElement.style.removeProperty("--keyboard-inset");
    };
  }, [keyboardInset]);


  return (
    // fixed inset-0 锚定 viewport：cold start 时 Capacitor WebView 短暂会把
    // 100dvh 报为 0，h-dvh 容器 flex-col 会塌缩导致 shrink-0 的 <nav> 临时
    // 浮到顶部。锚到 viewport 后 nav 永远贴底部，不再有 1-2s 双 tab 闪烁。
    <div className="yj-mobile-shell fixed inset-0 overflow-hidden bg-[color:var(--bg-canvas)] text-[color:var(--text-primary)]">
      <MobileReminderToastHost />
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          {/*
            原 keep-alive 设计想把切走的 tab 内容留在 DOM 里做"切回即出现"，
            实现是把 children（含 <Outlet/>）缓存进 cachedTabPages 然后渲染
            多个 pane。但 Outlet 永远按当前 router context 渲染，缓存里的
            元素引用复用进新 pane 后渲染的还是当前 URL 的路由组件——结果
            就是切到 /tabs/contacts 时 /tabs/chat 那个 hidden pane 也渲染
            ContactsPage，整页出现重复的 id=contact-section-a 等，
            document.getElementById 命中的是 hidden pane 里的元素（height=0），
            字母索引点击 scrollIntoView 失效。

            keep-alive 既然真没在保存任何东西，干脆只渲染当前 active pane，
            DOM 里只剩一份元素，scrollIntoView / focus / 其它 ID 查询都正常。
            tab 间状态本来就走不到这一层（已走 React Query / zustand 存储）。
          */}
          <MobileViewportPane
            key={activeKeepAlivePath ?? "non-tab"}
            active
            safeBottom={!activeKeepAlivePath}
          >
            {children}
          </MobileViewportPane>
        </div>
        {showTabs ? (
          <nav
            className="yj-no-callout shrink-0 grid grid-cols-4 border-t border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-1.5 pt-1.5 backdrop-blur-xl"
            style={{
              paddingBottom: "max(0.375rem, var(--safe-area-inset-bottom))",
            }}
          >
            {tabs.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              const showReminderBadge =
                to === "/tabs/chat" &&
                chatUnreadCount === 0 &&
                dueReminderCount > 0;
              const badgeCount =
                to === "/tabs/chat"
                  ? chatUnreadCount > 0
                    ? chatUnreadCount
                    : dueReminderCount
                  : 0;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[12px] px-2 py-1.5 text-[11px] font-medium transition-[color,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    active
                      ? "text-[#07c160]"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                  )}
                  aria-label={t(label)}
                >
                  <div
                    className={cn(
                      "relative flex h-8 w-8 items-center justify-center rounded-[10px] transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      active ? "bg-[rgba(7,193,96,0.10)]" : "bg-transparent",
                    )}
                  >
                    <Icon size={18} />
                    {badgeCount > 0 ? (
                      <span
                        className={cn(
                          "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[11px] leading-none text-white",
                          showReminderBadge ? "bg-[#07c160]" : "bg-[#fa5151]",
                        )}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    ) : null}
                  </div>
                  <span>{t(label)}</span>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function MobileViewportPane({
  active,
  safeBottom = false,
  children,
}: PropsWithChildren<{ active: boolean; safeBottom?: boolean }>) {
  return (
    <div
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 min-h-0 overflow-y-auto overscroll-contain",
        active ? "pointer-events-auto" : "pointer-events-none hidden",
      )}
      style={{
        paddingTop: "var(--safe-area-inset-top)",
        paddingRight: "var(--safe-area-inset-right)",
        paddingBottom: safeBottom ? "var(--safe-area-inset-bottom)" : undefined,
        paddingLeft: "var(--safe-area-inset-left)",
      }}
    >
      {children}
    </div>
  );
}
