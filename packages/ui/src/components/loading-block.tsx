import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type LoadingBlockProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
};

export function LoadingBlock({ className, label = "加载中...", ...props }: LoadingBlockProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-5 py-8 text-center text-sm text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-2 w-16 rounded-full bg-[linear-gradient(90deg,rgba(249,115,22,0.2),rgba(251,191,36,0.55),rgba(249,115,22,0.2))]" />
        <div>{label}</div>
      </div>
    </div>
  );
}
