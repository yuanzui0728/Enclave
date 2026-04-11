import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@yinjie/ui";

type DesktopUtilityShellProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  toolbar?: ReactNode;
  sidebar?: ReactNode;
  aside?: ReactNode;
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;
  asideClassName?: string;
}>;

export function DesktopUtilityShell({
  aside,
  asideClassName,
  children,
  className,
  contentClassName,
  sidebar,
  sidebarClassName,
  subtitle,
  title,
  toolbar,
}: DesktopUtilityShellProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 bg-[color:var(--bg-canvas)]",
        className,
      )}
    >
      {sidebar ? (
        <aside
          className={cn(
            "flex w-[280px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]",
            sidebarClassName,
          )}
        >
          {sidebar}
        </aside>
      ) : null}

      <section className="min-w-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.74)] px-5 backdrop-blur-xl">
            <div className="min-w-0">
              <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                  {subtitle}
                </div>
              ) : null}
            </div>

            {toolbar ? (
              <div className="flex shrink-0 items-center gap-2">{toolbar}</div>
            ) : null}
          </header>

          <div
            className={cn(
              "min-h-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.60)]",
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
      </section>

      {aside ? (
        <aside
          className={cn(
            "hidden w-[320px] shrink-0 border-l border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] xl:flex xl:flex-col",
            asideClassName,
          )}
        >
          {aside}
        </aside>
      ) : null}
    </div>
  );
}
