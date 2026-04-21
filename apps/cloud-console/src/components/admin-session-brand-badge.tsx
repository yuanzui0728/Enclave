import type { ReactNode } from "react";

type AdminSessionBrandBadgeVariant = "soft" | "outline";
type AdminSessionBrandBadgeSize = "default" | "compact";

type AdminSessionBrandBadgeProps = {
  children: ReactNode;
  variant?: AdminSessionBrandBadgeVariant;
  size?: AdminSessionBrandBadgeSize;
  className?: string;
};

const VARIANT_CLASS_NAMES: Record<AdminSessionBrandBadgeVariant, string> = {
  soft: "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]",
  outline:
    "border-[color:var(--border-brand)] bg-[color:var(--surface-console)] text-[color:var(--brand-primary)]",
};

const SIZE_CLASS_NAMES: Record<AdminSessionBrandBadgeSize, string> = {
  default: "px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em]",
  compact: "px-2 py-1 text-[11px]",
};

export function AdminSessionBrandBadge({
  children,
  variant = "soft",
  size = "default",
  className,
}: AdminSessionBrandBadgeProps) {
  return (
    <span
      className={`rounded-full border ${VARIANT_CLASS_NAMES[variant]} ${SIZE_CLASS_NAMES[size]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
}
