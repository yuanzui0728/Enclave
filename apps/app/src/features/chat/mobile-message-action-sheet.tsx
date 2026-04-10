type MobileMessageActionSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  onReply?: () => void;
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
  title = "消息操作",
  onReply,
  onForward,
  onMultiSelect,
  onSelectToHere,
  selectToHereLabel = "选择到这里",
  onSetReminder,
  reminderLabel = "提醒",
  onToggleFavorite,
  favoriteLabel = "收藏",
  onCopy,
  onCopySender,
  onOpenAttachment,
  openAttachmentLabel = "打开附件",
  onSaveAttachment,
  saveAttachmentLabel = "保存附件",
  onRecall,
  recallLabel = "撤回",
  onDelete,
  deleteLabel = "删除",
}: MobileMessageActionSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.18)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭消息操作菜单"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[18px] bg-[#f2f2f2] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-16px_36px_rgba(15,23,42,0.14)]">
        <div className="pb-3 text-center text-[13px] text-[#8c8c8c]">
          {title}
        </div>
        <div className="overflow-hidden rounded-[14px] bg-white">
          {onReply ? <ActionButton label="回复" onClick={onReply} /> : null}
          {onForward ? <ActionButton label="转发" onClick={onForward} /> : null}
          {onMultiSelect ? (
            <ActionButton label="多选" onClick={onMultiSelect} />
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
          <ActionButton label="复制" onClick={onCopy} />
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
            <ActionButton label="复制发送者" onClick={onCopySender} />
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
          className="mt-3 flex h-12 w-full items-center justify-center rounded-[14px] bg-white text-[17px] font-medium text-[#111827]"
        >
          取消
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
      className={`flex h-12 w-full items-center justify-center border-b border-black/6 text-[17px] last:border-b-0 ${
        danger ? "text-[#d74b45]" : "text-[#111827]"
      }`}
    >
      {label}
    </button>
  );
}
