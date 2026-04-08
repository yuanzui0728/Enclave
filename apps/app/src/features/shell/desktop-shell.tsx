import type { PropsWithChildren } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BellDot, Compass, MessageCircleMore, UserRound, UsersRound } from "lucide-react";
import { cn } from "@yinjie/ui";

const navItems = [
  { to: "/tabs/chat", label: "消息", icon: MessageCircleMore, shortLabel: "聊" },
  { to: "/tabs/contacts", label: "通讯录", icon: UsersRound, shortLabel: "录" },
  { to: "/tabs/moments", label: "朋友圈", icon: BellDot, shortLabel: "圈" },
  { to: "/tabs/discover", label: "发现", icon: Compass, shortLabel: "探" },
  { to: "/tabs/profile", label: "我", icon: UserRound, shortLabel: "我" },
];

function isActive(pathname: string, to: string) {
  if (to === "/tabs/chat") {
    return pathname.startsWith("/tabs/chat") || pathname.startsWith("/chat/");
  }

  if (to === "/tabs/contacts") {
    return pathname.startsWith("/tabs/contacts") || pathname.startsWith("/character/") || pathname.startsWith("/friend-requests") || pathname.startsWith("/group/");
  }

  return pathname.startsWith(to);
}

export function DesktopShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-screen overflow-hidden bg-[#070c14] text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.75), transparent 92%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-10%] top-[-15%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.18),transparent_68%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-[-18%] right-[-8%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.12),transparent_70%)] blur-3xl"
      />

      <div className="relative flex min-h-screen gap-4 px-5 py-5 xl:px-6">
        <aside className="hidden w-[92px] shrink-0 rounded-[30px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(6,11,18,0.92),rgba(9,16,27,0.88))] p-3 shadow-[var(--shadow-shell)] lg:flex lg:flex-col">
          <div className="flex h-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,rgba(249,115,22,0.18),rgba(255,255,255,0.06))] text-center">
            <div>
              <div className="text-[10px] uppercase tracking-[0.36em] text-[color:var(--brand-secondary)]">YJ</div>
              <div className="mt-2 text-xs font-medium text-white">隐界</div>
            </div>
          </div>

          <nav className="mt-4 flex flex-1 flex-col gap-2">
            {navItems.map(({ to, label, icon: Icon, shortLabel }) => {
              const active = isActive(pathname, to);

              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-[22px] px-3 py-3 text-[11px] transition-[background-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    active
                      ? "bg-[linear-gradient(135deg,rgba(249,115,22,0.22),rgba(255,255,255,0.09))] text-white shadow-[var(--shadow-soft)]"
                      : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)] hover:text-white",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-[18px] border transition-colors",
                      active
                        ? "border-white/12 bg-white/8"
                        : "border-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] group-hover:border-white/8 group-hover:bg-white/5",
                    )}
                  >
                    <Icon size={18} />
                  </div>
                  <span className="hidden xl:block">{label}</span>
                  <span className="xl:hidden">{shortLabel}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden rounded-[34px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(9,14,23,0.92),rgba(12,20,32,0.88))] shadow-[var(--shadow-shell)]">
          {children}
        </main>
      </div>
    </div>
  );
}
