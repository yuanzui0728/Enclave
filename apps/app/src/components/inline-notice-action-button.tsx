type InlineNoticeActionButtonProps = {
  label?: string;
  onClick: () => void;
  className?: string;
};

export function InlineNoticeActionButton({
  label = "去设置",
  onClick,
  className,
}: InlineNoticeActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border border-current/18 bg-white/80 px-2.5 py-1 text-[10px] font-medium leading-none transition active:scale-[0.98] ${className ?? ""}`}
    >
      {label}
    </button>
  );
}
