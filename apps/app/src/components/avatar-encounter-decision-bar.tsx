import { msg } from "@lingui/macro";
import { HeartHandshake, LoaderCircle, X } from "lucide-react";
import type {
  AvatarEncounterDecision,
  AvatarEncounterStatus,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

type AvatarEncounterDecisionBarProps = {
  // 已经做过的选择（来自 decisionResult / view.myDecision）；null = 还没决策。
  decision: AvatarEncounterDecision | null;
  // 当前相遇状态——决定显示「等待对方」还是「已匹配」。
  status: AvatarEncounterStatus;
  pending?: boolean;
  onWant: () => void;
  onSkip: () => void;
};

// 想要TA的联系方式 / 略过 决策条。一旦做过选择（decision 非空）就锁住，按 status
// 给出「已想要 · 等待对方」/「已想要 · 已匹配」/「已略过」的只读状态行。
export function AvatarEncounterDecisionBar({
  decision,
  status,
  pending,
  onWant,
  onSkip,
}: AvatarEncounterDecisionBarProps) {
  const t = useRuntimeTranslator();

  if (decision) {
    // 已决策：根据 want/skip + 终态给只读状态。matched 的联系方式披露由调用方单独渲染。
    // want 但已 closed（对方略过 / 对方退出社交）→ 明确「没匹配上」，别再说「等待对方」。
    const closedNoMatch =
      status === "closed_recipient_skipped" ||
      status === "closed_initiator_skipped";
    const label =
      decision === "want"
        ? status === "matched"
          ? t(msg`已想要 · 已匹配`)
          : closedNoMatch
            ? t(msg`想要了，但这次没匹配上`)
            : t(msg`已想要 · 等待对方`)
        : t(msg`已略过`);
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "rounded-[14px] px-4 py-3 text-center text-[length:var(--text-caption)] font-medium",
          decision === "want"
            ? "bg-[color:var(--brand-soft)] text-[color:var(--text-primary)]"
            : "bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]",
        )}
      >
        {label}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onSkip}
        disabled={pending}
        className={cn(
          "flex flex-1 items-center justify-center gap-1.5 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[length:var(--text-caption)] font-medium text-[color:var(--text-secondary)] transition-colors active:bg-black/[0.04]",
          pending && "opacity-60",
        )}
      >
        <X size={15} />
        {t(msg`略过`)}
      </button>
      <button
        type="button"
        onClick={onWant}
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn(
          "flex flex-[1.4] items-center justify-center gap-1.5 rounded-[14px] bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-primary))] px-3 py-2.5 text-[length:var(--text-caption)] font-semibold text-white transition-opacity active:opacity-90",
          pending && "opacity-70",
        )}
      >
        {pending ? (
          <LoaderCircle size={15} className="animate-spin" />
        ) : (
          <HeartHandshake size={15} />
        )}
        {t(msg`想要TA的联系方式`)}
      </button>
    </div>
  );
}
