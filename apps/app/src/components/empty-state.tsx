import type { ReactNode } from "react";
import { AppSection } from "@yinjie/ui";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <AppSection className="rounded-[16px] border-[color:var(--border-faint)] bg-[color:var(--surface-section)] px-6 py-9 text-center shadow-none">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(7,193,96,0.06)] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#15803d]">
        空
      </div>
      <div className="mt-5 text-lg font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-3 max-w-[28rem] text-sm leading-7 text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </AppSection>
  );
}
