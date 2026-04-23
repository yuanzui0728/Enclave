import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type SnapshotPanelProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  value: Record<string, unknown> | null | undefined;
};

export function SnapshotPanel({ className, title, value, ...props }: SnapshotPanelProps) {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return (
    <div className={cn("rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-3", className)} {...props}>
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[color:var(--text-secondary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
