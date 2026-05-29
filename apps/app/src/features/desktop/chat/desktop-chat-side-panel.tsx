import { useId, type ReactNode, type Ref } from "react";
import { msg } from "@lingui/macro";
import { ChevronLeft, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import type { DesktopChatSidePanelMode } from "./desktop-chat-header-actions";

type DesktopChatSidePanelProps = {
  mode: Exclude<DesktopChatSidePanelMode, null>;
  title: ReactNode;
  subtitle?: ReactNode;
  detailsVariant?: "default" | "wechat";
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  panelRef?: Ref<HTMLElement>;
};

export function DesktopChatSidePanel({
  mode,
  title,
  subtitle,
  detailsVariant = "default",
  onBack,
  onClose,
  children,
  className,
  panelRef,
}: DesktopChatSidePanelProps) {
  const t = translateRuntimeMessage;
  const historyMode = mode === "history";
  const wechatDetails = !historyMode && detailsVariant === "wechat";
  // 走查电脑端单聊 R80：<aside> 是单聊右侧「聊天信息 / 查找聊天记录」面板的
  // 唯一 landmark，<aside> 嵌在 workspace 的 <section> 子树里——按 HTML5 /
  // WAI-ARIA 嵌套规则，sectioning content 里的 aside 没有 implicit
  // complementary 角色，且本组件没挂 aria-label/aria-labelledby，盲人屏幕
  // 阅读器走 landmark 时直接跳过这块。即使浏览器给了 implicit role，没
  // accessible name 也只听到「complementary」浮空。和姊妹 chat-header-actions
  // R6 / R63、conversation-context-menu R6 / R62 系列 a11y 修法一致——把
  // 「title」节点 useId 接上，aside 用 aria-labelledby 引向它；history /
  // details (default / wechat) 三个 branch 的 title 子节点都共用同一个 id，
  // SR 走 landmark 时朗读"complementary — <title>"，比裸 complementary 多
  // 出"聊天信息" / "聊天记录"上下文。
  const sidePanelTitleId = useId();

  return (
    <aside
      ref={panelRef}
      aria-labelledby={sidePanelTitleId}
      className={cn(
        "absolute bottom-0 right-0 top-[64px] z-30 hidden w-[352px] border-l border-[rgba(0,0,0,0.06)] transition-[background-color] duration-150 xl:flex xl:flex-col",
        historyMode
          ? "bg-[color:var(--surface-card)]"
          : wechatDetails
            ? "bg-[color:var(--surface-soft)]"
            : "bg-[color:var(--surface-card)]",
        className,
      )}
      data-mode={mode}
    >
      <div
        className={cn(
          "border-b border-[rgba(0,0,0,0.06)] transition-[background-color,padding] duration-150",
          historyMode
            ? "bg-white px-4 pb-2 pt-3"
            : wechatDetails
              ? "bg-white px-4 py-3"
              : "bg-[color:var(--surface-card)] px-4 py-3",
        )}
      >
        {historyMode ? (
          <>
            <div className="grid grid-cols-[28px,1fr,28px] items-center gap-2">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
                  aria-label={t(msg`返回聊天信息`)}
                >
                  <ChevronLeft size={15} />
                </button>
              ) : (
                <div aria-hidden="true" className="h-7 w-7" />
              )}
              <div
                id={sidePanelTitleId}
                className="truncate text-center text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]"
              >
                {title}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
                aria-label={t(msg`关闭侧栏`)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="mt-1 truncate px-8 text-center text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              {subtitle ?? t(msg`聊天记录`)}
            </div>
          </>
        ) : wechatDetails ? (
          <div className="grid grid-cols-[28px,1fr,28px] items-center gap-2">
            <div aria-hidden="true" className="h-7 w-7" />
            <div
              id={sidePanelTitleId}
              className="truncate text-center text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]"
            >
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
              aria-label={t(msg`关闭侧栏`)}
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                id={sidePanelTitleId}
                className="truncate text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]"
              >
                {title}
              </div>
              <div className="mt-1 truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                {subtitle ?? t(msg`聊天信息`)}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-transparent text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
              aria-label={t(msg`关闭侧栏`)}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto transition-[background-color] duration-150",
          historyMode
            ? "bg-[color:var(--surface-card)]"
            : wechatDetails
              ? "bg-[color:var(--surface-soft)]"
              : "bg-[color:var(--surface-card)]",
        )}
      >
        {children}
      </div>
    </aside>
  );
}

export function DesktopChatSidePanelPlaceholder({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  const t = translateRuntimeMessage;

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1 text-[length:var(--text-eyebrow)] tracking-[0.12em] text-[color:var(--text-dim)] shadow-[var(--shadow-soft)]">
        {t(msg`侧栏面板`)}
      </div>
      <div className="mt-4 text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        {description}
      </div>
    </div>
  );
}
