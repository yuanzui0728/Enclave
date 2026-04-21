import type { CloudWorldLifecycleStatus } from "@yinjie/contracts";
import {
  formatProjectedDesiredState,
  formatProjectedWorldStatus,
  type ProjectedDesiredState,
  getProjectedDesiredStateTone,
  getProjectedDesiredStateToneStyles,
  getProjectedWorldStatusTone,
  getProjectedWorldStatusToneStyles,
} from "../lib/request-helpers";

type RequestProjectionBadgesProps = {
  projectedWorldStatus?: CloudWorldLifecycleStatus | null;
  projectedDesiredState?: ProjectedDesiredState | null;
  projectedLabel?: string | null;
  desiredLabel?: string | null;
  projectedRowClassName: string;
  desiredRowClassName: string;
};

export function RequestProjectionBadges({
  projectedWorldStatus,
  projectedDesiredState,
  projectedLabel = "Projected:",
  desiredLabel = "Desired:",
  projectedRowClassName,
  desiredRowClassName,
}: RequestProjectionBadgesProps) {
  const projectedWorldTone = getProjectedWorldStatusTone(projectedWorldStatus);
  const projectedWorldToneStyles = getProjectedWorldStatusToneStyles(
    projectedWorldStatus,
  );
  const projectedDesiredStateTone = getProjectedDesiredStateTone(
    projectedDesiredState,
  );
  const projectedDesiredStateToneStyles = getProjectedDesiredStateToneStyles(
    projectedDesiredState,
  );

  return (
    <>
      <div className={projectedRowClassName}>
        {projectedLabel ? <span>{projectedLabel}</span> : null}
        <span
          data-tone={projectedWorldTone}
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${projectedWorldToneStyles.badge}`}
        >
          {formatProjectedWorldStatus(projectedWorldStatus)}
        </span>
      </div>
      <div className={desiredRowClassName}>
        {desiredLabel ? <span>{desiredLabel}</span> : null}
        <span
          data-tone={projectedDesiredStateTone}
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${projectedDesiredStateToneStyles.badge}`}
        >
          {formatProjectedDesiredState(projectedDesiredState)}
        </span>
      </div>
    </>
  );
}
