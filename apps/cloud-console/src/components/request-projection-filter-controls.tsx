import {
  REQUEST_PROJECTED_DESIRED_STATE_FILTERS,
  REQUEST_PROJECTED_WORLD_STATUS_FILTERS,
  type ProjectedDesiredStateFilter,
  type ProjectedWorldStatusFilter,
} from "../lib/request-route-search";
import {
  formatProjectedDesiredState,
  formatProjectedWorldStatus,
} from "../lib/request-helpers";

type RequestProjectionFilterControlsProps = {
  projectedWorldStatus: ProjectedWorldStatusFilter;
  desiredState: ProjectedDesiredStateFilter;
  onProjectedWorldStatusChange: (
    projectedWorldStatus: ProjectedWorldStatusFilter,
  ) => void;
  onDesiredStateChange: (desiredState: ProjectedDesiredStateFilter) => void;
  className?: string;
};

const SELECT_CLASS_NAME =
  "rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]";

export function RequestProjectionFilterControls({
  projectedWorldStatus,
  desiredState,
  onProjectedWorldStatusChange,
  onDesiredStateChange,
  className = "mt-4 flex flex-wrap gap-4",
}: RequestProjectionFilterControlsProps) {
  return (
    <div className={className}>
      <label className="grid gap-2 text-sm text-[color:var(--text-secondary)]">
        <span>Projected world status</span>
        <select
          aria-label="Projected world status"
          value={projectedWorldStatus}
          onChange={(event) =>
            onProjectedWorldStatusChange(
              event.target.value as ProjectedWorldStatusFilter,
            )
          }
          className={SELECT_CLASS_NAME}
        >
          {REQUEST_PROJECTED_WORLD_STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {formatProjectedWorldStatus(status)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm text-[color:var(--text-secondary)]">
        <span>Projected desired state</span>
        <select
          aria-label="Projected desired state"
          value={desiredState}
          onChange={(event) =>
            onDesiredStateChange(event.target.value as ProjectedDesiredStateFilter)
          }
          className={SELECT_CLASS_NAME}
        >
          {REQUEST_PROJECTED_DESIRED_STATE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {formatProjectedDesiredState(value)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
