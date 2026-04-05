import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type LoadingBlockProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
};

export function LoadingBlock({ className, label = "加载中...", ...props }: LoadingBlockProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-5 py-8 text-center text-sm text-[color:var(--text-secondary)]",
        className,
      )}
      {...props}
    >
      {label}
    </div>
  );
}
