import type { ReactNode } from "react";
import { cn } from "@yinjie/ui";

// 微信通话底部控制键：圆形图标钮 + 下方文字标签。
// variant：default 半透明 / active 实白（高亮，如免提开启）/ danger 红（挂断）。
// size：lg 用于居中更大的挂断键。
type WeChatCallControlButtonProps = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "active" | "danger";
  size?: "md" | "lg";
};

export function WeChatCallControlButton({
  icon,
  label,
  onClick,
  disabled = false,
  variant = "default",
  size = "md",
}: WeChatCallControlButtonProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40",
          size === "lg" ? "h-[68px] w-[68px]" : "h-[58px] w-[58px]",
          variant === "danger"
            ? "bg-[color:var(--state-danger-bg)] text-[color:var(--text-on-brand)] active:bg-[color:var(--state-danger-bg)]"
            : variant === "active"
              ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)]"
              : "bg-[color:var(--surface-card)]/15 text-[color:var(--text-on-brand)] active:bg-[color:var(--surface-card)]/25",
        )}
      >
        {icon}
      </button>
      <span className="text-[length:var(--text-caption)] leading-none text-[color:var(--text-on-brand)]/70">{label}</span>
    </div>
  );
}
