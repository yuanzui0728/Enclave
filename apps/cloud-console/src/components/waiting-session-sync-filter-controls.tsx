import type {
  WaitingSessionSyncTaskStatusFilter,
  WaitingSessionSyncTaskTypeFilter,
} from "../lib/waiting-session-sync-helpers";
import { WaitingSessionSyncActionButton } from "./waiting-session-sync-fragments";

const FIELD_LABEL_CLASS = "text-sm text-[color:var(--text-secondary)]";
const FIELD_INPUT_CLASS =
  "w-full rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 text-[color:var(--text-primary)]";

export function WaitingSessionSyncFilterControls({
  status,
  taskType,
  query,
  statusOptions,
  taskTypeOptions,
  getStatusLabel,
  getTaskTypeLabel,
  onStatusChange,
  onTaskTypeChange,
  onQueryChange,
}: {
  status: WaitingSessionSyncTaskStatusFilter;
  taskType: WaitingSessionSyncTaskTypeFilter;
  query: string;
  statusOptions: readonly WaitingSessionSyncTaskStatusFilter[];
  taskTypeOptions: readonly WaitingSessionSyncTaskTypeFilter[];
  getStatusLabel: (status: WaitingSessionSyncTaskStatusFilter) => string;
  getTaskTypeLabel: (taskType: WaitingSessionSyncTaskTypeFilter) => string;
  onStatusChange: (status: WaitingSessionSyncTaskStatusFilter) => void;
  onTaskTypeChange: (taskType: WaitingSessionSyncTaskTypeFilter) => void;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <label className={FIELD_LABEL_CLASS}>
        <div className="mb-2">Status</div>
        <select
          aria-label="Waiting sync status"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as WaitingSessionSyncTaskStatusFilter)
          }
          className={FIELD_INPUT_CLASS}
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {getStatusLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <label className={FIELD_LABEL_CLASS}>
        <div className="mb-2">Task type</div>
        <select
          aria-label="Waiting sync task type"
          value={taskType}
          onChange={(event) =>
            onTaskTypeChange(event.target.value as WaitingSessionSyncTaskTypeFilter)
          }
          className={FIELD_INPUT_CLASS}
        >
          {taskTypeOptions.map((option) => (
            <option key={option} value={option}>
              {getTaskTypeLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <label className={`${FIELD_LABEL_CLASS} md:col-span-2`}>
        <div className="mb-2">Search</div>
        <input
          aria-label="Waiting sync search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="task key, target, context, or error"
          className={`${FIELD_INPUT_CLASS} placeholder-[color:var(--text-muted)]`}
        />
      </label>
    </div>
  );
}

export function WaitingSessionSyncPaginationControls({
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageSizeChange: (pageSize: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border-faint)] pt-4">
      <div className="text-sm text-[color:var(--text-secondary)]">
        Page {page} of {totalPages}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <span>Page size</span>
          <select
            aria-label="Waiting sync page size"
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(Number.parseInt(event.target.value, 10))
            }
            className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 text-[color:var(--text-primary)]"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <WaitingSessionSyncActionButton
          tone="neutral"
          size="regular"
          disabled={page <= 1}
          onClick={onPrevious}
        >
          Previous
        </WaitingSessionSyncActionButton>
        <WaitingSessionSyncActionButton
          tone="neutral"
          size="regular"
          disabled={page >= totalPages}
          onClick={onNext}
        >
          Next
        </WaitingSessionSyncActionButton>
      </div>
    </div>
  );
}
