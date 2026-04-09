import type { PropsWithChildren, ReactNode } from "react";

type DesktopEntryShellProps = PropsWithChildren<{
  badge: string;
  title: string;
  description: string;
  aside?: ReactNode;
}>;

export function DesktopEntryShell({
  aside,
  badge,
  children,
  description,
  title,
}: DesktopEntryShellProps) {
  return (
    <div className="grid min-h-full gap-6 p-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="relative flex min-h-[720px] flex-col justify-between overflow-hidden rounded-[32px] border border-[color:var(--border-faint)] bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_40%,rgba(239,251,245,0.95))] p-8 shadow-[var(--shadow-section)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 top-0 h-48 w-48 rounded-full bg-[rgba(255,179,71,0.16)] blur-3xl" />
          <div className="absolute left-0 top-20 h-40 w-40 rounded-full bg-[rgba(96,165,250,0.12)] blur-3xl" />
          <div className="absolute bottom-0 right-16 h-44 w-44 rounded-full bg-[rgba(74,222,128,0.12)] blur-3xl" />
        </div>
        <div className="relative">
          <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/76 px-3 py-1 text-[11px] uppercase tracking-[0.34em] text-[color:var(--brand-secondary)]">{badge}</div>
          <h1 className="mt-5 max-w-[12ch] text-5xl font-semibold leading-tight tracking-[0.03em] text-[color:var(--text-primary)]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-[color:var(--text-secondary)]">{description}</p>
        </div>

        {aside ? aside : null}
      </section>

      <section className="flex min-h-[720px] flex-col justify-center rounded-[32px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,252,249,0.96))] p-6 shadow-[var(--shadow-section)]">
        {children}
      </section>
    </div>
  );
}
