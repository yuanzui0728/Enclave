import { useEffect, useRef, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
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
  Smile,
  Star,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const t = translateRuntimeMessage;

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
  onSpeakAloud?: () => void;
  speakAloudLabel?: string;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  onAddToStickers?: () => void;
  addToStickersLabel?: string;
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
// MenuDivider 实际渲染高度（my-1 上下 4px + border-t 1px ≈ 9px）。
// 不算 divider 时，靠近视口底部右键群消息最多裁掉下面 2 行可见动作
// （撤回/删除最常被裁，因为它们在最底端），用户被迫挪到屏幕中部
// 再右键。和姊妹 desktop-conversation-context-menu R—（MENU_DIVIDER_HEIGHT）
// 同款修法。
const MENU_DIVIDER_HEIGHT = 9;

export function GroupMessageContextMenu({
  x,
  y,
  onClose,
  onReply,
  onQuoteSelection,
  quoteSelectionLabel = t(msg`部分引用`),
  onForward,
  onMultiSelect,
  onSetReminder,
  reminderLabel = t(msg`提醒`),
  onCopyText,
  onCopySender,
  onSpeakAloud,
  speakAloudLabel = t(msg`朗读`),
  onToggleFavorite,
  favoriteLabel = t(msg`收藏`),
  onAddToStickers,
  addToStickersLabel = t(msg`添加到表情`),
  onOpenAttachment,
  openAttachmentLabel = t(msg`打开附件`),
  onSaveAttachment,
  saveAttachmentLabel = t(msg`另存为`),
  onRecall,
  recallLabel = t(msg`撤回`),
  onDelete,
  deleteLabel = t(msg`删除`),
}: GroupMessageContextMenuProps) {
  const normalizedReminderLabel =
    reminderLabel === t(msg`提醒`) ? t(msg`设为提醒`) : reminderLabel;
  const normalizedFavoriteLabel =
    favoriteLabel === t(msg`收藏消息`) ? t(msg`收藏`) : favoriteLabel;
  const actionCount =
    1 +
    Number(Boolean(onReply)) +
    Number(Boolean(onQuoteSelection)) +
    Number(Boolean(onForward)) +
    Number(Boolean(onMultiSelect)) +
    Number(Boolean(onSetReminder)) +
    Number(Boolean(onCopySender)) +
    Number(Boolean(onSpeakAloud)) +
    Number(Boolean(onToggleFavorite)) +
    Number(Boolean(onAddToStickers)) +
    Number(Boolean(onOpenAttachment)) +
    Number(Boolean(onSaveAttachment)) +
    Number(Boolean(onRecall)) +
    Number(Boolean(onDelete));
  // 和 JSX 里 2 处 MenuDivider 的渲染条件保持一致：
  //   1) onReply || onQuoteSelection || onForward || onMultiSelect 后 1 条
  //   2) onSetReminder || onToggleFavorite || onAddToStickers || onOpenAttachment || onSaveAttachment 后 1 条
  // 漏掉这两条 divider，靠近视口底部右键消息时 top 计算把菜单顶得太低，撤回/
  // 删除会被裁出可视区，用户得把鼠标挪到屏幕中部再右键。
  const dividerCount =
    Number(
      Boolean(onReply || onQuoteSelection || onForward || onMultiSelect),
    ) +
    Number(
      Boolean(
        onSetReminder ||
          onToggleFavorite ||
          onAddToStickers ||
          onOpenAttachment ||
          onSaveAttachment,
      ),
    );
  const menuHeight = actionCount * 42 + dividerCount * MENU_DIVIDER_HEIGHT + 16;
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

  // 走查 2026-05-18 移动端群聊 R4：和姊妹 sheet mobile-message-reminder-sheet R3
  // / mobile-mention-picker-sheet R3 / mobile-message-action-sheet R3 同款修法
  // ——下方 back/Esc 两个 effect 原本把 onClose 列进 deps，但调用方 chat-message-list
  // 是直接 `onClose={() => setContextMenuState(null)}` inline arrow，每次父帧
  // 重渲染就是新引用。ChatMessageList 长聊里 typing tick / socket echo /
  // setQueriesData / setMessages 每秒多次 re-render，context menu 还开着的时
  // 候每帧都拆装一次原生 back interceptor + window keydown listener。镜像
  // onCloseRef，deps 只保留挂载即可。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 走查新一轮 R1：长按消息冒出的这个上下文菜单是用 `contextMenuState ? <Menu .../>
  // : null` 条件挂载的（chat-message-list 内）——挂上后没注册 Android 硬件 Back
  // 拦截。Android 用户长按消息 → 菜单弹出 → 按 BACK 不是关菜单而是触发 webview
  // history.back 把人从群聊页弹回 chat-list；菜单 backdrop 同时被销毁，看着就
  // 是"按一次返回直接被弹出聊天页"。和 mobile-mention-picker-sheet /
  // mobile-message-action-sheet / message-quote-selection-sheet 同口径，挂载
  // 期间拦 BACK 改派给 onClose。
  useEffect(() => {
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
    return unregister;
  }, []);

  // 走查 R7：和姊妹 sheet（mobile-message-action-sheet R2 等）同款 ESC 兜底
  // —— 桌面/平板/外接键盘右键消息弹的 context menu 上拍 ESC 没反应，只能点
  // backdrop 才能关。本菜单同时挂在桌面 right-click（chat-message-list 桌面
  // 分支）和移动长按路径上，桌面侧用户体感差异最大。defaultPrevented 时让位。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t(msg`关闭消息菜单`)}
        // 走查电脑端单聊 R117：和姊妹 R113 desktop-conversation-context-menu /
        // R107-R114 dialog backdrop 同款 —— 右键单聊 / 群聊消息弹出的
        // GroupMessageContextMenu 的 backdrop <button> (absolute inset-0)
        // 视觉不可见、纯 mouse"点击外部关闭"affordance，但 DOM 顺序排在 menu
        // 子树第一位。用户右键消息弹 menu 后想 Tab 进 menu 项 (回复/转发/
        // 引用/撤回/收藏/删除)，焦点先落到这张不可见 backdrop → 看不到
        // focus ring → 再按 Enter menu 秒关。Esc keydown 已挂；ArrowDown/Tab
        // 可直接跳到第一个 menuitem。挂 tabIndex={-1} 把 backdrop 从 Tab 序列
        // 移出。
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-transparent"
      />

      {/* 走查 R6：右键消息弹的 context menu，盲人屏幕阅读器原本只听到一串
          按钮 label（「回复」「转发」「撤回」等）浮空，没有上下文。和姊妹
          desktop-conversation-context-menu 同款 a11y 修法，补 role="menu"
          + aria-label 让 SR 知道这是个消息菜单。 */}
      <div
        role="menu"
        aria-label={t(msg`消息操作菜单`)}
        style={{ left, top }}
        className="absolute w-[196px] overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] py-1.5 shadow-[var(--shadow-overlay)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onReply ? (
          <ContextMenuButton
            label={t(msg`回复`)}
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
            label={t(msg`转发`)}
            icon={<Forward size={15} />}
            onClick={onForward}
          />
        ) : null}
        {onMultiSelect ? (
          <ContextMenuButton
            label={t(msg`多选`)}
            icon={<CheckSquare size={15} />}
            onClick={onMultiSelect}
          />
        ) : null}
        <ContextMenuButton
          label={t(msg`复制`)}
          icon={<Copy size={15} />}
          onClick={onCopyText}
        />
        {onCopySender ? (
          <ContextMenuButton
            label={t(msg`复制发送者`)}
            icon={<UserRound size={15} />}
            onClick={onCopySender}
          />
        ) : null}
        {onSpeakAloud ? (
          <ContextMenuButton
            label={speakAloudLabel}
            icon={<Volume2 size={15} />}
            onClick={onSpeakAloud}
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
        {onAddToStickers ? (
          <ContextMenuButton
            label={addToStickersLabel}
            icon={<Smile size={15} />}
            onClick={onAddToStickers}
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
        onAddToStickers ||
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
      // R64：和姊妹 R62 / R63 同款——父 role="menu" 需要 menuitem 子元素。
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-[color:var(--surface-console)] ${
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
