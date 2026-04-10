export type MobileMessageReminderOption = {
  id: string;
  label: string;
  detail: string;
  remindAt: string;
};

type MobileMessageReminderSheetProps = {
  open: boolean;
  title?: string;
  previewText?: string;
  options: MobileMessageReminderOption[];
  onClose: () => void;
  onSelect: (option: MobileMessageReminderOption) => void;
};

export function MobileMessageReminderSheet({
  open,
  title = "提醒这条消息",
  previewText,
  options,
  onClose,
  onSelect,
}: MobileMessageReminderSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.18)]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭消息提醒面板"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[18px] bg-[#f2f2f2] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-16px_36px_rgba(15,23,42,0.14)]">
        <div className="px-1 pb-3">
          <div className="text-center text-[13px] text-[#8c8c8c]">{title}</div>
          {previewText ? (
            <div className="mt-2 line-clamp-2 rounded-[14px] bg-white px-3 py-2 text-[13px] leading-5 text-[#4b5563]">
              {previewText}
            </div>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-[14px] bg-white">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option)}
              className="flex w-full items-center justify-between gap-3 border-b border-black/6 px-4 py-3 text-left last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-[16px] text-[#111827]">{option.label}</div>
                <div className="mt-1 text-[12px] text-[#8c8c8c]">
                  {option.detail}
                </div>
              </div>
              <div className="shrink-0 text-[12px] text-[#07c160]">
                设为提醒
              </div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-[14px] bg-white text-[17px] font-medium text-[#111827]"
        >
          取消
        </button>
      </div>
    </div>
  );
}
