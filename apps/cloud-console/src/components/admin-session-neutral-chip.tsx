import type { ReactNode } from "react";

type AdminSessionNeutralChipVariant = "default" | "current";
type AdminSessionNeutralChipSize = "default" | "compact";

type AdminSessionNeutralChipProps = {
  children: ReactNode;
  variant?: AdminSessionNeutralChipVariant;
  size?: AdminSessionNeutralChipSize;
  className?: string;
};

const VARIANT_CLASS_NAMES: Record<AdminSessionNeutralChipVariant, string> = {
  default:
    "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]",
  current: "border-current/30 text-current",
};

const SIZE_CLASS_NAMES: Record<AdminSessionNeutralChipSize, string> = {
  default: "px-2 py-1 text-xs",
  compact: "px-2 py-1 text-[11px]",
};

export function AdminSessionNeutralChip({
  children,
  variant = "default",
  size = "default",
  className,
}: AdminSessionNeutralChipProps) {
  return (
    <span
      className={`rounded-full border ${VARIANT_CLASS_NAMES[variant]} ${SIZE_CLASS_NAMES[size]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}
