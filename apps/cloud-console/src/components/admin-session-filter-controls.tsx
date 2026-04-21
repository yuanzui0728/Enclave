import {
  ADMIN_SESSION_PAGE_SIZE_OPTIONS,
  ADMIN_SESSION_REASON_FILTERS,
  ADMIN_SESSION_SCOPE_FILTERS,
  ADMIN_SESSION_SORT_DIRECTIONS,
  ADMIN_SESSION_SORT_FIELDS,
  ADMIN_SESSION_STATUS_FILTERS,
  type AdminSessionsRouteSearch,
} from "../lib/admin-sessions-route-search";
import {
  formatAdminSessionReasonFilterLabel,
  formatAdminSessionScopeLabel,
  formatAdminSessionSortDirectionLabel,
  formatAdminSessionSortFieldLabel,
  formatAdminSessionStatusFilterLabel,
} from "../lib/admin-session-helpers";

const SELECT_CLASS_NAME =
  "rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--text-primary)] outline-none focus:border-[color:var(--border-strong)]";

type AdminSessionFilterControlsProps = {
  query: string;
  status: AdminSessionsRouteSearch["status"];
  revocationReason: AdminSessionsRouteSearch["revocationReason"];
  scope: AdminSessionsRouteSearch["scope"];
  sortBy: AdminSessionsRouteSearch["sortBy"];
  sortDirection: AdminSessionsRouteSearch["sortDirection"];
  pageSize: number;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: AdminSessionsRouteSearch["status"]) => void;
  onRevocationReasonChange: (
    revocationReason: AdminSessionsRouteSearch["revocationReason"],
  ) => void;
  onScopeChange: (scope: AdminSessionsRouteSearch["scope"]) => void;
  onSortByChange: (sortBy: AdminSessionsRouteSearch["sortBy"]) => void;
  onSortDirectionChange: (
    sortDirection: AdminSessionsRouteSearch["sortDirection"],
  ) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
};

export function AdminSessionFilterControls({
  query,
  status,
  revocationReason,
  scope,
  sortBy,
  sortDirection,
  pageSize,
  onQueryChange,
  onStatusChange,
  onRevocationReasonChange,
  onScopeChange,
  onSortByChange,
  onSortDirectionChange,
  onPageSizeChange,
  className = "grid gap-3 md:grid-cols-2 xl:grid-cols-5",
}: AdminSessionFilterControlsProps) {
  return (
    <div className={className}>
      <label className="flex min-w-0 flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Search
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Session id, IP, client, revoker"
          className={`${SELECT_CLASS_NAME} placeholder-[color:var(--text-muted)]`}
        />
      </label>
      <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Status
        <select
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as AdminSessionsRouteSearch["status"])
          }
          className={SELECT_CLASS_NAME}
        >
          {ADMIN_SESSION_STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {formatAdminSessionStatusFilterLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Revocation
        <select
          value={revocationReason}
          onChange={(event) =>
            onRevocationReasonChange(
              event.target.value as AdminSessionsRouteSearch["revocationReason"],
            )
          }
          className={SELECT_CLASS_NAME}
        >
          {ADMIN_SESSION_REASON_FILTERS.map((value) => (
            <option key={value} value={value}>
              {formatAdminSessionReasonFilterLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Scope
        <select
          value={scope}
          onChange={(event) =>
            onScopeChange(event.target.value as AdminSessionsRouteSearch["scope"])
          }
          className={SELECT_CLASS_NAME}
        >
          {ADMIN_SESSION_SCOPE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {formatAdminSessionScopeLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Sort by
        <select
          value={sortBy}
          onChange={(event) =>
            onSortByChange(event.target.value as AdminSessionsRouteSearch["sortBy"])
          }
          className={SELECT_CLASS_NAME}
        >
          {ADMIN_SESSION_SORT_FIELDS.map((value) => (
            <option key={value} value={value}>
              {formatAdminSessionSortFieldLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Direction
        <select
          value={sortDirection}
          onChange={(event) =>
            onSortDirectionChange(
              event.target.value as AdminSessionsRouteSearch["sortDirection"],
            )
          }
          className={SELECT_CLASS_NAME}
        >
          {ADMIN_SESSION_SORT_DIRECTIONS.map((value) => (
            <option key={value} value={value}>
              {formatAdminSessionSortDirectionLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Page size
        <select
          value={String(pageSize)}
          onChange={(event) =>
            onPageSizeChange(Number.parseInt(event.target.value, 10))
          }
          className={SELECT_CLASS_NAME}
        >
          {ADMIN_SESSION_PAGE_SIZE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value} per page
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
