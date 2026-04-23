import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";

export function DesktopContactPaneEmptyState() {
  return (
    <div className="flex h-full items-center justify-center bg-[#f5f5f5] px-10">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="flex h-18 w-18 items-center justify-center rounded-[20px] border border-[rgba(0,0,0,0.06)] bg-white text-xl text-[color:var(--text-dim)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          ···
        </div>
        <div className="mt-4 text-[16px] font-medium text-[color:var(--text-primary)]">
          选择联系人
        </div>
        <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
          从左侧通讯录选择好友后，这里会显示联系人资料、内容入口和管理操作。
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
    <div className="flex h-full overflow-auto bg-[#f5f5f5]">
      <div
        className={cn(
          "mx-auto flex min-h-full w-full max-w-[560px] flex-col bg-[#f5f5f5] px-6 py-10",
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
  subline,
  identifier,
  action,
  compact = false,
}: {
  avatar?: string | null;
  name: string;
  displayName: string;
  subline?: string;
  identifier?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        compact ? "px-4 py-5" : "px-8 py-8",
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center text-center",
          compact ? "gap-3" : "gap-4",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col items-center",
            compact ? "gap-3" : "gap-4",
          )}
        >
          <AvatarChip
            name={name}
            src={avatar}
            size={compact ? "wechat" : "xl"}
          />
          <div className="min-w-0">
            <h2
              className={cn(
                "truncate font-medium text-[color:var(--text-primary)]",
                compact ? "text-[20px]" : "text-[24px]",
              )}
            >
              {displayName}
            </h2>
            {subline ? (
              <div className="mt-1 truncate text-[13px] text-[color:var(--text-secondary)]">
                {subline}
              </div>
            ) : null}
            {identifier ? (
              <div className="mt-2 truncate text-[12px] text-[color:var(--text-dim)]">
                隐界号：{identifier}
              </div>
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
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="mt-3 overflow-hidden rounded-[18px] border border-[rgba(0,0,0,0.06)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] first:mt-0">
      <div className="flex items-center justify-between gap-3 px-5 pb-1.5 pt-4">
        <div className="text-[12px] font-medium text-[color:var(--text-muted)]">
          {title}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function DesktopContactProfileRow({
  label,
  value,
  muted = false,
  multiline = false,
}: {
  label: ReactNode;
  value: ReactNode;
  muted?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="flex min-h-13 items-start gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-3 text-sm last:border-b-0">
      <div className="w-22 shrink-0 pt-0.5 text-[13px] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          multiline ? "whitespace-pre-wrap break-words leading-6" : "truncate",
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

export function DesktopContactProfileToggleRow({
  label,
  checked,
  disabled = false,
  onToggle,
}: {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      className="flex min-h-13 w-full items-center gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-3 text-left text-sm transition-colors hover:bg-[rgba(0,0,0,0.02)] disabled:opacity-60 last:border-b-0"
      role="switch"
      aria-checked={checked}
    >
      <div className="w-22 shrink-0 text-[13px] text-[color:var(--text-primary)]">
        {label}
      </div>
      <div className="flex flex-1 justify-end">
        <span
          className={cn(
            "relative h-6 w-10 rounded-full transition-colors",
            checked
              ? "bg-[color:var(--brand-primary)]"
              : "bg-[#d8d8d8]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-transform",
              checked ? "left-[18px]" : "left-0.5",
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
  valueMuted = false,
}: {
  label: ReactNode;
  value: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  valueMuted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-13 w-full items-center gap-4 border-b border-[rgba(0,0,0,0.06)] px-5 py-3 text-left text-sm transition-colors last:border-b-0",
        danger
          ? "hover:bg-[rgba(239,68,68,0.05)]"
          : "hover:bg-[rgba(0,0,0,0.02)]",
        disabled && "opacity-60",
      )}
    >
      <div className="w-22 shrink-0 text-[13px] text-[color:var(--text-primary)]">
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 truncate",
          danger
            ? "text-[color:var(--state-danger-text)]"
            : valueMuted
              ? "text-[color:var(--text-dim)]"
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
