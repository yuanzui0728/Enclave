import type {
  CloudWorldLifecycleJobSortDirection,
  CloudWorldLifecycleJobSortField,
  WorldLifecycleJobStatus,
  WorldLifecycleJobType,
} from "@yinjie/contracts";
import {
  QUEUE_STATE_FILTERS,
  type QueueStateFilter,
} from "./job-queue-state";

export type JobStatusFilter = WorldLifecycleJobStatus | "all";
export type JobTypeFilter = WorldLifecycleJobType | "all";
export type JobAuditFilter = "all" | "superseded";
export type JobSupersededByFilter = JobTypeFilter;
export type JobSortFieldFilter = CloudWorldLifecycleJobSortField;
export type JobSortDirectionFilter = CloudWorldLifecycleJobSortDirection;

export type JobsRouteSearch = {
  status: JobStatusFilter;
  jobType: JobTypeFilter;
  provider: string;
  queueState: QueueStateFilter;
  audit: JobAuditFilter;
  supersededBy: JobSupersededByFilter;
  query: string;
  sortBy: JobSortFieldFilter;
  sortDirection: JobSortDirectionFilter;
  page: number;
  pageSize: number;
};

export const JOB_STATUS_FILTERS: JobStatusFilter[] = [
  "all",
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export const JOB_TYPE_FILTERS: JobTypeFilter[] = [
  "all",
  "provision",
  "resume",
  "suspend",
  "reconcile",
];
export const JOB_AUDIT_FILTERS: JobAuditFilter[] = ["all", "superseded"];
export const JOB_SUPERSEDED_BY_FILTERS: JobSupersededByFilter[] = [
  "all",
  "provision",
  "resume",
  "suspend",
  "reconcile",
];
export const JOB_SORT_FIELDS: JobSortFieldFilter[] = [
  "updatedAt",
  "createdAt",
  "availableAt",
  "startedAt",
  "finishedAt",
];
export const JOB_SORT_DIRECTIONS: JobSortDirectionFilter[] = ["desc", "asc"];
export const JOB_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export const DEFAULT_JOBS_ROUTE_SEARCH: JobsRouteSearch = {
  status: "all",
  jobType: "all",
  provider: "all",
  queueState: "all",
  audit: "all",
  supersededBy: "all",
  query: "",
  sortBy: "updatedAt",
  sortDirection: "desc",
  page: 1,
  pageSize: 20,
};

const JOB_STATUS_FILTER_SET = new Set<string>(JOB_STATUS_FILTERS);
const JOB_TYPE_FILTER_SET = new Set<string>(JOB_TYPE_FILTERS);
const JOB_AUDIT_FILTER_SET = new Set<string>(JOB_AUDIT_FILTERS);
const JOB_SUPERSEDED_BY_FILTER_SET = new Set<string>(
  JOB_SUPERSEDED_BY_FILTERS,
);
const JOB_SORT_FIELD_SET = new Set<string>(JOB_SORT_FIELDS);
const JOB_SORT_DIRECTION_SET = new Set<string>(JOB_SORT_DIRECTIONS);
const QUEUE_STATE_FILTER_SET = new Set<string>(
  QUEUE_STATE_FILTERS.map((item) => item.value),
);
const PAGE_SIZE_SET = new Set<number>(JOB_PAGE_SIZE_OPTIONS);

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

export function buildJobsRouteSearch(
  search?: Partial<Record<keyof JobsRouteSearch, unknown>>,
): JobsRouteSearch {
  const status = normalizeRouteString(search?.status);
  const jobType = normalizeRouteString(search?.jobType);
  const provider = normalizeRouteString(search?.provider);
  const queueState = normalizeRouteString(search?.queueState);
  const audit = normalizeRouteString(search?.audit);
  const supersededBy = normalizeRouteString(search?.supersededBy);
  const sortBy = normalizeRouteString(search?.sortBy);
  const sortDirection = normalizeRouteString(search?.sortDirection);
  const pageSize = normalizePositiveInteger(
    search?.pageSize,
    DEFAULT_JOBS_ROUTE_SEARCH.pageSize,
  );

  return {
    status: JOB_STATUS_FILTER_SET.has(status)
      ? (status as JobStatusFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.status,
    jobType: JOB_TYPE_FILTER_SET.has(jobType)
      ? (jobType as JobTypeFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.jobType,
    provider: provider || DEFAULT_JOBS_ROUTE_SEARCH.provider,
    queueState: QUEUE_STATE_FILTER_SET.has(queueState)
      ? (queueState as QueueStateFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.queueState,
    audit: JOB_AUDIT_FILTER_SET.has(audit)
      ? (audit as JobAuditFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.audit,
    supersededBy: JOB_SUPERSEDED_BY_FILTER_SET.has(supersededBy)
      ? (supersededBy as JobSupersededByFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.supersededBy,
    query:
      typeof search?.query === "string"
        ? search.query
        : DEFAULT_JOBS_ROUTE_SEARCH.query,
    sortBy: JOB_SORT_FIELD_SET.has(sortBy)
      ? (sortBy as JobSortFieldFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.sortBy,
    sortDirection: JOB_SORT_DIRECTION_SET.has(sortDirection)
      ? (sortDirection as JobSortDirectionFilter)
      : DEFAULT_JOBS_ROUTE_SEARCH.sortDirection,
    page: normalizePositiveInteger(
      search?.page,
      DEFAULT_JOBS_ROUTE_SEARCH.page,
    ),
    pageSize: PAGE_SIZE_SET.has(pageSize)
      ? pageSize
      : DEFAULT_JOBS_ROUTE_SEARCH.pageSize,
  };
}

export function validateJobsRouteSearch(search: Record<string, unknown>) {
  return buildJobsRouteSearch({
    status: normalizeRouteString(search.status),
    jobType: normalizeRouteString(search.jobType),
    provider: normalizeRouteString(search.provider),
    queueState: normalizeRouteString(search.queueState),
    audit: normalizeRouteString(search.audit),
    supersededBy: normalizeRouteString(search.supersededBy),
    query: typeof search.query === "string" ? search.query : "",
    sortBy: normalizeRouteString(search.sortBy),
    sortDirection: normalizeRouteString(search.sortDirection),
    page: search.page,
    pageSize: search.pageSize,
  });
}
