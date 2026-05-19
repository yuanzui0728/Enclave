import { Fragment, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";

export type DesktopOfficialMessageContextMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  dividerBefore?: boolean;
};

type DesktopOfficialMessageContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  items: DesktopOfficialMessageContextMenuItem[];
};

const MENU_WIDTH = 196;
const MENU_ITEM_HEIGHT = 42;
const MENU_DIVIDER_HEIGHT = 10;
const MENU_VERTICAL_PADDING = 16;
const VIEWPORT_PADDING = 12;

export function DesktopOfficialMessageContextMenu({
  x,
  y,
  onClose,
  items,
}: DesktopOfficialMessageContextMenuProps) {
  const t = useRuntimeTranslator();
  const visibleItems = items.filter((item) => item);
  const dividerCount = visibleItems.filter((item) => item.dividerBefore).length;
  const menuHeight =
    visibleItems.length * MENU_ITEM_HEIGHT +
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
    // 走查新一轮 R10：同 DesktopConversationContextMenu —— workspace 的
    // pointerdown capture 兜底会在「点击落在非 thread / 非 side panel /
    // 非 header / 非 shield 区域」时 dismissSidePanel。本 menu inline
    // 渲染但不在那些保护区里，开着「聊天信息」侧栏时右键订阅号 / 服务号
    // 弹菜单后点任意一项（打开订阅号消息 / 标记已读 / 消息免打扰 等），
    // 都会先把背后侧栏关掉。补 data-yj-portal-shield。
    <div
      className="fixed inset-0 z-50"
      data-yj-portal-shield="official-message-context-menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t(msg`关闭公众号消息菜单`)}
        // 走查电脑端单聊 R129：和姊妹 DesktopConversationContextMenu R113 /
        // R107-R128 整套 backdrop 同款 —— 本 backdrop <button> (absolute
        // inset-0) 视觉不可见、纯 mouse"点击外部关闭"affordance，但 DOM 顺序
        // 排在 menu 子树第一位。用户右键单聊左侧栏的订阅号 / 服务号会话弹出
        // menu 后想 Tab 进 menu 项操作，焦点先落到这张不可见 backdrop → 看不
        // 到 focus ring → 再按 Enter menu 秒关。Esc keydown 已挂 (line 41-58
        // 父级 useEffect)，键盘用户走 Esc 关 menu；正常情况下 menu 项 ArrowDown/
        // Tab 也可继续。挂 tabIndex={-1} 把 backdrop 从 Tab 序列移出去。
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-transparent"
      />

      {/* 走查新一轮 R8：右键订阅号收件箱 / 服务号会话弹的 context menu，
          盲人屏幕阅读器只听到一串裸 button label「打开订阅号消息 / 打开公众号
          目录 / 标记全部已读」浮空，不知道是「公众号消息菜单」。和 R6 给
          DesktopConversationContextMenu / GroupMessageContextMenu 补的同款
          a11y：补 role="menu" + aria-label 让 SR 知道这是个上下文菜单。 */}
      <div
        role="menu"
        aria-label={t(msg`公众号消息操作菜单`)}
        style={{ left, top }}
        className="absolute w-[196px] overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white/96 py-1.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {visibleItems.map((item) => (
          // 走查新一轮 R1：原版 `<div key={item.key}>` 把 MenuDivider + ContextMenuButton
          // 一起包成一个无 role 的 <div>，破坏 role="menu" 的 ARIA 1.2 父子链 ——
          // 合法子元素必须是 menuitem / menuitemcheckbox / menuitemradio / group /
          // separator，裸 <div> 属于"unknown role"会让严格 SR (VoiceOver 严格模式
          // / NVDA browse mode) 把整块菜单当 generic container 处理、跳过 menu
          // 模式快捷键。姊妹 desktop-conversation-context-menu / chat group-message-
          // context-menu 全部用 Fragment 平铺，本菜单 1) 有 dividerBefore 配对
          // 需求 2) 用 array.map 时 key 必须落在最外层元素上 → 用 Fragment 带 key。
          <Fragment key={item.key}>
            {item.dividerBefore ? <MenuDivider /> : null}
            <ContextMenuButton
              icon={item.icon}
              label={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              danger={item.danger}
            />
          </Fragment>
        ))}
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
      // R63 续：和姊妹 R62 同款——父 role="menu" 需要 menuitem 子元素。
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
  // 走查电脑端单聊 R137：和姊妹 desktop-conversation-context-menu MenuDivider
  // 同款 —— 外层 role="menu" + 子 button 已挂 role="menuitem"，但本 divider
  // 还是裸 <div>，按 ARIA 1.2 spec role="menu" 的合法子元素必须落到 group /
  // menuitem* / none / separator 白名单内，裸 <div> 不在内。给 menu 内
  // section 间分隔条挂 role="separator"，让 SR 走 menu 模式时把它识别为
  // logical divider 并跳过，避免被部分实现暴露成 GenericContainer 噪音。
  return (
    <div
      role="separator"
      className="mx-3 my-1 border-t border-[color:var(--border-faint)]"
    />
  );
}
