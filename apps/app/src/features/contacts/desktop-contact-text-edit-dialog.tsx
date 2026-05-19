import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { X } from "lucide-react";
import { Button, ErrorBlock, TextField } from "@yinjie/ui";
import { translateRuntimeMessage } from "@yinjie/i18n";

type DesktopContactTextEditDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  initialValue: string;
  submitLabel?: ReactNode;
  closeLabel?: string;
  pending?: boolean;
  /** 上一次 onConfirm 抛错时的提示。模板用法：把外部 mutation.error.message
   *  传进来，弹层内部把它渲染在确认按钮上方——保存失败时弹层不关，外面 section
   *  里的 ErrorBlock 会被弹层 backdrop 遮住，用户根本看不到失败原因。 */
  error?: ReactNode;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function DesktopContactTextEditDialog({
  open,
  title,
  description,
  placeholder,
  initialValue,
  submitLabel,
  closeLabel,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}: DesktopContactTextEditDialogProps) {
  const t = translateRuntimeMessage;
  const [draft, setDraft] = useState(initialValue);
  const titleId = useId();
  const descId = useId();
  // 走查新一轮 R26：和姊妹 desktop-chat-text-edit-dialog R2 / confirm-dialog
  // R4 同款问题——「保存」按钮 / form submit 都只靠 `disabled={confirmDisabled}`
  // 兜双触发，confirmDisabled = pending || draft 未变；pending 是 parent
  // updateProfileMutation.isPending 经 React commit 才进 DOM。用户开着「聊天
  // 信息」侧栏改备注 / 标签时同帧双 Enter / 双击「保存」会同时通过 disabled
  // = false → parent updateProfileMutation.mutateAsync 飞 2 次，公网隧道
  // RTT 600ms × 2 浪费一次 PATCH /friends/{id}/profile + 两次 invalidate
  // app-friends 串行打断。加 sync ref 锁同帧；pending 翻 false（success /
  // error）后 useEffect 复位。
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      submittingRef.current = false;
    }
  }, [pending]);

  // 走查电脑端单聊 R3：和姊妹 desktop-chat-text-edit-dialog R4 同款问题。
  // 原 effect deps=[initialValue, open]，凡 parent 重传 initialValue 都会
  // setDraft(initialValue) 覆盖用户当前正在编辑的内容。DirectChatDetailsPanel
  // 同时挂着 useEffect 把 friendship.remarkName / tags 同步进 profileForm，
  // friendsQuery 60s 轮询 / socket 改备注（多设备同步）/ pending 期间 user
  // 自己改完落库 invalidate 都让 friendship 重新换引用 → profileForm 跟着
  // 换 → dialog initialValue 跟着换 → 本 effect 跑 setDraft(initialValue)
  // 把用户输入到一半的草稿冲掉。改成"用户改过没"作 gate：用户敲过键盘后
  // hasUserEditedRef=true，后续 initialValue 变化跳过 setDraft；用户没碰过
  // 时 initialValue 变化允许 sync（兜底 dialog 打开瞬间 friendship 还没回
  // 来 remarkName=""，等 600ms RTT 拉到 server 值时仍能填上）。close 时 ref
  // 回 false 下次重开重新 seed。
  const hasUserEditedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hasUserEditedRef.current = false;
      return;
    }

    if (hasUserEditedRef.current) {
      return;
    }
    setDraft(initialValue);
  }, [initialValue, open]);
  const handleDraftChange = (value: string) => {
    hasUserEditedRef.current = true;
    setDraft(value);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      // 走查电脑端单聊 R4：和姊妹 desktop-chat-text-edit-dialog / confirm-dialog
      // 电脑端群聊 R5/R6 同款修过的——原版 pending 时直接 `event.key !== "Escape"
      // || pending` 早 return 让 Esc 透传，workspace queueMicrotask 兜底
      // (line 979-984) 看到 defaultPrevented=false 仍跑 dismissSidePanel 把
      //「聊天信息」侧栏偷关掉，本 dialog 因为 pending 不会真关，用户看到的是
      //「按 Esc 没关 dialog 倒把侧栏弄没了」。pending 期间仍 preventDefault +
      // stopPropagation 把 Esc 消费掉，让 workspace 不去 dismiss；mutation
      // 落地后用户可以再按 Esc 真关。
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  if (!open) {
    return null;
  }

  const normalizedDraft = draft.trim();
  const normalizedInitialValue = initialValue.trim();
  const confirmDisabled = pending || normalizedDraft === normalizedInitialValue;
  const effectiveSubmitLabel = submitLabel ?? t(msg`保存`);
  const effectiveCloseLabel = closeLabel ?? t(msg`关闭弹层`);

  return (
    // 走查新一轮 R12 (单聊路径下复用)：本 dialog 也被 desktop-chat-details-panel
    // 用于编辑联系人备注 / 标签。和姊妹 confirm/text-edit dialog 同款，缺
    // portal-shield → 用户在 dialog 内点输入框 / 取消 / X / backdrop 时
    // workspace pointerdown capture 把背后的「聊天信息」侧栏偷关掉。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
      data-yj-portal-shield="desktop-contact-text-edit-dialog"
    >
      <button
        type="button"
        aria-label={effectiveCloseLabel}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        // 走查电脑端单聊 R127：和姊妹 desktop-chat-text-edit-dialog R109 /
        // desktop-chat-confirm-dialog R107 / R107-R125 整套 backdrop 同款 ——
        // DesktopContactTextEditDialog 被 desktop-chat-details-panel (单聊「聊天
        // 信息」改备注/标签) + 联系人详情页改备注共用，backdrop <button>
        // (absolute inset-0) 视觉不可见、纯 mouse"点击背景关闭"affordance，
        // 但 DOM 顺序在 dialog 子树第一位。用户从「聊天信息」侧栏改备注/标签
        // 打开 dialog 后按 Tab → 焦点先落到这张不可见 backdrop → 看不到任何
        // focus ring → 再按 Enter dialog 秒关，用户半途打的备注/标签草稿丢。
        // Esc keydown 已挂 (line 86-114)；onClick 鼠标点击关闭路径不受影响。
        tabIndex={-1}
        className="absolute inset-0"
      />

      {/* 走查新一轮 R26：和姊妹 desktop-chat-text-edit-dialog / confirm-dialog
          R2 同款 a11y 缺漏——modal 但既没挂 role="dialog" + aria-modal，也没挂
          aria-labelledby / aria-describedby。单聊「聊天信息」改备注/标签 + 联系人
          详情改备注 都会弹这个 dialog；盲人用户屏幕阅读器只听到「关闭弹层 按钮」
          + 输入框，听不到 title「设置备注」/ description「备注名会优先显示...」。
          title/description 通过 useId 挂稳定 id，打开瞬间 SR 把两段都念出来。 */}
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-[520px] overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmDisabled || submittingRef.current) {
            return;
          }
          submittingRef.current = true;
          onConfirm(normalizedDraft);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] px-5 py-4">
          <div className="min-w-0">
            <div
              id={titleId}
              className="text-[17px] font-medium text-[color:var(--text-primary)]"
            >
              {title}
            </div>
            {description ? (
              <div
                id={descId}
                className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]"
              >
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t(msg`关闭`)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <TextField
            autoFocus
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            placeholder={placeholder}
            disabled={pending}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none"
          />

          <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
            <span>{t(msg`支持留空保存`)}</span>
            <span>{t(msg`${normalizedDraft.length} 字`)}</span>
          </div>

          {error ? <ErrorBlock message={error} /> : null}

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`取消`)}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={confirmDisabled}
              className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
            >
              {pending ? t(msg`正在保存...`) : effectiveSubmitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
