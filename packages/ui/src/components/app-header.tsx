import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type AppHeaderProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function AppHeader({ className, eyebrow, title, description, actions, ...props }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "relative flex flex-col gap-5 overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border-faint)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_42%,rgba(237,250,244,0.95))] p-6 shadow-[var(--shadow-section)] sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 top-0 h-40 w-40 rounded-full bg-[rgba(255,195,113,0.2)] blur-3xl" />
        <div className="absolute -left-14 bottom-0 h-36 w-36 rounded-full bg-[rgba(74,222,128,0.16)] blur-3xl" />
      </div>
      <div className="relative min-w-0">
        {eyebrow ? (
          <div className="inline-flex rounded-full border border-[rgba(255,179,71,0.24)] bg-[rgba(255,255,255,0.74)] px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-[color:var(--brand-secondary)]">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-4 text-[1.95rem] font-semibold leading-tight text-[color:var(--text-primary)]">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="relative shrink-0 self-start">{actions}</div> : null}
    </header>
  );
}
