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
  description,
  statusLabel,
  statusTone,
  statusDetailLabel,
}: AdminTopbarProps) {
  return (
    <header className="rounded-[28px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-5 py-4 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">{eyebrow}</div>
      <div className="mt-2 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[color:var(--text-primary)]">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={
              statusTone === "healthy"
                ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"
                : statusTone === "warning"
                  ? "rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
                  : "rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1.5 text-xs text-[color:var(--text-muted)]"
            }
          >
            {statusLabel}
          </div>
          <div className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-3 py-1.5 text-xs text-[color:var(--text-muted)]">
            {statusDetailLabel ?? "面向运营的实例工作台"}
          </div>
        </div>
      </div>
    </header>
  );
}
