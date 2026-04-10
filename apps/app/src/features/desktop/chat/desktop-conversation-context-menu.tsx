import { type ReactNode } from "react";
import {
  BellOff,
  CheckCheck,
  Circle,
  Eraser,
  EyeOff,
  ExternalLink,
  Pin,
  Trash2,
} from "lucide-react";

type DesktopConversationContextMenuProps = {
  x: number;
  y: number;
  isPinned: boolean;
  isMuted: boolean;
  showMarkRead: boolean;
  showMarkUnread?: boolean;
  busy?: boolean;
  onClose: () => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
  onOpenWindow?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
  hideLabel?: string;
  onHide?: () => void;
  onClear: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
};

const MENU_WIDTH = 196;
const MENU_ITEM_HEIGHT = 42;
const MENU_VERTICAL_PADDING = 16;
const VIEWPORT_PADDING = 12;

export function DesktopConversationContextMenu({
  x,
  y,
  isPinned,
  isMuted,
  showMarkRead,
  showMarkUnread = false,
  busy = false,
  onClose,
  onTogglePinned,
  onToggleMuted,
  onOpenWindow,
  onMarkRead,
  onMarkUnread,
  hideLabel = "隐藏聊天",
  onHide,
  onClear,
  deleteLabel,
  onDelete,
}: DesktopConversationContextMenuProps) {
  const actionCount =
    3 +
    Number(Boolean(onOpenWindow)) +
    Number(Boolean(showMarkRead && onMarkRead)) +
    Number(Boolean(showMarkUnread && onMarkUnread)) +
    Number(Boolean(onHide)) +
    Number(Boolean(onDelete));
  const menuHeight = actionCount * MENU_ITEM_HEIGHT + MENU_VERTICAL_PADDING;
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
        aria-label="关闭会话菜单"
        className="absolute inset-0 cursor-default bg-transparent"
      />

      <div
        style={{ left, top }}
        className="absolute w-[196px] overflow-hidden rounded-[14px] border border-black/8 bg-white py-1.5 shadow-[0_12px_28px_rgba(15,23,42,0.14)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onOpenWindow ? (
          <>
            <ContextMenuButton
              icon={<ExternalLink size={15} />}
              label="在独立窗口打开"
              onClick={onOpenWindow}
              disabled={busy}
            />
            <MenuDivider />
          </>
        ) : null}
        <ContextMenuButton
          icon={<Pin size={15} />}
          label={isPinned ? "取消置顶" : "置顶聊天"}
          onClick={onTogglePinned}
          disabled={busy}
        />
        <ContextMenuButton
          icon={<BellOff size={15} />}
          label={isMuted ? "关闭免打扰" : "消息免打扰"}
          onClick={onToggleMuted}
          disabled={busy}
        />
        {showMarkRead && onMarkRead ? (
          <ContextMenuButton
            icon={<CheckCheck size={15} />}
            label="标为已读"
            onClick={onMarkRead}
            disabled={busy}
          />
        ) : null}
        {showMarkUnread && onMarkUnread ? (
          <ContextMenuButton
            icon={<Circle size={15} />}
            label="标为未读"
            onClick={onMarkUnread}
            disabled={busy}
          />
        ) : null}
        {(showMarkRead && onMarkRead) || (showMarkUnread && onMarkUnread) ? (
          <MenuDivider />
        ) : null}
        {onHide ? (
          <ContextMenuButton
            icon={<EyeOff size={15} />}
            label={hideLabel}
            onClick={onHide}
            disabled={busy}
          />
        ) : null}
        <ContextMenuButton
          icon={<Eraser size={15} />}
          label="清空聊天记录"
          onClick={onClear}
          disabled={busy}
          danger
        />
        {onHide || onDelete ? <MenuDivider /> : null}
        {onDelete && deleteLabel ? (
          <ContextMenuButton
            icon={<Trash2 size={15} />}
            label={deleteLabel}
            onClick={onDelete}
            disabled={busy}
            danger
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
  disabled = false,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
        danger
          ? "text-[#dc2626] hover:bg-[rgba(220,38,38,0.06)]"
          : "text-[color:var(--text-primary)] hover:bg-[#f5f5f5]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={
          danger
            ? "text-[rgba(220,38,38,0.88)]"
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
