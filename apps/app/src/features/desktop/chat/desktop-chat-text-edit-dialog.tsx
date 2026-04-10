import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, TextAreaField, TextField } from "@yinjie/ui";

type DesktopChatTextEditDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue: string;
  submitLabel?: string;
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
  submitLabel = "保存",
  multiline = false,
  emptyAllowed = false,
  pending = false,
  onClose,
  onConfirm,
}: DesktopChatTextEditDialogProps) {
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

      event.preventDefault();
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
  const confirmDisabled =
    pending ||
    (!emptyAllowed && normalizedDraft.length === 0) ||
    normalizedDraft === normalizedInitialValue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={`关闭${title}弹层`}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <form
        className="relative w-full max-w-[560px] overflow-hidden rounded-[18px] border border-black/8 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmDisabled) {
            return;
          }

          onConfirm(normalizedDraft);
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 bg-[#f7f7f7] px-6 py-4">
          <div className="min-w-0">
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-black/6 bg-white text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-6">
          {multiline ? (
            <TextAreaField
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              rows={6}
              disabled={pending}
              className="min-h-[180px] resize-none rounded-[12px] border-black/8 bg-white shadow-none"
            />
          ) : (
            <TextField
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              disabled={pending}
              className="rounded-[10px] border-black/8 bg-white shadow-none"
            />
          )}

          <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
            <span>{emptyAllowed ? "可留空保存" : "内容不能为空"}</span>
            <span>{normalizedDraft.length} 字</span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-[10px] border-black/8 bg-white px-6 shadow-none hover:bg-[#efefef]"
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={confirmDisabled}
              className="rounded-[10px] bg-[#07c160] px-6 text-white hover:bg-[#06ad56]"
            >
              {pending ? "正在保存..." : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
