import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import { LanguageSwitcher, translateRuntimeMessage } from "@yinjie/i18n";

type AdminTopbarProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  statusLabel: ReactNode;
  statusTone: "healthy" | "warning" | "muted";
  statusDetailLabel?: ReactNode;
};

export function AdminTopbar({
  eyebrow,
  title,
  statusLabel,
  statusTone,
  statusDetailLabel,
}: Omit<AdminTopbarProps, "description">) {
  const t = translateRuntimeMessage;

  return (
    <header className="rounded-[28px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-5 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            {eyebrow}
          </div>
          <h1 className="mt-0.5 break-words text-xl font-semibold text-[color:var(--text-primary)]">
            {title}
          </h1>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
          <LanguageSwitcher variant="compact" description={null} />
          <div
            className={
              statusTone === "healthy"
                ? "max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-center text-xs font-medium text-emerald-700"
                : statusTone === "warning"
                  ? "max-w-full rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-center text-xs font-medium text-amber-700"
                  : "max-w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1 text-center text-xs text-[color:var(--text-muted)]"
            }
          >
            {statusLabel}
          </div>
          <div className="max-w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1 text-center text-xs text-[color:var(--text-muted)]">
            {statusDetailLabel ?? t(msg`运营工作台`)}
          </div>
        </div>
      </div>
    </header>
  );
}
