import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { X } from "lucide-react";
import { Button, TextAreaField, TextField } from "@yinjie/ui";
import { translateRuntimeMessage } from "@yinjie/i18n";

type DesktopChatTextEditDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  initialValue: string;
  submitLabel?: ReactNode;
  closeLabel?: string;
  multiline?: boolean;
  emptyAllowed?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function DesktopChatTextEditDialog({
  open,
  title,
  description,
  placeholder,
  initialValue,
  submitLabel,
  closeLabel,
  multiline = false,
  emptyAllowed = false,
  pending = false,
  onClose,
  onConfirm,
}: DesktopChatTextEditDialogProps) {
  const t = translateRuntimeMessage;
  const [draft, setDraft] = useState(initialValue);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(initialValue);
  }, [initialValue, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) {
        return;
      }

      // 与 desktop-chat-confirm-dialog 同：Esc 关弹窗就够了，再让它冒泡到
      // workspace 的 dismissSidePanel 会同时关掉背后的详情侧栏。
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  // 走查桌面端群聊 R2：和 DesktopChatConfirmDialog R4 同款问题——「保存」按钮
  // / Enter 提交都只靠 `disabled={confirmDisabled}`，confirmDisabled 含
  // `pending`，pending 是 parent useMutation.isPending React state，要等 commit
  // 才进 DOM。同帧双击 / 双 Enter 都看到 false → parent updateGroupMutation /
  // updateNicknameMutation.mutate() 飞 2 次。updateGroup PATCH 服务端虽幂等
  // 不会改坏数据但浪费公网 RTT；onConfirm 闭包里同时 invalidate 多份 cache，
  // 第二次 invalidate 撞上正在跑的第一次会强行打断、再触发一次额外 GET。
  // 加 sync ref 锁同帧；pending 翻 false（success/error）后 useEffect 复位。
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      submittingRef.current = false;
    }
  }, [pending]);

  if (!open) {
    return null;
  }

  const normalizedDraft = draft.trim();
  const normalizedInitialValue = initialValue.trim();
  const confirmDisabled =
    pending ||
    (!emptyAllowed && normalizedDraft.length === 0) ||
    normalizedDraft === normalizedInitialValue;
  const handleConfirm = () => {
    if (confirmDisabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    onConfirm(normalizedDraft);
  };
  const effectiveSubmitLabel = submitLabel ?? t(msg`保存`);
  const effectiveCloseLabel = closeLabel ?? t(msg`关闭弹层`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={effectiveCloseLabel}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      {/* 走查 R2：和姊妹 feature-unavailable-dialog / mobile-message-reminder-sheet
          等修过的 a11y 缺漏同款——这是个 modal（backdrop 关闭 / 屏幕居中 /
          Esc 关），但 panel 既没挂 role="dialog" + aria-modal，也没挂
          aria-labelledby / aria-describedby。单聊「聊天信息」改备注/标签时
          会弹这个 dialog，盲人用户屏幕阅读器只听到「关闭提示 按钮」+ 输入框，
          听不到 title 「设置备注」/ description「备注名会优先显示在聊天信息
          和通讯录里」。补 dialog 语义；title/description 通过 useId 挂出
          稳定 id，打开瞬间 SR 把两段都念出来。 */}
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-[560px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
        onSubmit={(event) => {
          event.preventDefault();
          handleConfirm();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
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

        <div className="space-y-4 bg-[rgba(255,255,255,0.62)] px-6 py-6">
          {multiline ? (
            <TextAreaField
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              rows={6}
              disabled={pending}
              className="min-h-[180px] resize-none rounded-[12px] border-[color:var(--border-faint)] bg-white shadow-none"
            />
          ) : (
            <TextField
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none"
            />
          )}

          <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
            <span>
              {emptyAllowed ? t(msg`可留空保存`) : t(msg`内容不能为空`)}
            </span>
            <span>{t(msg`${normalizedDraft.length} 字`)}</span>
          </div>

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
