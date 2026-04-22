import type {
  CloudWaitingSessionSyncTaskStatus,
  CloudWaitingSessionSyncTaskType,
} from "@yinjie/contracts";

export type WaitingSessionSyncTaskStatusFilter =
  | CloudWaitingSessionSyncTaskStatus
  | "all";
export type WaitingSessionSyncTaskTypeFilter =
  | CloudWaitingSessionSyncTaskType
  | "all";

export type WaitingSessionSyncRouteSearch = {
  status: WaitingSessionSyncTaskStatusFilter;
  taskType: WaitingSessionSyncTaskTypeFilter;
  query: string;
  reviewContext: string;
  reviewTaskId: string;
  page: number;
  pageSize: number;
};

export const WAITING_SESSION_SYNC_STATUS_FILTERS: WaitingSessionSyncTaskStatusFilter[] =
  ["all", "failed", "pending", "running"];
export const WAITING_SESSION_SYNC_TASK_TYPE_FILTERS: WaitingSessionSyncTaskTypeFilter[] =
  ["all", "refresh_world", "refresh_phone", "invalidate_phone"];
export const WAITING_SESSION_SYNC_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export const DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH: WaitingSessionSyncRouteSearch =
  {
    status: "all",
    taskType: "all",
    query: "",
    reviewContext: "",
    reviewTaskId: "",
    page: 1,
    pageSize: 20,
  };

const STATUS_FILTER_SET = new Set<string>(WAITING_SESSION_SYNC_STATUS_FILTERS);
const TASK_TYPE_FILTER_SET = new Set<string>(
  WAITING_SESSION_SYNC_TASK_TYPE_FILTERS,
);
const PAGE_SIZE_SET = new Set<number>(WAITING_SESSION_SYNC_PAGE_SIZE_OPTIONS);

function normalizeRouteString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;

  return Number.isInteger(normalized) && normalized >= 1 ? normalized : fallback;
}

export function buildWaitingSessionSyncRouteSearch(
  search?: Partial<Record<keyof WaitingSessionSyncRouteSearch, unknown>>,
): WaitingSessionSyncRouteSearch {
  const status = normalizeRouteString(search?.status);
  const taskType = normalizeRouteString(search?.taskType);
  const pageSize = normalizePositiveInteger(
    search?.pageSize,
    DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.pageSize,
  );

  return {
    status: STATUS_FILTER_SET.has(status)
      ? (status as WaitingSessionSyncTaskStatusFilter)
      : DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.status,
    taskType: TASK_TYPE_FILTER_SET.has(taskType)
      ? (taskType as WaitingSessionSyncTaskTypeFilter)
      : DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.taskType,
    query:
      typeof search?.query === "string"
        ? search.query
        : DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.query,
    reviewContext:
      typeof search?.reviewContext === "string"
        ? normalizeRouteString(search.reviewContext)
        : DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.reviewContext,
    reviewTaskId:
      typeof search?.reviewTaskId === "string"
        ? normalizeRouteString(search.reviewTaskId)
        : DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.reviewTaskId,
    page: normalizePositiveInteger(
      search?.page,
      DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.page,
    ),
    pageSize: PAGE_SIZE_SET.has(pageSize)
      ? pageSize
      : DEFAULT_WAITING_SESSION_SYNC_ROUTE_SEARCH.pageSize,
  };
}

export function validateWaitingSessionSyncRouteSearch(
  search: Record<string, unknown>,
) {
  return buildWaitingSessionSyncRouteSearch({
    status: normalizeRouteString(search.status),
    taskType: normalizeRouteString(search.taskType),
    query: typeof search.query === "string" ? search.query : "",
    reviewContext:
      typeof search.reviewContext === "string"
        ? normalizeRouteString(search.reviewContext)
        : "",
    reviewTaskId:
      typeof search.reviewTaskId === "string"
        ? normalizeRouteString(search.reviewTaskId)
        : "",
    page: search.page,
    pageSize: search.pageSize,
  });
}
