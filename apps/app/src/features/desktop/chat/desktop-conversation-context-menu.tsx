import { type ReactNode } from "react";
import { msg } from "@lingui/macro";
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
import { translateRuntimeMessage } from "@yinjie/i18n";

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
  hideLabel?: ReactNode;
  onHide?: () => void;
  onClear: () => void;
  deleteLabel?: ReactNode;
  onDelete?: () => void;
};

const MENU_WIDTH = 196;
const MENU_ITEM_HEIGHT = 42;
const MENU_VERTICAL_PADDING = 16;
// MenuDivider 实际渲染高度（my-1 上下 4px + border-t 1px ≈ 9px）。
// 不算 divider 时，靠近视口底部右键最多会裁掉一行可见动作。
const MENU_DIVIDER_HEIGHT = 9;
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
  hideLabel,
  onHide,
  onClear,
  deleteLabel,
  onDelete,
}: DesktopConversationContextMenuProps) {
  const t = translateRuntimeMessage;
  const actionCount =
    3 +
    Number(Boolean(onOpenWindow)) +
    Number(Boolean(showMarkRead && onMarkRead)) +
    Number(Boolean(showMarkUnread && onMarkUnread)) +
    Number(Boolean(onHide)) +
    Number(Boolean(onDelete));
  // 实际渲染里的 MenuDivider 数量：onOpenWindow 后 1 条；有已读/未读项时
  // 1 条；onHide || onDelete 时 1 条。和 JSX 里的条件保持一致，免得贴底
  // 右键裁掉下面一行。
  const dividerCount =
    Number(Boolean(onOpenWindow)) +
    Number(Boolean((showMarkRead && onMarkRead) || (showMarkUnread && onMarkUnread))) +
    Number(Boolean(onHide || onDelete));
  const menuHeight =
    actionCount * MENU_ITEM_HEIGHT +
    dividerCount * MENU_DIVIDER_HEIGHT +
    MENU_VERTICAL_PADDING;
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
        aria-label={t(msg`关闭会话菜单`)}
        className="absolute inset-0 cursor-default bg-transparent"
      />

      {/* 走查 R6：右键会话弹的 context menu，盲人屏幕阅读器原本只听到一串
          button label「在独立窗口打开 / 置顶聊天 / 消息免打扰 / ...」浮空，
          不知道是「会话菜单」。和姊妹 dialog 系列 R2~R5 修过的 a11y 同款方向，
          补 role="menu" + aria-label 让 SR 知道这是个上下文菜单；按钮虽然没
          挂 role="menuitem"（普通 <button> 在 menu 里 SR 也能识别），让 menu
          容器有正确角色已经能让"上下文"清楚。 */}
      <div
        role="menu"
        aria-label={t(msg`会话操作菜单`)}
        style={{ left, top }}
        className="absolute w-[196px] overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white/96 py-1.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onOpenWindow ? (
          <>
            <ContextMenuButton
              icon={<ExternalLink size={15} />}
              label={t(msg`在独立窗口打开`)}
              onClick={onOpenWindow}
              disabled={busy}
            />
            <MenuDivider />
          </>
        ) : null}
        <ContextMenuButton
          icon={<Pin size={15} />}
          label={isPinned ? t(msg`取消置顶`) : t(msg`置顶聊天`)}
          onClick={onTogglePinned}
          disabled={busy}
        />
        <ContextMenuButton
          icon={<BellOff size={15} />}
          label={isMuted ? t(msg`关闭免打扰`) : t(msg`消息免打扰`)}
          onClick={onToggleMuted}
          disabled={busy}
        />
        {showMarkRead && onMarkRead ? (
          <ContextMenuButton
            icon={<CheckCheck size={15} />}
            label={t(msg`标为已读`)}
            onClick={onMarkRead}
            disabled={busy}
          />
        ) : null}
        {showMarkUnread && onMarkUnread ? (
          <ContextMenuButton
            icon={<Circle size={15} />}
            label={t(msg`标为未读`)}
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
            label={hideLabel ?? t(msg`隐藏聊天`)}
            onClick={onHide}
            disabled={busy}
          />
        ) : null}
        <ContextMenuButton
          icon={<Eraser size={15} />}
          label={t(msg`清空聊天记录`)}
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
  label: ReactNode;
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
          : "text-[color:var(--text-primary)] hover:bg-[color:var(--surface-console)]"
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
  return <div className="mx-3 my-1 border-t border-[color:var(--border-faint)]" />;
}
