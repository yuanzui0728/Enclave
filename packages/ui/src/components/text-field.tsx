import type { InputHTMLAttributes } from "react";
import { cn } from "../cn";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>;

export function TextField({ className, ...props }: TextFieldProps) {
  return (
    <input
      className={cn(
        "w-full rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3.5 text-sm text-[color:var(--text-primary)] outline-none transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] hover:border-[color:var(--border-subtle)] focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-[var(--shadow-focus)]",
        className,
      )}
      {...props}
    />
  );
}
