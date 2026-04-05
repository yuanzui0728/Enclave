import type { ReactNode } from "react";

type SetupScaffoldProps = {
  badge: string;
  title: string;
  description: string;
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
      <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(249,115,22,0.18),rgba(255,255,255,0.04)_46%,rgba(0,0,0,0.12)_100%)] p-6">
        <div className="text-[11px] uppercase tracking-[0.34em] text-[color:var(--brand-secondary)]">{badge}</div>
        <h1 className="mt-4 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
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
