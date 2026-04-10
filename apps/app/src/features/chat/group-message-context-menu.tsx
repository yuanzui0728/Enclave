import { type ReactNode } from "react";
import {
  CheckSquare,
  Copy,
  CornerUpLeft,
  Download,
  ExternalLink,
  Forward,
  Star,
  UserRound,
} from "lucide-react";

type GroupMessageContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onMultiSelect?: () => void;
  onCopyText: () => void;
  onCopySender?: () => void;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  onOpenAttachment?: () => void;
  openAttachmentLabel?: string;
  onSaveAttachment?: () => void;
  saveAttachmentLabel?: string;
};

const MENU_WIDTH = 188;
const VIEWPORT_PADDING = 12;

export function GroupMessageContextMenu({
  x,
  y,
  onClose,
  onReply,
  onForward,
  onMultiSelect,
  onCopyText,
  onCopySender,
  onToggleFavorite,
  favoriteLabel = "收藏",
  onOpenAttachment,
  openAttachmentLabel = "打开附件",
  onSaveAttachment,
  saveAttachmentLabel = "另存为",
}: GroupMessageContextMenuProps) {
  const actionCount =
    1 +
    Number(Boolean(onReply)) +
    Number(Boolean(onForward)) +
    Number(Boolean(onMultiSelect)) +
    Number(Boolean(onCopySender)) +
    Number(Boolean(onToggleFavorite)) +
    Number(Boolean(onOpenAttachment)) +
    Number(Boolean(onSaveAttachment));
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
        className="absolute w-[188px] overflow-hidden rounded-[16px] border border-black/6 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onReply ? (
          <ContextMenuButton
            label="回复消息"
            icon={<CornerUpLeft size={15} />}
            onClick={onReply}
          />
        ) : null}
        {onForward ? (
          <ContextMenuButton
            label="转发消息"
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
          label="复制消息"
          icon={<Copy size={15} />}
          onClick={onCopyText}
        />
        {onToggleFavorite ? (
          <ContextMenuButton
            label={favoriteLabel}
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
        {onCopySender ? (
          <ContextMenuButton
            label="复制发送者"
            icon={<UserRound size={15} />}
            onClick={onCopySender}
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
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[#f5f5f5]"
    >
      <span className="text-[color:var(--text-secondary)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
