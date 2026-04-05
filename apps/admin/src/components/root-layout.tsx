import { Link, Outlet } from "@tanstack/react-router";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";

export function RootLayout() {
  return (
    <div className="min-h-screen bg-transparent px-6 py-6 text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.38), transparent 88%)",
        }}
      />
      <DesktopRuntimeGuard />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-6 rounded-[30px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] px-6 py-5 shadow-[var(--shadow-overlay)]">
          <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">Yinjie Admin Runtime</div>
          <div className="mt-2 text-3xl font-semibold">Local Control Plane</div>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--text-secondary)]">
            The browser-based admin remains separate from the main social UI and is now being rebuilt on top of shared
            contracts and the new local Rust runtime.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              to="/"
              className="rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-white"
              activeProps={{ className: "rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] px-4 py-2 text-white" }}
            >
              Dashboard
            </Link>
            <Link
              to="/characters"
              className="rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-white"
              activeProps={{ className: "rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] px-4 py-2 text-white" }}
            >
              Characters
            </Link>
            <Link
              to="/setup"
              className="rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-white"
              activeProps={{ className: "rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] px-4 py-2 text-white" }}
            >
              Setup
            </Link>
            <Link
              to="/evals"
              className="rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-white"
              activeProps={{ className: "rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] px-4 py-2 text-white" }}
            >
              Evals
            </Link>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
