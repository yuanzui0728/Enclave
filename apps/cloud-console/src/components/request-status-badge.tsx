import type { CloudWorldRequestStatus } from "@yinjie/contracts";
import {
  formatRequestStatusLabel,
  getRequestStatusTone,
  getRequestStatusToneStyles,
} from "../lib/request-helpers";

type RequestStatusBadgeProps = {
  status: CloudWorldRequestStatus;
  className?: string;
};

export function RequestStatusBadge({
  status,
  className,
}: RequestStatusBadgeProps) {
  const tone = getRequestStatusTone(status);
  const toneStyles = getRequestStatusToneStyles(status);

  return (
    <span
      data-tone={tone}
      className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${toneStyles.badge}${className ? ` ${className}` : ""}`}
    >
      {formatRequestStatusLabel(status)}
    </span>
  );
}
