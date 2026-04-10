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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,18,14,0.38)] p-6 backdrop-blur-[4px]">
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

      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.30)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={pending}
            className="rounded-2xl px-6"
          >
            取消
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={pending}
            className="rounded-2xl px-6"
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
