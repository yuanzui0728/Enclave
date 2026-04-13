import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, TextField } from "@yinjie/ui";

type DesktopContactTextEditDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue: string;
  submitLabel?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function DesktopContactTextEditDialog({
  open,
  title,
  description,
  placeholder,
  initialValue,
  submitLabel = "保存",
  pending = false,
  onClose,
  onConfirm,
}: DesktopContactTextEditDialogProps) {
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
  const confirmDisabled = pending || normalizedDraft === normalizedInitialValue;

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
            aria-label="关闭"
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
            <span>支持留空保存</span>
            <span>{normalizedDraft.length} 字</span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={pending}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={confirmDisabled}
              className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
            >
              {pending ? "正在保存..." : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
