import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../cn";

const tagBadgeVariants = cva("inline-flex rounded-full border px-3 py-1 text-xs", {
  variants: {
    tone: {
      neutral: "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]",
      success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-700",
      warning: "border-amber-400/30 bg-amber-500/10 text-amber-700",
      danger: "border-rose-400/30 bg-rose-500/10 text-rose-700",
      info: "border-sky-400/30 bg-sky-500/10 text-sky-700",
      accent: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-700",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export type TagBadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof tagBadgeVariants>;

export function TagBadge({ className, tone, ...props }: TagBadgeProps) {
  return <span className={cn(tagBadgeVariants({ tone }), className)} {...props} />;
}
