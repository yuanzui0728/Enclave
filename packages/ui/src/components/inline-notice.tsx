import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../cn";

const inlineNoticeVariants = cva("rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-6 shadow-[var(--shadow-soft)]", {
  variants: {
    tone: {
      muted: "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]",
      info: "border-[rgba(96,165,250,0.22)] bg-[color:var(--state-info-bg)] text-[color:var(--state-info-text)]",
      success:
        "border-[color:var(--border-success)] bg-[color:var(--state-success-bg)] text-[color:var(--state-success-text)]",
      warning:
        "border-[rgba(245,158,11,0.22)] bg-[color:var(--state-warning-bg)] text-[color:var(--state-warning-text)]",
      danger:
        "border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]",
    },
  },
  defaultVariants: {
    tone: "muted",
  },
});

export type InlineNoticeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof inlineNoticeVariants>;

export function InlineNotice({ className, tone, ...props }: InlineNoticeProps) {
  return <div className={cn(inlineNoticeVariants({ tone }), className)} {...props} />;
}
