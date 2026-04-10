import { useMemo, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { Compass, ImageIcon, MessageCircleMore, UserRound, UsersRound } from "lucide-react";
import { cn } from "@yinjie/ui";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const tabs = [
  { to: "/tabs/chat", label: "消息", icon: MessageCircleMore },
  { to: "/tabs/contacts", label: "通讯录", icon: UsersRound },
  { to: "/tabs/moments", label: "朋友圈", icon: ImageIcon },
  { to: "/tabs/discover", label: "发现", icon: Compass },
  { to: "/tabs/profile", label: "我", icon: UserRound },
];

export function MobileShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showTabs = pathname.startsWith("/tabs/");
  const runtimeConfig = useAppRuntimeConfig();

  const { data: conversations } = useQuery({
    queryKey: ["app-conversations", runtimeConfig.apiBaseUrl],
    queryFn: () => getConversations(runtimeConfig.apiBaseUrl),
    enabled: showTabs,
  });

  const chatUnreadCount = useMemo(
    () =>
      (conversations ?? [])
        .filter((c) => !c.isMuted && c.unreadCount > 0)
        .reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations],
  );

  return (
    <div className="relative h-dvh min-h-dvh overflow-hidden bg-[color:var(--bg-canvas)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-10 -top-6 h-56 w-56 rounded-full bg-[rgba(251,191,36,0.20)] blur-3xl" />
        <div className="absolute -right-8 top-20 h-44 w-44 rounded-full bg-[rgba(249,115,22,0.14)] blur-3xl" />
        <div className="absolute bottom-10 left-1/4 h-40 w-40 rounded-full bg-[rgba(16,185,129,0.09)] blur-3xl" />
      </div>
      <div
        className="relative mx-auto flex h-full min-h-0 w-full max-w-[460px] flex-col px-3 sm:px-4"
        style={{
          paddingTop: "max(1rem, var(--safe-area-inset-top))",
          paddingRight: "calc(0.75rem + var(--safe-area-inset-right))",
          paddingBottom: "max(1rem, var(--safe-area-inset-bottom))",
          paddingLeft: "calc(0.75rem + var(--safe-area-inset-left))",
        }}
      >
        <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[40px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,253,248,0.92),rgba(255,250,240,0.90))] shadow-[var(--shadow-shell)] backdrop-blur-[22px]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {showTabs ? (
            <nav
              className="shrink-0 grid grid-cols-5 border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,254,250,0.90),rgba(255,249,238,0.96))] px-2 pt-2 backdrop-blur-xl"
              style={{ paddingBottom: "max(0.5rem, var(--safe-area-inset-bottom))" }}
            >
              {tabs.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                const badgeCount = to === "/tabs/chat" ? chatUnreadCount : 0;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-[22px] px-2 py-2.5 text-[11px] transition-[color,background-color,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      active
                        ? "bg-white/85 text-[color:var(--brand-primary)] shadow-[var(--shadow-soft)]"
                        : "text-[color:var(--text-muted)] hover:bg-white/60 hover:text-[color:var(--text-secondary)]",
                    )}
                  >
                    <div
                      className={cn(
                        "relative flex h-9 w-9 items-center justify-center rounded-[16px] transition-[background-color,color,filter] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                        active ? "bg-[rgba(249,115,22,0.14)] [filter:drop-shadow(0_0_5px_rgba(249,115,22,0.40))]" : "bg-transparent",
                      )}
                    >
                      <Icon size={17} />
                      {badgeCount > 0 ? (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] leading-none text-white">
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
    </div>
  );
}
