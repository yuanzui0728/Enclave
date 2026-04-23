import type { ReactNode } from "react";

type SetupScaffoldProps = {
  badge: ReactNode;
  title: ReactNode;
  description: ReactNode;
  heroAside?: ReactNode;
  left: ReactNode;
  right?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function SetupScaffold({
  badge,
  title,
  description,
  heroAside,
  left,
  right,
  footer,
  className,
}: SetupScaffoldProps) {
  return (
    <div className={className ?? "space-y-5 px-4 py-5"}>
      <section className="relative overflow-hidden rounded-[32px] border border-[color:var(--border-faint)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_42%,rgba(237,250,244,0.95))] p-6 shadow-[var(--shadow-section)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-[rgba(255,179,71,0.18)] blur-3xl" />
          <div className="absolute left-0 top-10 h-28 w-28 rounded-full bg-[rgba(96,165,250,0.12)] blur-3xl" />
        </div>
        <div className="relative inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-white/76 px-3 py-1 text-[11px] uppercase tracking-[0.34em] text-[color:var(--brand-secondary)]">
          {badge}
        </div>
        <h1 className="relative mt-4 text-3xl font-semibold text-[color:var(--text-primary)]">{title}</h1>
        <p className="relative mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
        {heroAside ? <div className="mt-5">{heroAside}</div> : null}
      </section>

      {right ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            {left}
            {footer}
          </div>
          <div className="space-y-5">{right}</div>
        </div>
      ) : (
        <>
          {left}
          {footer}
        </>
      )}
    </div>
  );
}
