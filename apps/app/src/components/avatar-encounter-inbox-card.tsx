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

const PILL_MATCHED: StatusPill = {
  label: msg`已匹配`,
  className: "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]",
};
const PILL_MUTED = (label: MessageDescriptor): StatusPill => ({
  label,
  className: "bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]",
});

// 同一 status 对发起方 / 被发起方含义不同，按 role 给文案：
// - matched：双方都想要 → 已匹配（两侧一致）
// - awaiting_recipient：recipient 还没决策→待查看；initiator 已想要、在等对方→等待对方
// - closed_recipient_skipped：recipient 自己略过→已略过；initiator 被对方略过→对方略过
function resolveStatusPill(
  status: AvatarEncounterStatus,
  role: AvatarEncounterInboxItem["role"],
): StatusPill {
  if (status === "matched") {
    return PILL_MATCHED;
  }
  if (status === "awaiting_recipient") {
    return role === "recipient"
      ? {
          label: msg`待查看`,
          className: "bg-[color:var(--state-info-bg)] text-[color:var(--state-info-text)]",
        }
      : {
          label: msg`等待对方`,
          className: "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
        };
  }
  if (status === "closed_recipient_skipped") {
    return role === "recipient" ? PILL_MUTED(msg`已略过`) : PILL_MUTED(msg`对方略过`);
  }
  return PILL_MUTED(msg`已结束`);
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
  const pill = resolveStatusPill(item.status, item.role);
  // matchReason 太长就截断当一句话摘要；空就退到脚本 summary。
  const snippet = item.matchReason?.trim() || item.summary?.trim() || "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3.5 py-3 text-left transition-colors active:bg-black/[0.04]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
        <UserRound size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
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
          <div className="mt-0.5 truncate text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
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
