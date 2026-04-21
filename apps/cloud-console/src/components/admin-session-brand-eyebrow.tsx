import type { ReactNode } from "react";

type AdminSessionBrandEyebrowSize = "default" | "compact";

type AdminSessionBrandEyebrowProps = {
  children: ReactNode;
  size?: AdminSessionBrandEyebrowSize;
  className?: string;
};

const SIZE_CLASS_NAMES: Record<AdminSessionBrandEyebrowSize, string> = {
  default: "text-xs tracking-[0.16em]",
  compact: "text-[11px] tracking-[0.14em]",
};

export function AdminSessionBrandEyebrow({
  children,
  size = "default",
  className,
}: AdminSessionBrandEyebrowProps) {
  return (
    <div
      className={`uppercase text-[color:var(--brand-primary)] ${SIZE_CLASS_NAMES[size]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
