import {
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
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
import { isMobileWebRuntime } from "../runtime/platform";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const EMPTY_CONVERSATIONS = Object.freeze([]);

const tabs = [
  { to: "/tabs/chat", label: "消息", icon: MessageCircleMore },
  { to: "/tabs/contacts", label: "通讯录", icon: UsersRound },
  { to: "/tabs/discover", label: "发现", icon: Compass },
  { to: "/tabs/profile", label: "我", icon: UserRound },
];
const KEEP_ALIVE_TAB_PATHS = new Set(tabs.map((tab) => tab.to));

export function MobileShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const showTabs = pathname.startsWith("/tabs/") && pathname !== "/tabs/search";
  const activeKeepAlivePath = KEEP_ALIVE_TAB_PATHS.has(pathname)
    ? pathname
    : null;
  const runtimeConfig = useAppRuntimeConfig();
  const { reminders } = useMessageReminders();
  const [cachedTabPages, setCachedTabPages] = useState<
    Partial<Record<(typeof tabs)[number]["to"], ReactNode>>
  >({});

  const { data: conversations } = useQuery({
    queryKey: ["app-conversations", runtimeConfig.apiBaseUrl],
    queryFn: () => getConversations(runtimeConfig.apiBaseUrl),
    enabled: showTabs,
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

  useEffect(() => {
    if (!isMobileWebRuntime(runtimeConfig.appPlatform)) {
      return;
    }

    persistMobileWebRoute(`${pathname}${search}${hash}`);
  }, [hash, pathname, runtimeConfig.appPlatform, search]);

  useEffect(() => {
    document.documentElement.classList.add("yj-mobile");
    document.body.classList.add("yj-mobile");

    return () => {
      document.documentElement.classList.remove("yj-mobile");
      document.body.classList.remove("yj-mobile");
    };
  }, []);

  useEffect(() => {
    if (!activeKeepAlivePath) {
      return;
    }

    setCachedTabPages((current) => {
      if (current[activeKeepAlivePath]) {
        return current;
      }

      return {
        ...current,
        [activeKeepAlivePath]: children,
      };
    });
  }, [activeKeepAlivePath, children]);

  return (
    <div className="yj-mobile-shell relative h-dvh min-h-dvh overflow-hidden bg-[color:var(--bg-canvas)] text-[color:var(--text-primary)]">
      <MobileReminderToastHost />
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          {tabs.map(({ to }) => {
            const page = activeKeepAlivePath === to
              ? cachedTabPages[to] ?? children
              : cachedTabPages[to];
            if (!page) {
              return null;
            }

            const active = activeKeepAlivePath === to;

            return (
              <MobileViewportPane key={to} active={active}>
                {page}
              </MobileViewportPane>
            );
          })}
          {activeKeepAlivePath ? null : (
            <MobileViewportPane active safeBottom>{children}</MobileViewportPane>
          )}
        </div>
        {showTabs ? (
          <nav
            className="shrink-0 grid grid-cols-4 border-t border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-1.5 pt-1.5 backdrop-blur-xl"
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
                          "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] leading-none text-white",
                          showReminderBadge ? "bg-[#07c160]" : "bg-[#fa5151]",
                        )}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    ) : null}
                  </div>
                  <span>{label}</span>
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
