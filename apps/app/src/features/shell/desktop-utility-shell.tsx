import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@yinjie/ui";

export type DesktopUtilityShellProps = PropsWithChildren<{
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
        // 之前是 `hidden ... xl:flex`（≥1280px 才出 aside），跟 Tauri 桌面壳
        // tauri.conf.json minWidth=1100 冲突——用户把窗口缩到 1100-1279 这区
        // 间 aside 整块消失，favorites 的"打开内容/打开笔记/取消收藏"按钮全
        // 部躲在 aside 里，narrow desktop 用户压根操作不了一条收藏。改成 desktop
        // layout (≥960) 内一直出，content area 在 1024 时还有 ~424px，列表
        // 依然可读，但所有操作入口都可达。
        <aside
          className={cn(
            "flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]",
            asideClassName,
          )}
        >
          {aside}
        </aside>
      ) : null}
    </div>
  );
}
