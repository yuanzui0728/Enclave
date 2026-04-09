import type { PropsWithChildren } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, MessageCircleMore, UserRound, UsersRound } from "lucide-react";
import { cn } from "@yinjie/ui";

const tabs = [
  { to: "/tabs/chat", label: "消息", icon: MessageCircleMore },
  { to: "/tabs/contacts", label: "通讯录", icon: UsersRound },
  { to: "/tabs/discover", label: "发现", icon: Compass },
  { to: "/tabs/profile", label: "我", icon: UserRound },
];

export function MobileShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showTabs = pathname.startsWith("/tabs/");

  return (
    <div className="h-dvh min-h-dvh overflow-hidden bg-[color:var(--bg-canvas)] text-[color:var(--text-primary)]">
      <div
        className="relative mx-auto flex h-full min-h-0 w-full max-w-[460px] flex-col px-3 sm:px-4"
        style={{
          paddingTop: "max(1rem, var(--safe-area-inset-top))",
          paddingRight: "calc(0.75rem + var(--safe-area-inset-right))",
          paddingBottom: "max(1rem, var(--safe-area-inset-bottom))",
          paddingLeft: "calc(0.75rem + var(--safe-area-inset-left))",
        }}
      >
        <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[38px] border border-[color:var(--border-faint)] bg-[color:var(--surface-section)] shadow-[var(--shadow-shell)]">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {showTabs ? (
            <nav
              className="shrink-0 grid grid-cols-4 border-t border-[color:var(--border-faint)] bg-white px-2 pt-2"
              style={{ paddingBottom: "max(0.5rem, var(--safe-area-inset-bottom))" }}
            >
              {tabs.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[11px] transition-[color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      active
                        ? "text-[color:var(--brand-primary)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
                    )}
                  >
                    <Icon size={17} />
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
