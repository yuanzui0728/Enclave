import { useCallback, useEffect, useId, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const t = translateRuntimeMessage;

type MobileMessageActionSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  preview?: {
    senderName?: string;
    text: string;
    own?: boolean;
  };
  onReply?: () => void;
  onQuoteSelection?: () => void;
  quoteSelectionLabel?: string;
  onForward?: () => void;
  onMultiSelect?: () => void;
  onSelectToHere?: () => void;
  selectToHereLabel?: string;
  onSetReminder?: () => void;
  reminderLabel?: string;
  onToggleFavorite?: () => void;
  favoriteLabel?: string;
  onCopy: () => void;
  onCopySender?: () => void;
  onSpeakAloud?: () => void;
  speakAloudLabel?: string;
  onOpenAttachment?: () => void;
  openAttachmentLabel?: string;
  onSaveAttachment?: () => void;
  saveAttachmentLabel?: string;
  onRecall?: () => void;
  recallLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  // 视频号评论 wechat-clone：长按弹「举报」槽位。chat 消息暂不用，留 optional
  // 不影响现有调用方；danger 风格但不像「删除」那样默认走红字（举报是中性，
  // 非破坏性操作），用普通 text-[color:var(--text-primary)]。
  onReport?: () => void;
  reportLabel?: string;
};

export function MobileMessageActionSheet({
  open,
  onClose,
  title = t(msg`消息操作`),
  preview,
  onReply,
  onQuoteSelection,
  quoteSelectionLabel = t(msg`部分引用`),
  onForward,
  onMultiSelect,
  onSelectToHere,
  selectToHereLabel = t(msg`选择到这里`),
  onSetReminder,
  reminderLabel = t(msg`提醒`),
  onToggleFavorite,
  favoriteLabel = t(msg`收藏`),
  onCopy,
  onCopySender,
  onSpeakAloud,
  speakAloudLabel = t(msg`朗读`),
  onOpenAttachment,
  openAttachmentLabel = t(msg`打开附件`),
  onSaveAttachment,
  saveAttachmentLabel = t(msg`保存附件`),
  onRecall,
  recallLabel = t(msg`撤回`),
  onDelete,
  deleteLabel = t(msg`删除`),
  onReport,
  reportLabel = t(msg`举报`),
}: MobileMessageActionSheetProps) {
  const titleId = useId();
  // 走查 R2：sheet 上每条 ActionButton 在父组件那边都靠 `setMobileActionMessage(null)`
  // 来"点了就关 sheet"，但 React state 要等 commit 才能让 sheet 卸载——同帧
  // <16ms 第二次 click 时 sheet 还在 DOM 里，第二次 onCopy/onSpeakAloud/onReply
  // 等回调照样跑一遍。playwright 实测「复制」三连点：navigator.clipboard.writeText
  // 跑 2 次（"消息内容已复制" notice 顺便 setActionNotice 闪 2 次）；朗读 / 收藏 /
  // 撤回 / 添加到表情 / 打开附件 / 保存附件 / 复制发送者 都是同款 fire-and-forget
  // 形态，全部都漏挡。一处一处加 sync ref 太散，统一在 sheet 内部加一把：任何
  // ActionButton 点过一次就把 actionFiredRef 翻成 true，所有后续 ActionButton
  // click 直接 noop；open 切回 true 时 effect 复位。这层 guard 不动 onClose（
  // 取消按钮和 backdrop 不走 ActionButton，单独由父组件 setMobileActionMessage
  // null 处理；用户连点 cancel 是预期可重复行为）。
  const actionFiredRef = useRef(false);
  // 走查 2026-05-18 移动端群聊 R4：原 actionFiredRef 只挡了"同帧二连点"，但漏掉
  // 长按打开 sheet 的「ghost-click」——手指从消息上松开时浏览器在 touchend 后
  // 自动派发 click 事件，落点是手指最后停留的屏幕坐标。如果 sheet 在 380ms 时
  // 弹出来时正好把某个 action 按钮渲染在手指坐标下方，touchend 一释放就触发
  // 那个 action（实测：长按 cy=548 的消息 → 380ms 弹 sheet → 「提醒」按钮恰在
  // y=496..540 → 释放手指直接触发「设为提醒」，用户根本没主动点"提醒"）。
  // 加一道时间 guard：sheet 开起来后头 350ms 拦掉所有 ActionButton 触发，
  // 等长按 ghost-click 派发窗口（移动 Safari ~300ms / Chrome ~250ms）过去之后
  // 再放行用户的真实点击。比仿"指针位置变化才放行"实现简单且足够稳。
  const openedAtRef = useRef(0);
  const GHOST_CLICK_GUARD_MS = 350;
  useEffect(() => {
    if (open) {
      actionFiredRef.current = false;
      openedAtRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    }
  }, [open]);
  const guardAction = useCallback(
    (handler: (() => void) | undefined): (() => void) | undefined => {
      if (!handler) return undefined;
      return () => {
        if (actionFiredRef.current) return;
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - openedAtRef.current < GHOST_CLICK_GUARD_MS) {
          return;
        }
        actionFiredRef.current = true;
        handler();
      };
    },
    [],
  );
  // 走查 2026-05-18 移动端单聊 R8：上面 R4 给「action 按钮」补了 ghost-click
  // 时间 guard，但 backdrop close button + 底部「取消」按钮的 onClick={onClose}
  // 没走 guardAction —— 长按消息冒 sheet 的 ghost-click 落点若不在 action 槽位
  // 而在 backdrop（用户长按的消息处于上半屏 → ghost-click 在屏中部 → 击中
  // 「absolute inset-0」backdrop）或 Cancel（长按贴近屏底消息 → ghost-click
  // 落到底部 Cancel）就会把刚弹起来的 sheet 直接关掉，用户得长按第二次才能
  // 真正操作。R4 注释说"用户连点 cancel 是预期可重复行为"——但 ghost-click
  // 不是用户连点，是 touchend 自动派发的合成 click。给关闭路径加 same 350ms
  // 时间 guard：用户主动 Cancel/backdrop 的真实 tap（开 sheet 后 >350ms）照常
  // 关；ghost-click 一律拦掉。
  // 走查 R3：onClose 是父组件传进来的 inline arrow（ChatMessageList 长聊里
  // typing tick / socket echo / setQueriesData 每帧 re-render，每次新引用）。
  // 把 onClose 镜像到 ref；guardClose useCallback / back 拦截 effect /
  // keydown effect 不再每帧重建。和 mobile-message-reminder-sheet R3 同款修法。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const guardClose = useCallback(() => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - openedAtRef.current < GHOST_CLICK_GUARD_MS) {
      return;
    }
    onCloseRef.current();
  }, []);

  // 原生壳硬件 Back 键打开时优先关 sheet，不让 BACK 同时 history.back 把
  // 用户从聊天页带回 chat list。
  useEffect(() => {
    if (!open) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
    return unregister;
  }, [open]);

  // 走查 R2：和姊妹 sheet mobile-message-reminder-sheet / message-quote-
  // selection-sheet / mobile-details-action-sheet 对齐——长按消息冒出来的
  // 这个 sheet 没挂 ESC keydown。桌面 web / 外接键盘 / 模拟器都拍不掉，
  // 只能点 backdrop。a11y / 键盘用户体验缺一刀。和姊妹文件相同写法：
  // open 才挂监听，defaultPrevented 时让位（dialog 内嵌套的子模态有自己
  // 的 ESC 语义不被偷掉）。
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(180,130,20,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t(msg`关闭消息操作菜单`)}
        onClick={guardClose}
        // 走查移动端单聊新一轮 R1：和姊妹 sheet message-quote-selection-sheet
        // (R118) / mobile-message-reminder-sheet (R121) 同款 a11y 缺漏 ——
        // 长按消息冒出来的 action sheet 的 backdrop <button> (absolute inset-0)
        // 视觉不可见、纯 mouse"点击背景关闭" affordance，但 DOM 顺序排在 sheet
        // 子树第一位。键盘用户按 Tab 进 sheet，焦点先落到这张不可见 backdrop
        // → 看不到 focus 框 → 再按 Tab 才进 ActionButton 列。盲人 SR 焦点循
        // 环里也会把 backdrop 念成"关闭消息操作菜单"占一格，节奏被打乱。
        // 挂 tabIndex={-1} 把 backdrop 从 Tab 序列移出；mouse 点击关闭路径
        // 不受影响（onClick 仍生效）。
        tabIndex={-1}
      />
      {/* 走查新一轮 R2：长按群消息冒出来的这个底部操作 sheet 没挂 role="dialog"
          + aria-modal + aria-labelledby——和 mobile-details-action-sheet R(re)1
          修过的同款 a11y 问题。屏幕阅读器（iOS VoiceOver / Android TalkBack）
          不会把它当 modal 念，盲人用户长按群消息后只听到"按钮 取消"，听不到
          "消息操作 / 回复 / 转发 / 撤回 / 删除" 这些 action 标题。补 dialog 语义。*/}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-14px_28px_rgba(180,130,20,0.10)]"
      >
        <div className="flex justify-center pb-1.5">
          <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>
        <div
          id={titleId}
          className="pb-2.5 text-center text-[12px] text-[color:var(--text-muted)]"
        >
          {title}
        </div>
        {preview ? (
          <div className="mb-2.5 overflow-hidden rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5">
            {preview.senderName ? (
              <div className="pb-1 text-[10px] text-[color:var(--text-muted)]">
                {preview.senderName}
              </div>
            ) : null}
            <div
              className={`flex ${preview.own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-[16px] px-3 py-2 text-[13px] leading-5 ${
                  preview.own
                    ? "bg-[color:var(--brand-primary)]/16 text-[color:var(--text-primary)]"
                    : "border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] text-[color:var(--text-primary)]"
                }`}
              >
                <div className="line-clamp-3 whitespace-pre-wrap break-words">
                  {preview.text}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]">
          {onReply ? <ActionButton label={t(msg`回复`)} onClick={guardAction(onReply)!} /> : null}
          {onQuoteSelection ? (
            <ActionButton
              label={quoteSelectionLabel}
              onClick={guardAction(onQuoteSelection)!}
            />
          ) : null}
          {onForward ? <ActionButton label={t(msg`转发`)} onClick={guardAction(onForward)!} /> : null}
          {onMultiSelect ? (
            <ActionButton label={t(msg`多选`)} onClick={guardAction(onMultiSelect)!} />
          ) : null}
          {onSelectToHere ? (
            <ActionButton
              label={selectToHereLabel}
              onClick={guardAction(onSelectToHere)!}
            />
          ) : null}
          {onSetReminder ? (
            <ActionButton label={reminderLabel} onClick={guardAction(onSetReminder)!} />
          ) : null}
          {onToggleFavorite ? (
            <ActionButton label={favoriteLabel} onClick={guardAction(onToggleFavorite)!} />
          ) : null}
          <ActionButton label={t(msg`复制`)} onClick={guardAction(onCopy)!} />
          {onSpeakAloud ? (
            <ActionButton label={speakAloudLabel} onClick={guardAction(onSpeakAloud)!} />
          ) : null}
          {onOpenAttachment ? (
            <ActionButton
              label={openAttachmentLabel}
              onClick={guardAction(onOpenAttachment)!}
            />
          ) : null}
          {onSaveAttachment ? (
            <ActionButton
              label={saveAttachmentLabel}
              onClick={guardAction(onSaveAttachment)!}
            />
          ) : null}
          {onCopySender ? (
            <ActionButton label={t(msg`复制发送者`)} onClick={guardAction(onCopySender)!} />
          ) : null}
          {onRecall ? (
            <ActionButton label={recallLabel} onClick={guardAction(onRecall)!} danger />
          ) : null}
          {onReport ? (
            <ActionButton label={reportLabel} onClick={guardAction(onReport)!} />
          ) : null}
          {onDelete ? (
            <ActionButton label={deleteLabel} onClick={guardAction(onDelete)!} danger />
          ) : null}
        </div>
        <button
          type="button"
          onClick={guardClose}
          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[15px] font-medium text-[color:var(--text-primary)] transition active:bg-[color:var(--surface-card-hover)]"
        >
          {t(msg`取消`)}
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] w-full items-center justify-center border-b border-[color:var(--border-subtle)] px-4 py-2.5 text-[16px] transition active:bg-[color:var(--surface-card-hover)] last:border-b-0 ${
        danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );
}
