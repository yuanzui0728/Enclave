import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ className, ...props }: TextAreaFieldProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3.5 text-sm leading-7 text-[color:var(--text-primary)] outline-none transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)] focus:bg-[rgba(3,7,18,0.58)]",
        className,
      )}
      {...props}
    />
  );
}
