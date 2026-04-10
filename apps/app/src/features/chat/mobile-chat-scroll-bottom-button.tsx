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

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-full border border-black/8 bg-white/96 px-3 pl-2.5 text-[13px] text-[#111827] shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur active:bg-[#f5f5f5]"
      aria-label={pendingCount > 0 ? `查看 ${pendingCount} 条新消息` : "回到底部"}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#07c160] text-white">
        <ChevronDown size={14} />
      </span>
      <span>{pendingCount > 0 ? `${badgeLabel} 条新消息` : "回到底部"}</span>
    </button>
  );
}
