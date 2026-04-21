import type { ReactNode } from "react";

type AdminSessionSummaryChipProps = {
  children: ReactNode;
  className?: string;
};

export function AdminSessionSummaryChip({
  children,
  className,
}: AdminSessionSummaryChipProps) {
  return (
    <div
      className={`rounded-full border border-[color:var(--border-faint)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
