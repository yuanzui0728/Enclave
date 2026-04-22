import type {
  CloudWorldLifecycleStatus,
  CloudWorldRequestStatus,
} from "@yinjie/contracts";
import { REQUEST_STATUSES } from "./request-status-meta";

export type RequestStatusFilter = CloudWorldRequestStatus | "all";
export type ProjectedWorldStatusFilter = CloudWorldLifecycleStatus | "all";
export type ProjectedDesiredStateFilter = "all" | "running" | "sleeping";

export type RequestsRouteSearch = {
  status: RequestStatusFilter;
  projectedWorldStatus: ProjectedWorldStatusFilter;
  desiredState: ProjectedDesiredStateFilter;
  query: string;
};

export const REQUEST_STATUS_FILTERS: RequestStatusFilter[] = ["all", ...REQUEST_STATUSES];

export const REQUEST_PROJECTED_WORLD_STATUS_FILTERS: ProjectedWorldStatusFilter[] =
  ["all", "queued", "creating", "ready", "failed", "disabled"];

export const REQUEST_PROJECTED_DESIRED_STATE_FILTERS: ProjectedDesiredStateFilter[] =
  ["all", "running", "sleeping"];

export const DEFAULT_REQUESTS_ROUTE_SEARCH: RequestsRouteSearch = {
  status: "all",
  projectedWorldStatus: "all",
  desiredState: "all",
  query: "",
};

const REQUEST_STATUS_FILTER_SET = new Set<string>(REQUEST_STATUS_FILTERS);
const REQUEST_PROJECTED_WORLD_STATUS_FILTER_SET = new Set<string>(
  REQUEST_PROJECTED_WORLD_STATUS_FILTERS,
);
const REQUEST_PROJECTED_DESIRED_STATE_FILTER_SET = new Set<string>(
  REQUEST_PROJECTED_DESIRED_STATE_FILTERS,
);

function normalizeRouteString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildRequestsRouteSearch(
  search?: Partial<Record<keyof RequestsRouteSearch, unknown>>,
): RequestsRouteSearch {
  const status = normalizeRouteString(search?.status);
  const projectedWorldStatus = normalizeRouteString(
    search?.projectedWorldStatus,
  );
  const desiredState = normalizeRouteString(search?.desiredState);
  const query = normalizeRouteString(search?.query);

  return {
    status: REQUEST_STATUS_FILTER_SET.has(status)
      ? (status as RequestStatusFilter)
      : DEFAULT_REQUESTS_ROUTE_SEARCH.status,
    projectedWorldStatus: REQUEST_PROJECTED_WORLD_STATUS_FILTER_SET.has(
      projectedWorldStatus,
    )
      ? (projectedWorldStatus as ProjectedWorldStatusFilter)
      : DEFAULT_REQUESTS_ROUTE_SEARCH.projectedWorldStatus,
    desiredState: REQUEST_PROJECTED_DESIRED_STATE_FILTER_SET.has(desiredState)
      ? (desiredState as ProjectedDesiredStateFilter)
      : DEFAULT_REQUESTS_ROUTE_SEARCH.desiredState,
    query,
  };
}

export function validateRequestsRouteSearch(search: Record<string, unknown>) {
  return buildRequestsRouteSearch({
    status: normalizeRouteString(search.status),
    projectedWorldStatus: normalizeRouteString(search.projectedWorldStatus),
    desiredState: normalizeRouteString(search.desiredState),
    query: normalizeRouteString(search.query),
  });
}
