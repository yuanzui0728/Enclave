import { useEffect, useRef, type ReactNode } from "react";
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

  // 走查 R3：和姊妹 group-message-context-menu R7 (19d5f2dd0) 同款 ESC 兜底。
  // 桌面端右键会话弹的菜单上拍 ESC 没反应，只能点 backdrop 才能关；外接键盘
  // 用户体感差异最大。defaultPrevented 时让位；stopPropagation 避免冒泡触发
  // 外层 workspace dismissSidePanel 把背后的「聊天信息」侧栏一并关掉（菜单
  // 容器有 portal-shield 但 window keydown 走的是全局监听，不经过子树）。
  //
  // R12：和 R11 dialog onClose / desktop-message-avatar-popover R12 同款
  // perf 修法。workspace 用 inline arrow `onClose={() => setConversationContextMenu
  // (null)}` 传进来，菜单展开期间 workspace 60s 轮询 / typing tick / socket
  // 推消息每次都换 onClose ref → 拆装 window keydown 一次。ref 镜像 onClose，
  // effect 改成挂载时挂一次。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // 走查新一轮 R10：DesktopChatWorkspace 的 onPointerDownCapture（line 589）
    // 和 document pointerdown(capture) 兜底（line 987）会在「点击不落在
    // sidePanelRef / desktopHeaderActionsRef / threadSectionRef / 任意带
    // data-yj-portal-shield 的子树」时 dismissSidePanel。本 context menu
    // inline 渲染在 workspace 根 div 子树里、不在 threadSectionRef，也没有
    // shield —— 用户开着「聊天信息」侧栏、右键另一段会话弹出菜单后点任意一项
    // （置顶 / 免打扰 / 标已读 / 在独立窗口打开 等），pointerdown capture
    // 阶段先跑 → dismissSidePanel() → 用户当前会话的详情侧栏被偷偷关掉，
    // 然后才轮到 button click 真正执行操作。和 avatar popover R1 同款修法
    // （popover 走 portal 也是用 data-yj-portal-shield 解决的）。
    <div
      className="fixed inset-0 z-50"
      data-yj-portal-shield="conversation-context-menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t(msg`关闭会话菜单`)}
        // 走查电脑端单聊 R113：和姊妹 R107-R112 dialog backdrop 同款 ——
        // context menu 的 backdrop <button> (absolute inset-0) 视觉不可见、
        // 纯 mouse"点击外部关闭"affordance，但 DOM 顺序排在 menu 子树第一位。
        // 用户右键会话弹出 menu 后想 Tab 进 menu 项操作，焦点先落到这张不可
        // 见 backdrop → 看不到 focus ring → 再按 Enter menu 秒关。Esc keydown
        // 已挂 (line 111-122)，键盘用户走 Esc 关 menu；正常情况下 menu 项也
        // 可以通过 ArrowDown/Tab 跳到第一项后继续 Tab。挂 tabIndex={-1}。
        tabIndex={-1}
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
      // R62：之前 R6 把外层容器挂了 role="menu" + aria-label="会话操作菜单"，
      // 但注释里说"普通 button 在 menu 里 SR 也能识别"是不准的——按 ARIA
      // spec role="menu" 的合法子元素必须是 menuitem / menuitemradio /
      // menuitemcheckbox，否则部分 SR（VoiceOver、JAWS 严格模式）在 menu
      // 导航模式下会跳过这些 button、或读不出"菜单项"上下文。补 role="menuitem"
      // 让所有 SR 都能在 menu 中用箭头键导航并正确朗读。
      role="menuitem"
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
