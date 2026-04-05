import type { SelectHTMLAttributes } from "react";
import { cn } from "../cn";

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({ className, ...props }: SelectFieldProps) {
  return (
    <select
      className={cn(
        "w-full rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3.5 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus:border-[color:var(--border-brand)] focus:bg-[rgba(3,7,18,0.58)]",
        className,
      )}
      {...props}
    />
  );
}
