import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type MetricCardProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: string | number;
  detail?: string;
  meta?: ReactNode;
};

export function MetricCard({ className, label, value, detail, meta, ...props }: MetricCardProps) {
  return (
    <div
      className={cn("rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">{label}</div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">{value}</div>
      {detail ? <div className="mt-3 text-sm text-[color:var(--text-secondary)]">{detail}</div> : null}
    </div>
  );
}
