import type { ReactNode } from "react";
import { Card, MetricCard, SectionHeading, cn } from "@yinjie/ui";

export type AdminSectionNavItem = {
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
};

export type AdminInfoRowItem = {
  label: string;
  value: ReactNode;
};

type AdminCalloutTone = "warning" | "success" | "info" | "muted";

type AdminPageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  metrics?: Array<{ label: string; value: string | number }>;
  className?: string;
};

export function AdminPageHero({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  className,
}: AdminPageHeroProps) {
  return (
    <Card
      className={cn(
        "bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_42%,rgba(237,250,244,0.95))]",
        className,
      )}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">{eyebrow}</div>
          <h2 className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>

      {metrics?.length ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => (
            <MetricCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function AdminSectionNav({
  title = "段落导航",
  items,
}: {
  title?: string;
  items: AdminSectionNavItem[];
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-2 w-2 rounded-full bg-[color:var(--brand-primary)]/70" />
              <div>
                <div className="font-semibold text-[color:var(--text-primary)]">{item.label}</div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{item.detail}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function AdminInfoRows({
  title,
  rows,
}: {
  title: string;
  rows: AdminInfoRowItem[];
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3.5 py-3"
          >
            <span className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{row.label}</span>
            <span className="text-right text-sm font-medium text-[color:var(--text-primary)]">{row.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AdminCallout({
  title,
  description,
  tone = "muted",
  actions,
  className,
}: {
  title: string;
  description: ReactNode;
  tone?: AdminCalloutTone;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-4 py-4 shadow-[var(--shadow-soft)]",
        tone === "warning"
          ? "border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))]"
          : tone === "success"
            ? "border-emerald-200 bg-[linear-gradient(160deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))]"
            : tone === "info"
              ? "border-sky-200 bg-[linear-gradient(160deg,rgba(239,246,255,0.98),rgba(224,242,254,0.92))]"
              : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</div>
          <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-5 py-6 text-center shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="text-base font-semibold text-[color:var(--text-primary)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</div>
      {actions ? <div className="mt-4 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function AdminActionGroup({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{title}</div>
      {description ? (
        <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</div>
      ) : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function AdminDangerZone({
  title = "谨慎操作",
  description,
  children,
  className,
}: {
  title?: string;
  description: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))] p-4 shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-amber-700">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
