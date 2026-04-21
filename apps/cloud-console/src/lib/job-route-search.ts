import type {
  WorldLifecycleJobStatus,
  WorldLifecycleJobType,
} from "@yinjie/contracts";
import {
  QUEUE_STATE_FILTERS,
  type QueueStateFilter,
} from "./job-queue-state";

export type JobStatusFilter = WorldLifecycleJobStatus | "all";
export type JobTypeFilter = WorldLifecycleJobType | "all";

export type JobsRouteSearch = {
  status: JobStatusFilter;
  jobType: JobTypeFilter;
  provider: string;
  queueState: QueueStateFilter;
  query: string;
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

export const DEFAULT_JOBS_ROUTE_SEARCH: JobsRouteSearch = {
  status: "all",
  jobType: "all",
  provider: "all",
  queueState: "all",
  query: "",
};

const JOB_STATUS_FILTER_SET = new Set<string>(JOB_STATUS_FILTERS);
const JOB_TYPE_FILTER_SET = new Set<string>(JOB_TYPE_FILTERS);
const QUEUE_STATE_FILTER_SET = new Set<string>(
  QUEUE_STATE_FILTERS.map((item) => item.value),
);

function normalizeRouteString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildJobsRouteSearch(
  search?: Partial<Record<keyof JobsRouteSearch, unknown>>,
): JobsRouteSearch {
  const status = normalizeRouteString(search?.status);
  const jobType = normalizeRouteString(search?.jobType);
  const provider = normalizeRouteString(search?.provider);
  const queueState = normalizeRouteString(search?.queueState);

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
    query:
      typeof search?.query === "string"
        ? search.query
        : DEFAULT_JOBS_ROUTE_SEARCH.query,
  };
}

export function validateJobsRouteSearch(search: Record<string, unknown>) {
  return buildJobsRouteSearch({
    status: normalizeRouteString(search.status),
    jobType: normalizeRouteString(search.jobType),
    provider: normalizeRouteString(search.provider),
    queueState: normalizeRouteString(search.queueState),
    query: typeof search.query === "string" ? search.query : "",
  });
}
