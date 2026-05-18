import type { TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ className, ...props }: TextAreaFieldProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3.5 text-sm leading-7 text-[color:var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[#cfc4bc] hover:border-[color:var(--border-subtle)] hover:bg-white focus:-translate-y-0.5 focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-[var(--shadow-focus)]",
        className,
      )}
      {...props}
    />
  );
}
