import type { ReactNode } from "react";

type AdminShellProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
};

export function AdminShell({ sidebar, topbar, children }: AdminShellProps) {
  return (
    <div className="relative min-h-screen bg-transparent text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.42), transparent 88%)",
        }}
      />
      <div className="relative min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden">{sidebar}</div>
        <div className="min-w-0">
          <div className="sticky top-0 z-20 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">{topbar}</div>
          <div className="px-4 pb-6 pt-4 sm:px-6 lg:px-8 lg:pb-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
