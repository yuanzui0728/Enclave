import { useEffect, useRef } from "react";
import { msg } from "@lingui/macro";
import { ChevronLeft, X } from "lucide-react";
import { type ConversationListItem } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { getConversationDisplayTitle } from "../../../lib/conversation-preview";
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

  // R11：和姊妹 desktop-chat-confirm-dialog / desktop-chat-text-edit-dialog
  // R11 / 移动端 R3 (c422bc945) 同款 —— workspace 用 inline arrow `onClose=
  // {() => setRightPanelMode(null)}` 传进来，每次 workspace 重渲染（60s 轮询
  // / search 输入 / socket / reminders tick）都换 ref → effect 拆 + 装
  // window keydown 一次。本 dialog 是「查找聊天记录」，展开期间用户在 panel
  // 内打字搜索，workspace conversationsQuery 还在 background refetch，每个字
  // 都触发一次无效拆装。ref 镜像 onClose，deps 收紧到 [open]。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      // 走查 R151：内嵌的 DesktopChatHistoryPanel R148 已挂 isComposing 守
      // 卫 + capture phase。但 panel 在 capture 早返时不 preventDefault →
      // defaultPrevented=false → 本 dialog 的 bubble handler 接着跑 → 关
      // 弹层。CJK 用户在面板搜索框拼"张 zhang"还在候选词阶段按 Esc 想退候
      // 选 → dialog 直接关掉，IME 候选词被吞、整段聊天记录搜索流程被打断。
      // dialog 这层也补 isComposing 早返。
      if (event.isComposing) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

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
        // 走查电脑端单聊 R108：和姊妹 R107 DesktopChatConfirmDialog 同款 ——
        // backdrop button (absolute inset-0) 视觉不可见、纯 mouse "点击背景关闭"
        // affordance，但 DOM 顺序排在 dialog 子树第一位，键盘用户从「聊天信息」
        // 侧栏 / chat header 「查找聊天记录」按钮打开 dialog 后按 Tab，焦点
        // 先落到这张不可见 backdrop → 看不到 focus ring → 再按 Enter 把弹层
        // 秒关。Esc keydown 已挂 (line 41-60)，键盘用户走 Esc 关弹层即可。
        tabIndex={-1}
        className="absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(msg`查找聊天记录`)}
        className="relative flex max-h-[85vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-2 bg-[color:var(--surface-card)] px-4 py-2">
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

          <div className="min-w-0 flex-1 truncate text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">
            <span className="text-[color:var(--text-primary)]">
              {t(msg`查找聊天记录`)}
            </span>
            <span className="px-1.5 text-[color:var(--text-dim)]">·</span>
            <span className="truncate">
              {getConversationDisplayTitle(conversation.title) ||
                t(msg`当前聊天`)}
            </span>
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

        <div className="min-h-0 flex-1 overflow-hidden bg-[color:var(--surface-card)]">
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
