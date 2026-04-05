import type { PropsWithChildren } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BellDot, Compass, MessageCircleMore, UsersRound, UserRound } from "lucide-react";
import { cn } from "@yinjie/ui";

const tabs = [
  { to: "/tabs/chat", label: "消息", icon: MessageCircleMore },
  { to: "/tabs/moments", label: "朋友圈", icon: BellDot },
  { to: "/tabs/discover", label: "发现", icon: Compass },
  { to: "/tabs/contacts", label: "通讯录", icon: UsersRound },
  { to: "/tabs/profile", label: "我", icon: UserRound },
];

export function MobileShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showTabs = pathname.startsWith("/tabs/");

  return (
    <div className="min-h-screen overflow-hidden bg-transparent text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.45), transparent 85%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_62%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[460px] flex-col px-3 py-4 sm:px-4">
        <div className="mb-3 flex items-center justify-between rounded-[30px] border border-[color:var(--border-subtle)] bg-[rgba(7,12,20,0.55)] px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-[color:var(--text-muted)]">隐界</div>
            <div className="mt-1 text-xl font-semibold tracking-[0.18em] text-white">Hidden World</div>
          </div>
          <Link
            to="/friend-requests"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-white"
          >
            <BellDot size={18} />
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[36px] border border-[color:var(--border-subtle)] bg-[linear-gradient(180deg,rgba(10,14,24,0.95),rgba(13,22,35,0.82))] shadow-[var(--shadow-overlay)]">
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          {showTabs ? (
            <nav className="grid grid-cols-5 border-t border-[color:var(--border-subtle)] bg-[rgba(7,12,20,0.72)] px-2 py-2 backdrop-blur-xl">
              {tabs.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-[20px] px-2 py-2 text-[11px] transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      active
                        ? "bg-[color:var(--surface-tertiary)] text-white"
                        : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-secondary)] hover:text-white",
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
