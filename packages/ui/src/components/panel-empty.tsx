import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type PanelEmptyProps = HTMLAttributes<HTMLDivElement> & {
  message: ReactNode;
};

export function PanelEmpty({ className, message, ...props }: PanelEmptyProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-6 text-sm text-[color:var(--text-secondary)]",
        className,
      )}
      {...props}
    >
      {message}
    </div>
  );
}
