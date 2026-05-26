import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ChevronDown } from "lucide-react";

const t = translateRuntimeMessage;

type MobileChatScrollBottomButtonProps = {
  pendingCount?: number;
  onClick: () => void;
};

export function MobileChatScrollBottomButton({
  pendingCount = 0,
  onClick,
}: MobileChatScrollBottomButtonProps) {
  const hasPending = pendingCount > 0;
  // 走查 R2：visual badge 用 cap 过的值（"99+"），SR 也念同一个值，听见/看见对齐。
  const badgeLabel =
    pendingCount > 99 ? "99+" : pendingCount > 0 ? String(pendingCount) : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-white/96 px-3 pl-2.5 text-[12px] text-[color:var(--text-primary)] shadow-[0_8px_18px_rgba(180, 130, 20, 0.12)] backdrop-blur active:bg-[color:var(--surface-card-hover)]"
      aria-label={
        hasPending
          ? t(msg`查看 ${badgeLabel} 条新消息`)
          : t(msg`回到底部`)
      }
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full ${
          hasPending
            ? "bg-[#f59e0b] text-[#3b2206]"
            : "bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]"
        }`}
      >
        <ChevronDown size={14} />
      </span>
      <span className={hasPending ? "text-[#b45309]" : undefined}>
        {hasPending ? t(msg`${badgeLabel} 条新消息`) : t(msg`回到底部`)}
      </span>
    </button>
  );
}
