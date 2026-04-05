import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type ListItemCardProps = HTMLAttributes<HTMLDivElement> & {
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
        "rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-secondary)]",
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white">{title}</div>
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
