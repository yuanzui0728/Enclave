type MobileDetailsActionSheetAction = {
  key: string;
  label: string;
  description?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type MobileDetailsActionSheetProps = {
  open: boolean;
  title: string;
  description?: string;
  actions: MobileDetailsActionSheetAction[];
  cancelLabel?: string;
  onClose: () => void;
};

export function MobileDetailsActionSheet({
  open,
  title,
  description,
  actions,
  cancelLabel = "取消",
  onClose,
}: MobileDetailsActionSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭操作菜单"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[18px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-1.5 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]">
        <div className="flex justify-center pb-1">
          <div className="h-1 w-9 rounded-full bg-[rgba(148,163,184,0.45)]" />
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
          <div className="border-b border-[color:var(--border-subtle)] px-5 py-2.5 text-center">
            <div className="text-[14px] font-medium text-[#111827]">{title}</div>
            {description ? (
              <div className="mt-0.5 text-[11px] leading-[18px] text-[#8c8c8c]">
                {description}
              </div>
            ) : null}
          </div>

          {actions.map((action, index) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className={`flex min-h-[48px] w-full flex-col items-center justify-center px-5 py-2 text-center transition active:bg-[color:var(--surface-card-hover)] ${
                index > 0 ? "border-t border-[color:var(--border-subtle)]" : ""
              } ${action.danger ? "text-[#d74b45]" : "text-[#111827]"} ${
                action.disabled ? "opacity-45" : ""
              }`}
            >
              <span className="text-[15px] leading-6">{action.label}</span>
              {action.description ? (
                <span
                  className={`mt-0.5 text-[11px] leading-[18px] ${
                    action.danger ? "text-[#e28a84]" : "text-[#8c8c8c]"
                  }`}
                >
                  {action.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex h-10 w-full items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-white text-[15px] font-medium text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
