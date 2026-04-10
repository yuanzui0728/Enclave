import { type ReactNode } from "react";
import {
  BellRing,
  CheckSquare,
  Copy,
  CornerUpLeft,
  Download,
  ExternalLink,
  FileText,
  Forward,
  RotateCcw,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";

type GroupMessageContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onReply?: () => void;
  onQuoteSelection?: () => void;
  quoteSelectionLabel?: string;
  onForward?: () => void;
  onMultiSelect?: () => void;
  onSetReminder?: () => void;
  reminderLabel?: string;
  onCopyText: () => void;
  onCopySender?: () => void;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  onOpenAttachment?: () => void;
  openAttachmentLabel?: string;
  onSaveAttachment?: () => void;
  saveAttachmentLabel?: string;
  onRecall?: () => void;
  recallLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
};

const MENU_WIDTH = 196;
const VIEWPORT_PADDING = 12;

export function GroupMessageContextMenu({
  x,
  y,
  onClose,
  onReply,
  onQuoteSelection,
  quoteSelectionLabel = "部分引用",
  onForward,
  onMultiSelect,
  onSetReminder,
  reminderLabel = "提醒",
  onCopyText,
  onCopySender,
  onToggleFavorite,
  favoriteLabel = "收藏",
  onOpenAttachment,
  openAttachmentLabel = "打开附件",
  onSaveAttachment,
  saveAttachmentLabel = "另存为",
  onRecall,
  recallLabel = "撤回",
  onDelete,
  deleteLabel = "删除",
}: GroupMessageContextMenuProps) {
  const normalizedReminderLabel =
    reminderLabel === "提醒" ? "设为提醒" : reminderLabel;
  const normalizedFavoriteLabel =
    favoriteLabel === "收藏消息" ? "收藏" : favoriteLabel;
  const actionCount =
    1 +
    Number(Boolean(onReply)) +
    Number(Boolean(onQuoteSelection)) +
    Number(Boolean(onForward)) +
    Number(Boolean(onMultiSelect)) +
    Number(Boolean(onSetReminder)) +
    Number(Boolean(onCopySender)) +
    Number(Boolean(onToggleFavorite)) +
    Number(Boolean(onOpenAttachment)) +
    Number(Boolean(onSaveAttachment)) +
    Number(Boolean(onRecall)) +
    Number(Boolean(onDelete));
  const menuHeight = actionCount * 42 + 16;
  const viewportWidth =
    typeof window === "undefined" ? MENU_WIDTH : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined" ? menuHeight : window.innerHeight;
  const left = Math.min(
    Math.max(VIEWPORT_PADDING, x),
    Math.max(VIEWPORT_PADDING, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING),
  );
  const top = Math.min(
    Math.max(VIEWPORT_PADDING, y),
    Math.max(VIEWPORT_PADDING, viewportHeight - menuHeight - VIEWPORT_PADDING),
  );

  return (
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭消息菜单"
        className="absolute inset-0 cursor-default bg-transparent"
      />

      <div
        style={{ left, top }}
        className="absolute w-[196px] overflow-hidden rounded-[14px] border border-black/8 bg-white py-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.14)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onReply ? (
          <ContextMenuButton
            label="回复"
            icon={<CornerUpLeft size={15} />}
            onClick={onReply}
          />
        ) : null}
        {onQuoteSelection ? (
          <ContextMenuButton
            label={quoteSelectionLabel}
            icon={<FileText size={15} />}
            onClick={onQuoteSelection}
          />
        ) : null}
        {onForward ? (
          <ContextMenuButton
            label="转发"
            icon={<Forward size={15} />}
            onClick={onForward}
          />
        ) : null}
        {onMultiSelect ? (
          <ContextMenuButton
            label="多选"
            icon={<CheckSquare size={15} />}
            onClick={onMultiSelect}
          />
        ) : null}
        <ContextMenuButton
          label="复制"
          icon={<Copy size={15} />}
          onClick={onCopyText}
        />
        {onCopySender ? (
          <ContextMenuButton
            label="复制发送者"
            icon={<UserRound size={15} />}
            onClick={onCopySender}
          />
        ) : null}
        {onReply || onQuoteSelection || onForward || onMultiSelect ? (
          <MenuDivider />
        ) : null}
        {onSetReminder ? (
          <ContextMenuButton
            label={normalizedReminderLabel}
            icon={<BellRing size={15} />}
            onClick={onSetReminder}
          />
        ) : null}
        {onToggleFavorite ? (
          <ContextMenuButton
            label={normalizedFavoriteLabel}
            icon={<Star size={15} />}
            onClick={onToggleFavorite}
          />
        ) : null}
        {onOpenAttachment ? (
          <ContextMenuButton
            label={openAttachmentLabel}
            icon={<ExternalLink size={15} />}
            onClick={onOpenAttachment}
          />
        ) : null}
        {onSaveAttachment ? (
          <ContextMenuButton
            label={saveAttachmentLabel}
            icon={<Download size={15} />}
            onClick={onSaveAttachment}
          />
        ) : null}
        {onSetReminder ||
        onToggleFavorite ||
        onOpenAttachment ||
        onSaveAttachment ? (
          <MenuDivider />
        ) : null}
        {onRecall ? (
          <ContextMenuButton
            danger
            label={recallLabel}
            icon={<RotateCcw size={15} />}
            onClick={onRecall}
          />
        ) : null}
        {onDelete ? (
          <ContextMenuButton
            danger
            label={deleteLabel}
            icon={<Trash2 size={15} />}
            onClick={onDelete}
          />
        ) : null}
      </div>
    </div>
  );
}

function ContextMenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-[#f5f5f5] ${
        danger
          ? "text-[color:var(--state-danger-text)]"
          : "text-[color:var(--text-primary)]"
      }`}
    >
      <span
        className={
          danger
            ? "text-[color:var(--state-danger-text)]"
            : "text-[color:var(--text-secondary)]"
        }
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-3 my-1 border-t border-black/6" />;
}
