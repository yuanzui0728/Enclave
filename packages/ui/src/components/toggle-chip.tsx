import type { InputHTMLAttributes } from "react";
import { cn } from "../cn";

type ToggleChipProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function ToggleChip({ className, label, checked, ...props }: ToggleChipProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-4 py-2 text-sm text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        checked
          ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] shadow-[var(--shadow-card)]"
          : "hover:-translate-y-0.5 hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-tertiary)]",
        className,
      )}
    >
      <input type="checkbox" className="h-4 w-4 accent-[color:var(--brand-primary)]" checked={checked} {...props} />
      <span>{label}</span>
    </label>
  );
}
