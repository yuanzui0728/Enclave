import { type ReactNode } from "react";
import { BellOff, CheckCheck, Eraser, EyeOff, Pin } from "lucide-react";

type DesktopConversationContextMenuProps = {
  x: number;
  y: number;
  isPinned: boolean;
  isMuted: boolean;
  showMarkRead: boolean;
  busy?: boolean;
  onClose: () => void;
  onTogglePinned: () => void;
  onToggleMuted: () => void;
  onMarkRead?: () => void;
  onHide: () => void;
  onClear: () => void;
};

const MENU_WIDTH = 196;
const MENU_HEIGHT_BASE = 188;
const MENU_HEIGHT_WITH_MARK_READ = 236;
const VIEWPORT_PADDING = 12;

export function DesktopConversationContextMenu({
  x,
  y,
  isPinned,
  isMuted,
  showMarkRead,
  busy = false,
  onClose,
  onTogglePinned,
  onToggleMuted,
  onMarkRead,
  onHide,
  onClear,
}: DesktopConversationContextMenuProps) {
  const menuHeight = showMarkRead
    ? MENU_HEIGHT_WITH_MARK_READ
    : MENU_HEIGHT_BASE;
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
        className="absolute w-[196px] overflow-hidden rounded-[16px] border border-black/6 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ContextMenuButton
          icon={<Pin size={15} />}
          label={isPinned ? "取消置顶" : "置顶聊天"}
          onClick={onTogglePinned}
          disabled={busy}
        />
        <ContextMenuButton
          icon={<BellOff size={15} />}
          label={isMuted ? "关闭消息免打扰" : "消息免打扰"}
          onClick={onToggleMuted}
          disabled={busy}
        />
        {showMarkRead && onMarkRead ? (
          <ContextMenuButton
            icon={<CheckCheck size={15} />}
            label="标记为已读"
            onClick={onMarkRead}
            disabled={busy}
          />
        ) : null}
        <ContextMenuButton
          icon={<EyeOff size={15} />}
          label="隐藏聊天"
          onClick={onHide}
          disabled={busy}
        />
        <ContextMenuButton
          icon={<Eraser size={15} />}
          label="清空聊天记录"
          onClick={onClear}
          disabled={busy}
          danger
        />
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
