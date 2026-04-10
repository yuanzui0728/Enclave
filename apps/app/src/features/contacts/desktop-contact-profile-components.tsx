import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";

type DesktopContactProfileCardProps = {
  avatarName: string;
  avatarSrc?: string | null;
  title: string;
  subtitle?: string;
  meta?: string;
  badgeLabel?: string;
  description?: string;
  aside?: ReactNode;
  compact?: boolean;
};

export function DesktopContactProfileCard({
  avatarName,
  avatarSrc,
  title,
  subtitle,
  meta,
  badgeLabel,
  description,
  aside,
  compact = false,
}: DesktopContactProfileCardProps) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-black/6 bg-white">
      <div
        className={cn(
          "flex items-start justify-between gap-4",
          compact ? "px-4 py-4" : "px-6 py-6",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <AvatarChip
            name={avatarName}
            src={avatarSrc}
            size={compact ? "wechat" : "xl"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={cn(
                  "truncate font-medium text-[color:var(--text-primary)]",
                  compact ? "text-[18px]" : "text-[28px]",
                )}
              >
                {title}
              </h2>
              {badgeLabel ? (
                <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]">
                  {badgeLabel}
                </span>
              ) : null}
            </div>

            {subtitle ? (
              <div className="mt-1 text-[13px] text-[color:var(--text-secondary)]">
                {subtitle}
              </div>
            ) : null}
            {meta ? (
              <div className="mt-1 text-[12px] text-[color:var(--text-dim)]">
                {meta}
              </div>
            ) : null}
            {description ? (
              <p className="mt-3 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </section>
  );
}

export function DesktopContactProfileSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-black/6 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-black/6 px-4 py-2.5">
        <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
          {title}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function DesktopContactProfileInfoRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center gap-4 border-b border-black/6 px-4 py-3 text-sm last:border-b-0">
      <div className="w-20 shrink-0 text-[color:var(--text-muted)]">
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 break-words",
          muted
            ? "text-[color:var(--text-dim)]"
            : "text-[color:var(--text-primary)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function DesktopContactProfileActionRow({
  label,
  value,
  onClick,
  danger = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-12 w-full items-center gap-4 border-b border-black/6 px-4 py-3 text-left text-sm transition-colors last:border-b-0",
        danger ? "hover:bg-[rgba(220,38,38,0.04)]" : "hover:bg-[#fafafa]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      <div className="w-20 shrink-0 text-[color:var(--text-muted)]">
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 truncate",
          danger
            ? "text-[color:var(--state-danger-text)]"
            : "text-[color:var(--text-primary)]",
        )}
      >
        {value}
      </div>
      <ChevronRight
        size={16}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </button>
  );
}

export function DesktopContactProfileToggleRow({
  label,
  checked,
  disabled = false,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      className="flex min-h-12 w-full items-center gap-4 border-b border-black/6 px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
      role="switch"
      aria-checked={checked}
    >
      <div className="w-20 shrink-0 text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="flex flex-1 justify-end">
        <span
          className={cn(
            "relative h-7 w-11 rounded-full transition-colors",
            checked ? "bg-[#07c160]" : "bg-[#d8d8d8]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
              checked ? "left-4" : "left-0.5",
            )}
          />
        </span>
      </div>
    </button>
  );
}
