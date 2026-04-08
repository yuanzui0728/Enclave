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
        "relative flex flex-col gap-5 overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border-faint)] bg-[linear-gradient(135deg,rgba(249,115,22,0.08),#ffffff_60%)] p-6 shadow-[var(--shadow-section)] sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="relative min-w-0">
        {eyebrow ? (
          <div className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--brand-secondary)]">{eyebrow}</div>
        ) : null}
        <h1 className="mt-3 text-[1.9rem] font-semibold leading-tight text-[color:var(--text-primary)]">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="relative shrink-0 self-start">{actions}</div> : null}
    </header>
  );
}
