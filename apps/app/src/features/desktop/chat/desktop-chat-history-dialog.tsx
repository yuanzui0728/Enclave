import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { ChevronLeft, X } from "lucide-react";
import { type ConversationListItem } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { DesktopChatHistoryPanel } from "./desktop-chat-history-panel";

type DesktopChatHistoryDialogProps = {
  open: boolean;
  conversation: ConversationListItem;
  focusRequestKey: number;
  canReturnToDetails: boolean;
  onClose: () => void;
  onBackToDetails?: () => void;
  onOpenMessage: (messageId: string) => void;
  className?: string;
};

export function DesktopChatHistoryDialog({
  open,
  conversation,
  focusRequestKey,
  canReturnToDetails,
  onClose,
  onBackToDetails,
  onOpenMessage,
  className,
}: DesktopChatHistoryDialogProps) {
  const t = translateRuntimeMessage;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    // 走查 R1：和姊妹 confirm/text-edit/forward/create-group/note-send/picker
    // 一批 dialog 同款 portal-shield 缺漏。该 dialog 从「聊天信息」→「查找
    // 聊天记录」打开，inline 渲染在 workspace 根 div 下，无 shield → workspace
    // onPointerDownCapture 在 rightPanelMode=details 时点 dialog 内任意非
    // sidePanel/header/thread 节点都会偷关侧栏；用户在 dialog 内点过滤芯片 /
    // 关键词 / 消息行后，期望返回详情侧栏继续操作但发现侧栏已被关掉。
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-4 backdrop-blur-[3px] sm:p-6",
        className,
      )}
      data-yj-portal-shield="desktop-chat-history-dialog"
    >
      <button
        type="button"
        aria-label={t(msg`关闭查找聊天记录弹层`)}
        onClick={onClose}
        className="absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(msg`查找聊天记录`)}
        className="relative flex max-h-[85vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-2 bg-white px-4 py-2">
          {canReturnToDetails && onBackToDetails ? (
            <button
              type="button"
              onClick={onBackToDetails}
              aria-label={t(msg`返回聊天信息`)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
            >
              <ChevronLeft size={15} />
            </button>
          ) : null}

          <div className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--text-secondary)]">
            <span className="text-[color:var(--text-primary)]">
              {t(msg`查找聊天记录`)}
            </span>
            <span className="px-1.5 text-[color:var(--text-dim)]">·</span>
            <span className="truncate">{conversation.title || t(msg`当前聊天`)}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t(msg`关闭`)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-[#f7f7f7]">
          <DesktopChatHistoryPanel
            conversation={conversation}
            focusRequestKey={focusRequestKey}
            variant="dialog"
            onClose={onClose}
            onBackToDetails={onBackToDetails}
            onOpenMessage={onOpenMessage}
          />
        </div>
      </div>
    </div>
  );
}
