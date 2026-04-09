import { ChevronRight } from "lucide-react";
import { cn } from "@yinjie/ui";

type ChatSettingRowProps = {
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  onToggle?: (checked: boolean) => void;
  className?: string;
};

export function ChatSettingRow({
  label,
  value,
  onClick,
  danger = false,
  checked,
  onToggle,
  className,
}: ChatSettingRowProps) {
  const isSwitch = typeof checked === "boolean" && Boolean(onToggle);

  return (
    <button
      type="button"
      onClick={() => {
        if (isSwitch) {
          onToggle?.(!checked);
          return;
        }
        onClick?.();
      }}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left",
        danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]",
        className,
      )}
      role={isSwitch ? "switch" : undefined}
      aria-checked={isSwitch ? checked : undefined}
    >
      <span className="text-[16px]">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {value ? <span className="max-w-[11rem] truncate text-[14px] text-[color:var(--text-muted)]">{value}</span> : null}
        {isSwitch ? (
          <span
            className={cn(
              "relative h-8 w-13 rounded-full transition-colors",
              checked ? "bg-[#07c160]" : "bg-[#d5d5d5]",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                checked ? "translate-x-6 left-1" : "left-1 translate-x-0",
              )}
            />
          </span>
        ) : danger ? null : (
          <ChevronRight size={18} className="text-[color:var(--text-dim)]" />
        )}
      </span>
    </button>
  );
}
