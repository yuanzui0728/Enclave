import type { CloudAdminSessionStatus } from "@yinjie/contracts";
import {
  formatAdminSessionStatusLabel,
  getAdminSessionStatusTone,
  getAdminSessionStatusToneStyles,
} from "../lib/admin-session-helpers";

type AdminSessionStatusBadgeProps = {
  status: CloudAdminSessionStatus;
  className?: string;
};

export function AdminSessionStatusBadge({
  status,
  className,
}: AdminSessionStatusBadgeProps) {
  const tone = getAdminSessionStatusTone(status);
  const toneStyles = getAdminSessionStatusToneStyles(status);

  return (
    <span
      data-tone={tone}
      className={`rounded-full border ${toneStyles.badge}${className ? ` ${className}` : ""}`}
    >
      {formatAdminSessionStatusLabel(status)}
    </span>
  );
}
