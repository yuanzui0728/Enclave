import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function AppSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] p-5 shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}
