import type { CloudAdminSessionSourceGroupRiskLevel } from "@yinjie/contracts";
import {
  formatAdminSessionSourceGroupRiskLevelLabel,
  getAdminSessionSourceGroupRiskTone,
  getAdminSessionSourceGroupRiskToneStyles,
} from "../lib/admin-session-helpers";

type AdminSessionSourceGroupRiskBadgeProps = {
  riskLevel: CloudAdminSessionSourceGroupRiskLevel;
  className?: string;
};

export function AdminSessionSourceGroupRiskBadge({
  riskLevel,
  className,
}: AdminSessionSourceGroupRiskBadgeProps) {
  const tone = getAdminSessionSourceGroupRiskTone(riskLevel);
  const toneStyles = getAdminSessionSourceGroupRiskToneStyles(riskLevel);

  return (
    <span
      data-tone={tone}
      className={`rounded-full border ${toneStyles.badge}${className ? ` ${className}` : ""}`}
    >
      {formatAdminSessionSourceGroupRiskLevelLabel(riskLevel)}
    </span>
  );
}
