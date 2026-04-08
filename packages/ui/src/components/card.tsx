import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}
