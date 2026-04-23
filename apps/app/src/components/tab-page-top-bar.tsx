import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@yinjie/ui";

type TabPageTopBarProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  titleAlign?: "left" | "center";
  titleClassName?: string;
};

export function TabPageTopBar({
  className,
  title,
  eyebrow,
  subtitle,
  leftActions,
  rightActions,
  titleAlign = "left",
  titleClassName,
  children,
  ...props
}: TabPageTopBarProps) {
  const leftActionsRef = useRef<HTMLDivElement | null>(null);
  const rightActionsRef = useRef<HTMLDivElement | null>(null);
  const [centerInset, setCenterInset] = useState(48);

  useEffect(() => {
    if (titleAlign !== "center") {
      return;
    }

    const syncCenterInset = () => {
      const leftWidth = leftActionsRef.current?.offsetWidth ?? 36;
      const rightWidth = rightActionsRef.current?.offsetWidth ?? 36;
      const nextInset = Math.max(leftWidth, rightWidth) + 12;
      setCenterInset((currentInset) =>
        currentInset === nextInset ? currentInset : nextInset,
      );
    };

    syncCenterInset();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncCenterInset);
      return () => window.removeEventListener("resize", syncCenterInset);
    }

    const observer = new ResizeObserver(syncCenterInset);

    if (leftActionsRef.current) {
      observer.observe(leftActionsRef.current);
    }

    if (rightActionsRef.current) {
      observer.observe(rightActionsRef.current);
    }

    return () => observer.disconnect();
  }, [leftActions, rightActions, titleAlign]);

  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 -mt-6 mb-4 overflow-hidden border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5",
        className,
      )}
      {...props}
    >
      <div className="relative flex min-h-11 items-center justify-between gap-3">
        {titleAlign === "center" ? (
          <div ref={leftActionsRef} className="shrink-0">
            {leftActions ? leftActions : <div className="w-9 shrink-0" aria-hidden="true" />}
          </div>
        ) : leftActions ? (
          <div className="shrink-0">{leftActions}</div>
        ) : null}
        <div
          className={cn(
            "min-w-0",
            titleAlign === "center"
              ? "pointer-events-none absolute text-center"
              : undefined,
          )}
          style={
            titleAlign === "center"
              ? {
                  left: `${centerInset}px`,
                  right: `${centerInset}px`,
                }
              : undefined
          }
        >
          {eyebrow ? <div className="truncate text-[11px] uppercase tracking-[0.26em] text-[#15803d]">{eyebrow}</div> : null}
          <h1
            className={cn(
              "truncate tracking-[0.01em] text-current",
              titleAlign === "center"
                ? "text-[17px] font-medium"
                : "text-[22px] font-semibold",
              eyebrow ? "mt-1" : undefined,
              titleClassName,
            )}
          >
            {title}
          </h1>
          {subtitle ? <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">{subtitle}</div> : null}
        </div>
        {rightActions ? (
          <div
            ref={titleAlign === "center" ? rightActionsRef : undefined}
            className={cn("shrink-0", titleAlign === "center" ? "ml-auto" : undefined)}
          >
            {rightActions}
          </div>
        ) : titleAlign === "center" ? (
          <div ref={rightActionsRef} className="w-9 shrink-0" aria-hidden="true" />
        ) : null}
      </div>
      {children}
    </div>
  );
}
