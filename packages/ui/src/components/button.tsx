import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] border text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,filter,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:translate-y-[1px] active:shadow-none disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-[color:var(--brand-primary)] [background-image:var(--brand-gradient)] px-4 py-2.5 text-[color:var(--text-on-brand)] shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[var(--shadow-lift)]",
        secondary:
          "border-[color:var(--border-subtle)] bg-[rgba(255,255,255,0.92)] px-4 py-2.5 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:bg-[color:var(--surface-card-hover)] hover:shadow-[var(--shadow-card)]",
        ghost:
          "border-transparent bg-transparent px-3 py-2 text-[color:var(--text-secondary)] hover:bg-[rgba(249,115,22,0.09)] hover:text-[color:var(--text-primary)]",
        danger:
          "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,241,241,0.92),rgba(254,226,226,0.92))] px-4 py-2.5 text-[color:var(--state-danger-text)] shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:bg-[rgba(254,226,226,0.98)]",
      },
      size: {
        sm: "min-h-9 px-3 py-2 text-xs",
        md: "min-h-10",
        lg: "min-h-12 px-5 py-3 text-sm",
        icon: "h-10 w-10 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
