import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function AppSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]",
        className,
      )}
      {...props}
    />
  );
}
