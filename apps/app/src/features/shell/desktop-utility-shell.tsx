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
              {/* 走查电脑端单聊 R142：和姊妹 R140 (独立聊天窗口) / R141
                  (独立图片查看器) 同款 —— DesktopUtilityShell 给一批桌面
                  utility 页面（chat-history-page "聊天记录" / chat-files-
                  page "聊天文件" / favorites / settings / 等）当 layout
                  shell 用，整个页面只有这一个 <header> landmark 表达 page
                  title。原版用裸 <div> 渲染 title，盲人 SR 走 heading 导航
                  找不到 <h1>，得线性扫整条 header（chip + title + subtitle
                  + toolbar）。chat 单聊路径走"聊天记录" / "聊天文件"
                  utility 页时影响最直接。改成语义 <h1>，Tailwind 样式不变；
                  subtitle 仍是辅助 <div>。和姊妹 R140/R141 一致补 page
                  title heading 语义。 */}
              <h1 className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                {title}
              </h1>
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
        // 之前是 `hidden ... xl:flex`（≥1280px 才出 aside），跟 Tauri 桌面应用
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
