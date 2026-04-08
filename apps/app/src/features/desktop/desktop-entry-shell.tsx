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
      <section className="flex min-h-[720px] flex-col justify-between rounded-[32px] border border-[color:var(--border-faint)] bg-[linear-gradient(155deg,rgba(249,115,22,0.08),#ffffff_60%)] p-8 shadow-[var(--shadow-section)]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.34em] text-[color:var(--brand-secondary)]">{badge}</div>
          <h1 className="mt-5 max-w-[12ch] text-5xl font-semibold leading-tight tracking-[0.03em] text-[color:var(--text-primary)]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-200/88">{description}</p>
        </div>

        {aside ? aside : null}
      </section>

      <section className="flex min-h-[720px] flex-col justify-center rounded-[32px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(8,12,20,0.92),rgba(11,18,28,0.9))] p-6 shadow-[var(--shadow-section)]">
        {children}
      </section>
    </div>
  );
}
