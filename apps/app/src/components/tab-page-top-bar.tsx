import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@yinjie/ui";

type TabPageTopBarProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  titleAlign?: "left" | "center";
};

export function TabPageTopBar({
  className,
  title,
  leftActions,
  rightActions,
  titleAlign = "left",
  children,
  ...props
}: TabPageTopBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 -mt-6 mb-5 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(8,12,22,0.96),rgba(8,12,22,0.84))] px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5",
        className,
      )}
      {...props}
    >
      <div className="relative flex min-h-11 items-center justify-between gap-3">
        {leftActions ? <div className="shrink-0">{leftActions}</div> : titleAlign === "center" ? <div className="w-9 shrink-0" aria-hidden="true" /> : null}
        <h1
          className={cn(
            "truncate text-xl font-semibold tracking-[0.01em] text-white",
            titleAlign === "center" ? "pointer-events-none absolute inset-x-12 text-center" : undefined,
          )}
        >
          {title}
        </h1>
        {rightActions ? (
          <div className={cn("shrink-0", titleAlign === "center" ? "ml-auto" : undefined)}>{rightActions}</div>
        ) : titleAlign === "center" ? <div className="w-9 shrink-0" aria-hidden="true" /> : null}
      </div>
      {children}
    </div>
  );
}
