import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@yinjie/ui";

type TabPageTopBarProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  rightActions?: ReactNode;
};

export function TabPageTopBar({ className, title, rightActions, children, ...props }: TabPageTopBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 -mt-6 mb-5 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(8,12,22,0.96),rgba(8,12,22,0.84))] px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5",
        className,
      )}
      {...props}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="truncate text-xl font-semibold tracking-[0.01em] text-white">{title}</h1>
        {rightActions ? <div className="shrink-0">{rightActions}</div> : null}
      </div>
      {children}
    </div>
  );
}
