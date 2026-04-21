import type { AdminSessionsRouteSearch } from "../lib/admin-sessions-route-search";

export type AdminSessionQuickViewPreset = {
  id: string;
  label: string;
  apply: Partial<AdminSessionsRouteSearch>;
};

type AdminSessionQuickViewButtonsProps = {
  presets: readonly AdminSessionQuickViewPreset[];
  onPresetSelect: (apply: Partial<AdminSessionsRouteSearch>) => void;
  onReset: () => void;
  className?: string;
};

export function AdminSessionQuickViewButtons({
  presets,
  onPresetSelect,
  onReset,
  className = "flex flex-wrap gap-2",
}: AdminSessionQuickViewButtonsProps) {
  return (
    <div className={className}>
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPresetSelect(preset.apply)}
          className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--text-primary)] transition hover:border-[color:var(--border-strong)]"
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="rounded-full border border-[color:var(--border-faint)] bg-transparent px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--text-muted)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
      >
        Reset
      </button>
    </div>
  );
}
