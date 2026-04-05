import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type SnapshotPanelProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  value: Record<string, unknown> | null | undefined;
};

export function SnapshotPanel({ className, title, value, ...props }: SnapshotPanelProps) {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return (
    <div className={cn("rounded-xl border border-white/10 bg-black/20 p-3", className)} {...props}>
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-white">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
