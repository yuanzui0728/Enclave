import type { PropsWithChildren } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Box, Settings2 } from "lucide-react";
import { cn } from "@yinjie/ui";

const links = [
  { to: "/", label: "Runtime", icon: Box },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-screen bg-transparent text-[color:var(--text-primary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1380px] gap-6 px-5 py-6">
        <aside className="hidden w-80 shrink-0 flex-col rounded-[32px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] p-6 shadow-[var(--shadow-card)] lg:flex">
          <div className="mb-8">
            <div className="text-xs uppercase tracking-[0.36em] text-[color:var(--text-muted)]">Yinjie Runtime</div>
            <div className="mt-4 text-3xl font-semibold tracking-[0.18em]">Hidden World</div>
            <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
              Production refactor workspace for the self-hosted single-user AI world. Legacy behavior stays frozen
              while desktop runtime, typed contracts, and the new local control plane are rebuilt here.
            </p>
          </div>

          <nav className="space-y-2">
            {links.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-[color:var(--text-secondary)] hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Migration Slice</div>
            <div className="mt-3 text-lg font-semibold">Config / Auth / Characters / World</div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
              The runtime now exposes the first compatibility routes plus world context visibility, while scheduler
              parity is being staged through a dedicated system surface.
            </p>
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-3rem)] w-full flex-1 flex-col rounded-[32px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] p-4 shadow-[var(--shadow-card)] sm:p-6">
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4 lg:hidden">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">Yinjie</div>
              <div className="text-2xl font-semibold tracking-[0.18em]">Hidden World</div>
            </div>
            <div className="flex gap-2">
              {links.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs",
                      active ? "bg-white/10 text-white" : "bg-white/5 text-[color:var(--text-secondary)]",
                    )}
                  >
                    <Icon size={14} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
