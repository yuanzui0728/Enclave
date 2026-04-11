import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";

export function DesktopContactPaneEmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-[rgba(245,247,247,0.96)] px-10">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-[color:var(--border-faint)] bg-white text-2xl text-[color:var(--text-dim)] shadow-[var(--shadow-section)]">
          ···
        </div>
        <div className="mt-5 text-[16px] font-medium text-[color:var(--text-primary)]">
          选择联系人
        </div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
          从左侧通讯录选择好友后，这里会显示微信电脑端风格的联系人资料与常用操作。
        </p>
      </div>
    </div>
  );
}

export function DesktopContactProfileShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex h-full overflow-auto bg-[rgba(245,247,247,0.96)]">
      <div
        className={cn(
          "mx-auto my-5 flex w-full max-w-[720px] flex-col overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DesktopContactProfileHeader({
  avatar,
  name,
  displayName,
  badge,
  subline,
  identifier,
  signature,
  action,
  compact = false,
}: {
  avatar?: string | null;
  name: string;
  displayName: string;
  badge?: string;
  subline?: string;
  identifier?: string;
  signature?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(244,251,247,0.92),rgba(255,255,255,0.98))]",
        compact ? "px-4 py-4" : "px-8 py-7",
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4",
          compact && "items-center",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <AvatarChip
            name={name}
            src={avatar}
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
                {displayName}
              </h2>
              {badge ? (
                <span className="rounded-full border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-2.5 py-0.5 text-[11px] text-[color:var(--text-secondary)]">
                  {badge}
                </span>
              ) : null}
            </div>
            {subline ? (
              <div className="mt-1 truncate text-sm text-[color:var(--text-secondary)]">
                {subline}
              </div>
            ) : null}
            {identifier ? (
              <div className="mt-1 truncate text-[13px] text-[color:var(--text-dim)]">
                隐界号：{identifier}
              </div>
            ) : null}
            {signature ? (
              <p
                className={cn(
                  "text-sm leading-6 text-[color:var(--text-secondary)]",
                  compact ? "mt-2" : "mt-3",
                )}
              >
                {signature}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function DesktopContactProfileSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-b border-[color:var(--border-faint)] last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-8 pb-2 pt-5">
        <div className="text-[12px] font-medium tracking-[0.08em] text-[color:var(--text-dim)]">
          {title}
        </div>
        {action}
      </div>
      <div className="pb-2">{children}</div>
    </section>
  );
}

export function DesktopContactProfileRow({
  label,
  value,
  muted = false,
  multiline = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 px-8 py-3 text-sm">
      <div className="w-24 shrink-0 pt-0.5 text-[color:var(--text-dim)]">
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          multiline ? "whitespace-pre-wrap break-words leading-6" : "truncate",
          muted ? "text-[color:var(--text-dim)]" : "text-[color:var(--text-primary)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function DesktopContactProfileEditableField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-4 px-8 py-3">
      <div className="w-24 shrink-0 text-sm text-[color:var(--text-dim)]">
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3.5 py-2.5 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)] focus:bg-white"
      />
    </label>
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
      className="flex w-full items-center gap-4 px-8 py-3 text-left text-sm transition-colors hover:bg-[rgba(7,193,96,0.06)] disabled:opacity-60"
      role="switch"
      aria-checked={checked}
    >
      <div className="w-24 shrink-0 text-[color:var(--text-dim)]">{label}</div>
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
        "flex w-full items-center gap-4 px-8 py-3 text-left text-sm transition-colors",
        danger
          ? "hover:bg-[rgba(239,68,68,0.05)]"
          : "hover:bg-[rgba(7,193,96,0.06)]",
        disabled && "opacity-60",
      )}
    >
      <div className="w-24 shrink-0 text-[color:var(--text-dim)]">{label}</div>
      <div
        className={cn(
          "min-w-0 flex-1 truncate",
          danger
            ? "text-[color:var(--state-danger-text)]"
            : "text-[color:var(--text-primary)]",
          disabled && "text-[color:var(--text-dim)]",
        )}
      >
        {value}
      </div>
      <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
    </button>
  );
}
