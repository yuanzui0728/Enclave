import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type AppHeaderProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function AppHeader({ className, eyebrow, title, description, actions, ...props }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[linear-gradient(135deg,rgba(249,115,22,0.16),rgba(255,255,255,0.04)_44%,rgba(15,23,42,0.26)_100%)] p-5 shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--brand-secondary)]">{eyebrow}</div>
        ) : null}
        <h1 className="mt-3 text-2xl font-semibold text-white">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
