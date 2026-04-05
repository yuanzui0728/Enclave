import type { InputHTMLAttributes } from "react";
import { cn } from "../cn";

type ToggleChipProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function ToggleChip({ className, label, checked, ...props }: ToggleChipProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)] transition-[border-color,background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        checked ? "border-[color:var(--border-brand)] bg-[rgba(59,130,246,0.12)]" : null,
        className,
      )}
    >
      <input type="checkbox" className="h-4 w-4 accent-[color:var(--brand-primary)]" checked={checked} {...props} />
      <span>{label}</span>
    </label>
  );
}
