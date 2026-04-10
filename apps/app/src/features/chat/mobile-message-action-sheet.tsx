type MobileMessageActionSheetProps = {
  open: boolean;
  onClose: () => void;
  onReply?: () => void;
  onCopy: () => void;
};

export function MobileMessageActionSheet({
  open,
  onClose,
  onReply,
  onCopy,
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
        <div className="overflow-hidden rounded-[14px] bg-white">
          {onReply ? <ActionButton label="回复" onClick={onReply} /> : null}
          <ActionButton label="复制" onClick={onCopy} />
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
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center border-b border-black/6 text-[17px] text-[#111827] last:border-b-0"
    >
      {label}
    </button>
  );
}
