import { useEffect } from "react";

type ConsoleConfirmDialogProps = {
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

export function ConsoleConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  pendingLabel = "Working...",
  danger = false,
  pending = false,
  onClose,
  onConfirm,
}: ConsoleConfirmDialogProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.42)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={`Close ${title} dialog`}
        className="absolute inset-0"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
      />

      <div className="relative w-full max-w-[520px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] shadow-[var(--shadow-overlay)]">
        <div className="border-b border-[color:var(--border-faint)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                {title}
              </div>
              <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                {description}
              </div>
            </div>

            <button
              type="button"
              aria-label="Close"
              disabled={pending}
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              danger
                ? "bg-[#b9382f] text-white hover:bg-[#a4322a]"
                : "bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            }`}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
