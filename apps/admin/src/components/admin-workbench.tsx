import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  MetricCard,
  SectionHeading,
  SelectField,
  StatusPill,
  TextAreaField,
  TextField,
  ToggleChip,
  cn,
} from "@yinjie/ui";

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

type AdminWorkbenchLink = "/" | "/setup" | "/characters" | "/evals" | "/reply-logic";

type AdminCalloutTone = "warning" | "success" | "info" | "muted";
type AdminActionFeedbackTone = "busy" | "success" | "warning" | "info";

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

export function AdminSubpanel({
  title,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("bg-[color:var(--surface-card)]", className)}>
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      <div className={cn("mt-4", contentClassName)}>{children}</div>
    </Card>
  );
}

export function AdminMiniPanel({
  title,
  children,
  className,
  contentClassName,
  tone = "card",
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  tone?: "card" | "soft";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--border-faint)] p-3",
        tone === "soft" ? "bg-[color:var(--surface-soft)]" : "bg-[color:var(--surface-card)]",
        className,
      )}
    >
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      <div className={cn("mt-2", contentClassName)}>{children}</div>
    </div>
  );
}

export function AdminDetailPanel({
  title,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 text-sm text-[color:var(--text-secondary)]",
        className,
      )}
    >
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      <div className={cn("mt-4", contentClassName)}>{children}</div>
    </div>
  );
}

export function AdminMetaText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]", className)}>
      {children}
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

export function AdminActionFeedback({
  tone,
  title,
  description,
  className,
}: {
  tone: AdminActionFeedbackTone;
  title: string;
  description: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3 shadow-[var(--shadow-soft)]",
        tone === "busy"
          ? "border-sky-200 bg-[linear-gradient(160deg,rgba(239,246,255,0.98),rgba(224,242,254,0.92))]"
          : tone === "success"
            ? "border-emerald-200 bg-[linear-gradient(160deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))]"
            : tone === "warning"
              ? "border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))]"
              : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
        className,
      )}
    >
      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</div>
    </div>
  );
}

export function AdminStatusCard({
  title,
  description,
  tone,
  statusLabel,
}: {
  title: string;
  description: ReactNode;
  tone: "healthy" | "warning" | "muted";
  statusLabel: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-[color:var(--text-primary)]">{title}</div>
        <StatusPill tone={tone}>{statusLabel}</StatusPill>
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{description}</div>
    </div>
  );
}

export function AdminJumpCard({
  to,
  title,
  detail,
  emphasis = "secondary",
  disabled,
}: {
  to: AdminWorkbenchLink;
  title: string;
  detail: ReactNode;
  emphasis?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <Link to={to} disabled={disabled} className={disabled ? "pointer-events-none opacity-50" : "block"}>
      <div className="h-full rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-[color:var(--text-primary)]">{title}</div>
            <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{detail}</div>
          </div>
          <StatusPill tone={emphasis === "primary" ? "healthy" : "muted"}>
            {emphasis === "primary" ? "优先" : "入口"}
          </StatusPill>
        </div>
      </div>
    </Link>
  );
}

export function AdminHintCard({
  title,
  detail,
}: {
  title: string;
  detail: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
      <div className="font-semibold text-[color:var(--text-primary)]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">{detail}</div>
    </div>
  );
}

export function AdminFormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5 first:border-t-0 first:pt-0">
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      {children}
    </section>
  );
}

export function AdminValueCard({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-[color:var(--border-faint)] bg-white/70 px-3 py-3",
        className,
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{value}</div>
    </div>
  );
}

export function AdminToggle({
  label,
  checked,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <ToggleChip label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </div>
  );
}

export function AdminPillTextField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <TextField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]",
        className,
      )}
    />
  );
}

export function AdminPillSelectField({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SelectField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]",
        className,
      )}
    >
      {children}
    </SelectField>
  );
}

export function AdminInlineTextField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <TextField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn("rounded-2xl", className)}
    />
  );
}

export function AdminInlineSelectField({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SelectField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-primary)]",
        className,
      )}
    >
      {children}
    </SelectField>
  );
}

export function AdminTextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  list,
  disabled,
  className,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  list?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <TextField
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        min={min}
        max={max}
        list={list}
        disabled={disabled}
      />
    </label>
  );
}

export function AdminTextArea({
  label,
  value,
  onChange,
  placeholder,
  className,
  textareaClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <TextAreaField
        className={textareaClassName ?? "min-h-28"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function AdminSelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <SelectField value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}

export function AdminCodeBlock({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <pre
      className={[
        "overflow-x-auto whitespace-pre-wrap break-words rounded-[20px] border border-[color:var(--border-faint)] bg-white/90 p-4 text-xs leading-6 text-[color:var(--text-secondary)]",
        className ?? "",
      ].join(" ")}
    >
      {value}
    </pre>
  );
}
