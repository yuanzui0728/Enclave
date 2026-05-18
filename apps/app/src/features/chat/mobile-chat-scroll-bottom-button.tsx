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
  const badgeLabel =
    pendingCount > 99 ? "99+" : pendingCount > 0 ? String(pendingCount) : null;
  const hasPending = pendingCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-white/96 px-3 pl-2.5 text-[12px] text-[#111827] shadow-[0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur active:bg-[color:var(--surface-card-hover)]"
      aria-label={
        pendingCount > 0
          ? // 走查 R2：原版 aria-label 用裸 pendingCount，pendingCount=250 时屏幕
            // 阅读器念「查看 250 条新消息」，但视觉上 badge 走 badgeLabel cap 成
            // "99+"——VoiceOver / TalkBack 用户听到的数字和看见的不一致。统一用
            // badgeLabel cap 后的值。
            t(msg`查看 ${badgeLabel ?? pendingCount} 条新消息`)
          : t(msg`回到底部`)
      }
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
        {pendingCount > 0
          ? t(msg`${badgeLabel ?? ""} 条新消息`)
          : t(msg`回到底部`)}
      </span>
    </button>
  );
}
