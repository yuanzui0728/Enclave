import {
  ADMIN_SESSION_SOURCE_GROUP_PAGE_SIZE_OPTIONS,
  ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS,
  ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTIONS,
  ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS,
  type AdminSessionsRouteSearch,
} from "../lib/admin-sessions-route-search";
import {
  formatAdminSessionSourceGroupRiskFilterLabel,
  formatAdminSessionSourceGroupSortDirectionLabel,
  formatAdminSessionSourceGroupSortFieldLabel,
} from "../lib/admin-session-helpers";

const SELECT_CLASS_NAME =
  "rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--text-primary)] outline-none focus:border-[color:var(--border-strong)]";

const RISK_PRESET_LABELS: Record<
  AdminSessionsRouteSearch["sourceRiskLevel"],
  string
> = {
  all: "All risk",
  critical: "Critical risk",
  watch: "Watch risk",
  normal: "Normal risk",
};

type AdminSessionSourceGroupFilterControlsProps = {
  sourceSortBy: AdminSessionsRouteSearch["sourceSortBy"];
  sourceSortDirection: AdminSessionsRouteSearch["sourceSortDirection"];
  sourceRiskLevel: AdminSessionsRouteSearch["sourceRiskLevel"];
  sourcePageSize: number;
  onSourceSortByChange: (
    sourceSortBy: AdminSessionsRouteSearch["sourceSortBy"],
  ) => void;
  onSourceSortDirectionChange: (
    sourceSortDirection: AdminSessionsRouteSearch["sourceSortDirection"],
  ) => void;
  onSourceRiskLevelChange: (
    sourceRiskLevel: AdminSessionsRouteSearch["sourceRiskLevel"],
  ) => void;
  onSourcePageSizeChange: (sourcePageSize: number) => void;
  className?: string;
  presetClassName?: string;
};

export function AdminSessionSourceGroupFilterControls({
  sourceSortBy,
  sourceSortDirection,
  sourceRiskLevel,
  sourcePageSize,
  onSourceSortByChange,
  onSourceSortDirectionChange,
  onSourceRiskLevelChange,
  onSourcePageSizeChange,
  className = "grid gap-3 md:grid-cols-4",
  presetClassName = "mt-4 flex flex-wrap gap-2",
}: AdminSessionSourceGroupFilterControlsProps) {
  return (
    <>
      <div className={className}>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          Source sort
          <select
            value={sourceSortBy}
            onChange={(event) =>
              onSourceSortByChange(
                event.target.value as AdminSessionsRouteSearch["sourceSortBy"],
              )
            }
            className={SELECT_CLASS_NAME}
          >
            {ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS.map((value) => (
              <option key={value} value={value}>
                {formatAdminSessionSourceGroupSortFieldLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          Source direction
          <select
            value={sourceSortDirection}
            onChange={(event) =>
              onSourceSortDirectionChange(
                event.target.value as AdminSessionsRouteSearch["sourceSortDirection"],
              )
            }
            className={SELECT_CLASS_NAME}
          >
            {ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {formatAdminSessionSourceGroupSortDirectionLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          Source risk
          <select
            value={sourceRiskLevel}
            onChange={(event) =>
              onSourceRiskLevelChange(
                event.target.value as AdminSessionsRouteSearch["sourceRiskLevel"],
              )
            }
            className={SELECT_CLASS_NAME}
          >
            {ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS.map((value) => (
              <option key={value} value={value}>
                {formatAdminSessionSourceGroupRiskFilterLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          Source page size
          <select
            value={String(sourcePageSize)}
            onChange={(event) =>
              onSourcePageSizeChange(Number.parseInt(event.target.value, 10))
            }
            className={SELECT_CLASS_NAME}
          >
            {ADMIN_SESSION_SOURCE_GROUP_PAGE_SIZE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} per page
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={presetClassName}>
        {ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onSourceRiskLevelChange(value)}
            className={`rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] transition ${
              sourceRiskLevel === value
                ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]"
                : "border-[color:var(--border-faint)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]"
            }`}
          >
            {RISK_PRESET_LABELS[value]}
          </button>
        ))}
      </div>
    </>
  );
}
