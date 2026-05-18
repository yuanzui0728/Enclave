import { useEffect, useId } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const t = translateRuntimeMessage;

type MobileMessageActionSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  preview?: {
    senderName?: string;
    text: string;
    own?: boolean;
  };
  onReply?: () => void;
  onQuoteSelection?: () => void;
  quoteSelectionLabel?: string;
  onForward?: () => void;
  onMultiSelect?: () => void;
  onSelectToHere?: () => void;
  selectToHereLabel?: string;
  onSetReminder?: () => void;
  reminderLabel?: string;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  onCopy: () => void;
  onCopySender?: () => void;
  onSpeakAloud?: () => void;
  speakAloudLabel?: string;
  onOpenAttachment?: () => void;
  openAttachmentLabel?: string;
  onSaveAttachment?: () => void;
  saveAttachmentLabel?: string;
  onRecall?: () => void;
  recallLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
};

export function MobileMessageActionSheet({
  open,
  onClose,
  title = t(msg`消息操作`),
  preview,
  onReply,
  onQuoteSelection,
  quoteSelectionLabel = t(msg`部分引用`),
  onForward,
  onMultiSelect,
  onSelectToHere,
  selectToHereLabel = t(msg`选择到这里`),
  onSetReminder,
  reminderLabel = t(msg`提醒`),
  onToggleFavorite,
  favoriteLabel = t(msg`收藏`),
  onCopy,
  onCopySender,
  onSpeakAloud,
  speakAloudLabel = t(msg`朗读`),
  onOpenAttachment,
  openAttachmentLabel = t(msg`打开附件`),
  onSaveAttachment,
  saveAttachmentLabel = t(msg`保存附件`),
  onRecall,
  recallLabel = t(msg`撤回`),
  onDelete,
  deleteLabel = t(msg`删除`),
}: MobileMessageActionSheetProps) {
  const titleId = useId();
  // 原生壳硬件 Back 键打开时优先关 sheet，不让 BACK 同时 history.back 把
  // 用户从聊天页带回 chat list。
  useEffect(() => {
    if (!open) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [open, onClose]);

  // 走查 R2：和姊妹 sheet mobile-message-reminder-sheet / message-quote-
  // selection-sheet / mobile-details-action-sheet 对齐——长按消息冒出来的
  // 这个 sheet 没挂 ESC keydown。桌面 web / 外接键盘 / 模拟器都拍不掉，
  // 只能点 backdrop。a11y / 键盘用户体验缺一刀。和姊妹文件相同写法：
  // open 才挂监听，defaultPrevented 时让位（dialog 内嵌套的子模态有自己
  // 的 ESC 语义不被偷掉）。
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
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t(msg`关闭消息操作菜单`)}
        onClick={onClose}
      />
      {/* 走查新一轮 R2：长按群消息冒出来的这个底部操作 sheet 没挂 role="dialog"
          + aria-modal + aria-labelledby——和 mobile-details-action-sheet R(re)1
          修过的同款 a11y 问题。屏幕阅读器（iOS VoiceOver / Android TalkBack）
          不会把它当 modal 念，盲人用户长按群消息后只听到"按钮 取消"，听不到
          "消息操作 / 回复 / 转发 / 撤回 / 删除" 这些 action 标题。补 dialog 语义。*/}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]"
      >
        <div className="flex justify-center pb-1.5">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div
          id={titleId}
          className="pb-2.5 text-center text-[12px] text-[#8c8c8c]"
        >
          {title}
        </div>
        {preview ? (
          <div className="mb-2.5 overflow-hidden rounded-[14px] border border-[color:var(--border-subtle)] bg-white px-3 py-2.5">
            {preview.senderName ? (
              <div className="pb-1 text-[10px] text-[#8c8c8c]">
                {preview.senderName}
              </div>
            ) : null}
            <div
              className={`flex ${preview.own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-[15px] px-3 py-2 text-[13px] leading-5 ${
                  preview.own
                    ? "bg-[rgba(7,193,96,0.16)] text-[#111827]"
                    : "border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] text-[#111827]"
                }`}
              >
                <div className="line-clamp-3 whitespace-pre-wrap break-words">
                  {preview.text}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
          {onReply ? <ActionButton label={t(msg`回复`)} onClick={onReply} /> : null}
          {onQuoteSelection ? (
            <ActionButton
              label={quoteSelectionLabel}
              onClick={onQuoteSelection}
            />
          ) : null}
          {onForward ? <ActionButton label={t(msg`转发`)} onClick={onForward} /> : null}
          {onMultiSelect ? (
            <ActionButton label={t(msg`多选`)} onClick={onMultiSelect} />
          ) : null}
          {onSelectToHere ? (
            <ActionButton
              label={selectToHereLabel}
              onClick={onSelectToHere}
            />
          ) : null}
          {onSetReminder ? (
            <ActionButton label={reminderLabel} onClick={onSetReminder} />
          ) : null}
          {onToggleFavorite ? (
            <ActionButton label={favoriteLabel} onClick={onToggleFavorite} />
          ) : null}
          <ActionButton label={t(msg`复制`)} onClick={onCopy} />
          {onSpeakAloud ? (
            <ActionButton label={speakAloudLabel} onClick={onSpeakAloud} />
          ) : null}
          {onOpenAttachment ? (
            <ActionButton
              label={openAttachmentLabel}
              onClick={onOpenAttachment}
            />
          ) : null}
          {onSaveAttachment ? (
            <ActionButton
              label={saveAttachmentLabel}
              onClick={onSaveAttachment}
            />
          ) : null}
          {onCopySender ? (
            <ActionButton label={t(msg`复制发送者`)} onClick={onCopySender} />
          ) : null}
          {onRecall ? (
            <ActionButton label={recallLabel} onClick={onRecall} danger />
          ) : null}
          {onDelete ? (
            <ActionButton label={deleteLabel} onClick={onDelete} danger />
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-white text-[15px] font-medium text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
        >
          {t(msg`取消`)}
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] w-full items-center justify-center border-b border-[color:var(--border-subtle)] px-4 py-2.5 text-[16px] transition active:bg-[color:var(--surface-card-hover)] last:border-b-0 ${
        danger ? "text-[#d74b45]" : "text-[#111827]"
      }`}
    >
      {label}
    </button>
  );
}
