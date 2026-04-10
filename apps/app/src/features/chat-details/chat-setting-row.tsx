import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

type ChatSettingRowProps = {
  label: string;
  value?: string;
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
            "min-h-[52px] px-4",
            interactive && !disabled && "hover:bg-[#fafafa]",
          ),
        className,
      )}
      role={isSwitch ? "switch" : undefined}
      aria-checked={isSwitch ? checked : undefined}
      aria-disabled={disabled}
    >
      <span className={cn("text-[16px]", isWechat && "text-[15px] text-[#111827]")}>
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value ? (
          <span
            className={cn(
              "max-w-[11rem] truncate text-[14px] text-[color:var(--text-muted)]",
              isWechat && "max-w-[12rem] text-[13px] text-[#8c8c8c]",
            )}
          >
            {value}
          </span>
        ) : null}
        {isSwitch ? (
          <span
            className={cn(
              "relative h-8 w-13 rounded-full transition-colors",
              isWechat && "h-7 w-11",
              checked ? "bg-[#07c160]" : "bg-[#d5d5d5]",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                isWechat && "top-0.5 h-6 w-6",
                checked
                  ? isWechat
                    ? "left-4"
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
