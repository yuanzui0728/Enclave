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
    <div className="fixed inset-0 z-50 bg-[rgba(17,24,39,0.22)] backdrop-blur-[2px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭操作菜单"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[18px] bg-[#ededed] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 shadow-[0_-14px_32px_rgba(15,23,42,0.12)]">
        <div className="mb-2 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-black/10" />
        </div>

        <div className="overflow-hidden rounded-[14px] border border-black/6 bg-white">
          <div className="border-b border-black/6 px-5 py-4 text-center">
            <div className="text-[13px] font-medium text-[#111827]">{title}</div>
            {description ? (
              <div className="mt-1 text-[12px] leading-5 text-[#8c8c8c]">
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
              className={`flex min-h-[56px] w-full flex-col items-center justify-center px-5 py-3 text-center transition active:bg-[#f7f7f7] ${
                index > 0 ? "border-t border-black/6" : ""
              } ${action.danger ? "text-[#d74b45]" : "text-[#111827]"} ${
                action.disabled ? "opacity-45" : ""
              }`}
            >
              <span className="text-[17px] leading-6">{action.label}</span>
              {action.description ? (
                <span
                  className={`mt-0.5 text-[12px] leading-5 ${
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
          className="mt-3 flex h-12 w-full items-center justify-center rounded-[14px] border border-black/6 bg-white text-[17px] font-medium text-[#111827] transition active:bg-[#f7f7f7]"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
