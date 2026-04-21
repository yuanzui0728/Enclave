import type { ButtonHTMLAttributes, ReactNode } from "react";

type AdminSessionActionButtonTone =
  | "neutral"
  | "brand"
  | "brand-outline"
  | "danger";
type AdminSessionActionButtonSize = "default" | "compact";

type AdminSessionActionButtonProps = {
  tone?: AdminSessionActionButtonTone;
  size?: AdminSessionActionButtonSize;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const BASE_CLASS_NAME =
  "rounded-lg border font-medium uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-60";

const TONE_CLASS_NAMES: Record<AdminSessionActionButtonTone, string> = {
  neutral:
    "border-[color:var(--border-faint)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]",
  brand:
    "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)] hover:border-[color:var(--border-strong)]",
  "brand-outline":
    "border-[color:var(--border-brand)] bg-[color:var(--surface-console)] text-[color:var(--brand-primary)] hover:border-[color:var(--border-strong)]",
  danger:
    "border-rose-300/40 bg-rose-500/10 text-rose-100 hover:border-rose-200/60",
};

const SIZE_CLASS_NAMES: Record<AdminSessionActionButtonSize, string> = {
  default: "px-3 py-2 text-xs",
  compact: "px-3 py-2 text-[11px]",
};

export function AdminSessionActionButton({
  tone = "neutral",
  size = "default",
  className,
  type = "button",
  children,
  ...buttonProps
}: AdminSessionActionButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE_CLASS_NAME} ${TONE_CLASS_NAMES[tone]} ${SIZE_CLASS_NAMES[size]}${className ? ` ${className}` : ""}`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
