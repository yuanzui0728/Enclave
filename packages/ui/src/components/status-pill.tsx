import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../cn";

const statusPill = cva(
  "inline-flex min-w-0 max-w-full items-center justify-center break-words rounded-full border px-3 py-1 text-center text-xs font-medium leading-4 shadow-[var(--shadow-soft)]",
  {
    variants: {
      tone: {
        healthy: "border-emerald-300/40 bg-emerald-500/10 text-emerald-700",
        warning: "border-amber-300/40 bg-amber-500/10 text-amber-700",
        muted: "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]",
      },
    },
    defaultVariants: {
      tone: "muted",
    },
  },
);

export type StatusPillProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof statusPill>;

export function StatusPill({ className, tone, ...props }: StatusPillProps) {
  return <span className={cn(statusPill({ tone }), className)} {...props} />;
}
