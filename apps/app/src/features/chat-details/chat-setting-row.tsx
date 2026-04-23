import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

type ChatSettingRowProps = {
  label: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onToggle?: (checked: boolean) => void;
  className?: string;
  variant?: "default" | "wechat";
};

export function ChatSettingRow({
  label,
  value,
  onClick,
  danger = false,
  disabled = false,
  checked,
  onToggle,
  className,
  variant = "default",
}: ChatSettingRowProps) {
  const isSwitch = typeof checked === "boolean" && Boolean(onToggle);
  const interactive = isSwitch || Boolean(onClick);
  const isWechat = variant === "wechat";

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) {
          return;
        }
        if (isSwitch) {
          onToggle?.(!checked);
          return;
        }
        if (interactive) {
          onClick?.();
        }
      }}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left",
        danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]",
        disabled ? "opacity-60" : undefined,
        isWechat &&
          cn(
            "min-h-[46px] px-4",
            interactive &&
              !disabled &&
              "active:bg-[color:var(--surface-card-hover)]",
          ),
        className,
      )}
      role={isSwitch ? "switch" : undefined}
      aria-checked={isSwitch ? checked : undefined}
      aria-disabled={disabled}
    >
      <span className={cn("text-[16px]", isWechat && "text-[14px] text-[#111827]")}>
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value ? (
          <span
            className={cn(
              "max-w-[11rem] truncate text-[14px] text-[color:var(--text-muted)]",
              isWechat && "max-w-[12rem] text-[11px] text-[#8c8c8c]",
            )}
          >
            {value}
          </span>
        ) : null}
        {isSwitch ? (
          <span
            className={cn(
              "relative h-8 w-13 rounded-full border transition-colors",
              isWechat && "h-6 w-[42px]",
              checked
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
                : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition-transform",
                isWechat && "top-[1px] h-[22px] w-[22px]",
                checked
                  ? isWechat
                    ? "left-[18px]"
                    : "translate-x-6 left-1"
                  : "left-1 translate-x-0",
              )}
            />
          </span>
        ) : danger || !interactive ? null : (
          <ChevronRight
            size={18}
            className={cn(
              "text-[color:var(--text-dim)]",
              isWechat && "text-[#c7c7cc]",
            )}
          />
        )}
      </span>
    </button>
  );
}
