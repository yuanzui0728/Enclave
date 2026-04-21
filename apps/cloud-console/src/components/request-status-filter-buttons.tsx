import {
  REQUEST_STATUS_FILTERS,
  type RequestStatusFilter,
} from "../lib/request-route-search";
import {
  formatRequestStatusLabel,
  getRequestStatusTone,
  getRequestStatusToneStyles,
} from "../lib/request-helpers";

type RequestStatusFilterButtonsProps = {
  value: RequestStatusFilter;
  onChange: (status: RequestStatusFilter) => void;
  className?: string;
};

function getRequestFilterToneStyles(
  status: RequestStatusFilter,
  active: boolean,
) {
  if (status === "all") {
    return active
      ? "border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] text-[color:var(--text-primary)]"
      : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]";
  }

  const toneStyles = getRequestStatusToneStyles(status);
  return active
    ? `${toneStyles.badge} shadow-[0_0_0_1px_currentColor_inset]`
    : `${toneStyles.badge} opacity-75 hover:opacity-100`;
}

export function RequestStatusFilterButtons({
  value,
  onChange,
  className = "flex flex-wrap gap-2",
}: RequestStatusFilterButtonsProps) {
  return (
    <div className={className}>
      {REQUEST_STATUS_FILTERS.map((status) => (
        <button
          key={status}
          type="button"
          data-tone={status === "all" ? "neutral" : getRequestStatusTone(status)}
          onClick={() => onChange(status)}
          className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] transition ${getRequestFilterToneStyles(
            status,
            value === status,
          )}`}
        >
          {formatRequestStatusLabel(status)}
        </button>
      ))}
    </div>
  );
}
