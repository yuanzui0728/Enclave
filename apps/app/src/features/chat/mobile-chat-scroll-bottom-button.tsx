import { ChevronDown } from "lucide-react";

type MobileChatScrollBottomButtonProps = {
  pendingCount?: number;
  onClick: () => void;
};

export function MobileChatScrollBottomButton({
  pendingCount = 0,
  onClick,
}: MobileChatScrollBottomButtonProps) {
  const badgeLabel =
    pendingCount > 99 ? "99+" : pendingCount > 0 ? String(pendingCount) : null;
  const hasPending = pendingCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-white/96 px-3 pl-2.5 text-[12px] text-[#111827] shadow-[0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur active:bg-[color:var(--surface-card-hover)]"
      aria-label={pendingCount > 0 ? `查看 ${pendingCount} 条新消息` : "回到底部"}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full ${
          hasPending
            ? "bg-[#07c160] text-white"
            : "bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]"
        }`}
      >
        <ChevronDown size={14} />
      </span>
      <span className={hasPending ? "text-[#15803d]" : undefined}>
        {pendingCount > 0 ? `${badgeLabel} 条新消息` : "回到底部"}
      </span>
    </button>
  );
}
