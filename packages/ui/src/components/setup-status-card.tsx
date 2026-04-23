import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";

type SetupStatusCardProps = {
  title: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  ok: boolean;
  readyLabel?: ReactNode;
  pendingLabel?: ReactNode;
  className?: string;
};

export function SetupStatusCard({
  title,
  value,
  detail,
  ok,
  readyLabel,
  pendingLabel,
  className,
}: SetupStatusCardProps) {
  return (
    <div
      className={
        className ??
        "rounded-[26px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.92))] p-4 shadow-[var(--shadow-soft)]"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[11px] ${ok ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}`}
        >
          {ok
            ? (readyLabel ?? <Trans>就绪</Trans>)
            : (pendingLabel ?? <Trans>待完善</Trans>)}
        </div>
      </div>
      <div className="mt-3 text-base font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
        {detail}
      </div>
    </div>
  );
}
