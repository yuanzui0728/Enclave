import { msg } from "@lingui/macro";
import { ChevronRight, UserRound } from "lucide-react";
import type {
  AvatarEncounterInboxItem,
  AvatarEncounterStatus,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

type MessageDescriptor = Parameters<ReturnType<typeof useRuntimeTranslator>>[0];

type StatusPill = {
  label: MessageDescriptor;
  className: string;
};

// 收件箱卡是「别人发起、等我看」的视角（recipient）。status 映射到一个小标签：
// - awaiting_recipient = 还没看 → 待查看
// - matched = 双方都想要 → 已匹配
// - awaiting_initiator = 我已想要、在等对方 → 已想要
// - closed_recipient_skipped = 我略过了 → 已略过
// generating / failed / closed_initiator_skipped 走兜底（一般不会进 recipient 收件箱，
// 但 closed_initiator_skipped 表示对方撤回，给「已结束」兜底）。
function resolveStatusPill(status: AvatarEncounterStatus): StatusPill {
  switch (status) {
    case "matched":
      return {
        label: msg`已匹配`,
        className: "bg-[rgba(244,63,94,0.12)] text-[#f43f5e]",
      };
    case "awaiting_initiator":
      return {
        label: msg`已想要`,
        className: "bg-[color:var(--brand-soft)] text-[#b45309]",
      };
    case "closed_recipient_skipped":
      return {
        label: msg`已略过`,
        className: "bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]",
      };
    case "closed_initiator_skipped":
      return {
        label: msg`已结束`,
        className: "bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]",
      };
    case "awaiting_recipient":
    default:
      return {
        label: msg`待查看`,
        className: "bg-[rgba(96,165,250,0.16)] text-[#2563eb]",
      };
  }
}

type AvatarEncounterInboxCardProps = {
  item: AvatarEncounterInboxItem;
  onClick: () => void;
};

export function AvatarEncounterInboxCard({
  item,
  onClick,
}: AvatarEncounterInboxCardProps) {
  const t = useRuntimeTranslator();
  const pill = resolveStatusPill(item.status);
  // matchReason 太长就截断当一句话摘要；空就退到脚本 summary。
  const snippet = item.matchReason?.trim() || item.summary?.trim() || "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3.5 py-3 text-left transition-colors active:bg-black/[0.04]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(244,63,94,0.1)] text-[#f43f5e]">
        <UserRound size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
            {item.partnerNickname}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              pill.className,
            )}
          >
            {t(pill.label)}
          </span>
        </div>
        {snippet ? (
          <div className="mt-0.5 truncate text-[12px] leading-5 text-[color:var(--text-secondary)]">
            {snippet}
          </div>
        ) : null}
      </div>
      <ChevronRight
        size={15}
        className="shrink-0 text-[color:var(--text-dim)]"
        aria-hidden="true"
      />
    </button>
  );
}
