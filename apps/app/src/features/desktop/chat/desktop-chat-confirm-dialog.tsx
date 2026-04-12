import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@yinjie/ui";

type DesktopChatConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pendingLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DesktopChatConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  pendingLabel = "处理中...",
  danger = false,
  pending = false,
  onClose,
  onConfirm,
}: DesktopChatConfirmDialogProps) {
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

      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
            <div className="mt-2 text-[13px] leading-7 text-[color:var(--text-muted)]">
              {description}
            </div>
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

        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
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
            type="button"
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={pending}
            className={
              danger
                ? "rounded-[10px] bg-[#e14c45] px-6 text-white hover:bg-[#cf433d]"
                : "rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
            }
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
