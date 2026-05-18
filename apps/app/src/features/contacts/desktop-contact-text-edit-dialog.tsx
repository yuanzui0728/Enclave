import { useEffect, useState, type ReactNode } from "react";
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

      // 弹窗是 modal 层；只 preventDefault 不 stopPropagation 的话，Esc
      // 会继续冒泡到 desktop-chat-workspace 的 dismissSidePanel window
      // keydown，一下 Esc 把背后的「聊天信息」侧栏也一起关掉。
      event.preventDefault();
      event.stopPropagation();
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
        className="absolute inset-0"
      />

      <form
        className="relative w-full max-w-[520px] overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmDisabled) {
            return;
          }

          onConfirm(normalizedDraft);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[17px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
            {description ? (
              <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
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
            onChange={(event) => setDraft(event.target.value)}
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
