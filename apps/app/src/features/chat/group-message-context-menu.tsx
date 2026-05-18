import { useEffect, type ReactNode } from "react";
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
      onClose();
      return true;
    });
    return unregister;
  }, [onClose]);

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
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t(msg`关闭消息菜单`)}
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
        className="absolute w-[196px] overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white py-1.5 shadow-[var(--shadow-overlay)]"
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
  return <div className="mx-3 my-1 border-t border-[color:var(--border-faint)]" />;
}
