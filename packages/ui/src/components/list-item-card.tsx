import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type ListItemCardProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
};

export function ListItemCard({
  className,
  title,
  subtitle,
  meta,
  body,
  footer,
  actions,
  ...props
}: ListItemCardProps) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)] hover:shadow-[var(--shadow-lift)]",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[color:var(--text-primary)]">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="mt-3">{meta}</div> : null}
      {body ? <div className="mt-3">{body}</div> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
