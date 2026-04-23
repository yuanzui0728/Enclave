import { LanguageSwitcher } from "@yinjie/i18n";

type AdminTopbarProps = {
  eyebrow: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: "healthy" | "warning" | "muted";
  statusDetailLabel?: string;
};

export function AdminTopbar({
  eyebrow,
  title,
  statusLabel,
  statusTone,
  statusDetailLabel,
}: Omit<AdminTopbarProps, "description">) {
  return (
    <header className="rounded-[28px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-5 py-3 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            {eyebrow}
          </div>
          <h1 className="mt-0.5 text-xl font-semibold text-[color:var(--text-primary)]">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LanguageSwitcher variant="compact" description={null} />
          <div
            className={
              statusTone === "healthy"
                ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                : statusTone === "warning"
                  ? "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                  : "rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1 text-xs text-[color:var(--text-muted)]"
            }
          >
            {statusLabel}
          </div>
          <div className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
            {statusDetailLabel ?? "运营工作台"}
          </div>
        </div>
      </div>
    </header>
  );
}
