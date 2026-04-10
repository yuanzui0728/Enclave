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
            className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="font-semibold text-[color:var(--text-primary)]">{item.label}</div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{item.detail}</div>
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
            className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5"
          >
            <span className="text-[color:var(--text-muted)]">{row.label}</span>
            <span className="text-right text-[color:var(--text-primary)]">{row.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
