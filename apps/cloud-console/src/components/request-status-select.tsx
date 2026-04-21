import type { CloudWorldRequestStatus } from "@yinjie/contracts";
import {
  formatRequestStatusLabel,
  REQUEST_STATUSES,
} from "../lib/request-helpers";

type RequestStatusSelectProps = {
  value: CloudWorldRequestStatus;
  onChange: (status: CloudWorldRequestStatus) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export function RequestStatusSelect({
  value,
  onChange,
  className = "rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]",
  disabled = false,
  ariaLabel,
}: RequestStatusSelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) =>
        onChange(event.target.value as CloudWorldRequestStatus)
      }
      className={className}
    >
      {REQUEST_STATUSES.map((status) => (
        <option key={status} value={status}>
          {formatRequestStatusLabel(status)}
        </option>
      ))}
    </select>
  );
}
