import type {
  CloudInstancePowerState,
  CloudWorldAttentionSeverity,
  CloudWorldLifecycleStatus,
} from "@yinjie/contracts";

export type WorldStatusFilter = CloudWorldLifecycleStatus | "all";
export type AttentionFilter =
  | "all"
  | "healthy"
  | CloudWorldAttentionSeverity;
export type HealthFilter = "all" | "healthy" | "unhealthy" | "unknown";
export type PowerStateFilter = CloudInstancePowerState | "all";

export type WorldsRouteSearch = {
  status: WorldStatusFilter;
  provider: string;
  powerState: PowerStateFilter;
  attention: AttentionFilter;
  health: HealthFilter;
  query: string;
};

export const WORLD_STATUS_FILTERS: WorldStatusFilter[] = [
  "all",
  "queued",
  "creating",
  "bootstrapping",
  "starting",
  "ready",
  "sleeping",
  "failed",
  "disabled",
];

export const POWER_STATE_FILTERS: PowerStateFilter[] = [
  "all",
  "absent",
  "provisioning",
  "running",
  "starting",
  "stopped",
  "stopping",
  "error",
];

export const ATTENTION_FILTERS: AttentionFilter[] = [
  "all",
  "healthy",
  "critical",
  "warning",
  "info",
];

export const HEALTH_FILTERS: HealthFilter[] = [
  "all",
  "healthy",
  "unhealthy",
  "unknown",
];

export const UNASSIGNED_PROVIDER_FILTER = "__unassigned__";

export const DEFAULT_WORLDS_ROUTE_SEARCH: WorldsRouteSearch = {
  status: "all",
  provider: "all",
  powerState: "all",
  attention: "all",
  health: "all",
  query: "",
};

const WORLD_STATUS_FILTER_SET = new Set<string>(WORLD_STATUS_FILTERS);
const POWER_STATE_FILTER_SET = new Set<string>(POWER_STATE_FILTERS);
const ATTENTION_FILTER_SET = new Set<string>(ATTENTION_FILTERS);
const HEALTH_FILTER_SET = new Set<string>(HEALTH_FILTERS);

function normalizeRouteString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildWorldsRouteSearch(
  search?: Partial<Record<keyof WorldsRouteSearch, unknown>>,
): WorldsRouteSearch {
  const status = normalizeRouteString(search?.status);
  const provider = normalizeRouteString(search?.provider);
  const powerState = normalizeRouteString(search?.powerState);
  const attention = normalizeRouteString(search?.attention);
  const health = normalizeRouteString(search?.health);
  const query = normalizeRouteString(search?.query);

  return {
    status: WORLD_STATUS_FILTER_SET.has(status)
      ? (status as WorldStatusFilter)
      : DEFAULT_WORLDS_ROUTE_SEARCH.status,
    provider: provider || DEFAULT_WORLDS_ROUTE_SEARCH.provider,
    powerState: POWER_STATE_FILTER_SET.has(powerState)
      ? (powerState as PowerStateFilter)
      : DEFAULT_WORLDS_ROUTE_SEARCH.powerState,
    attention: ATTENTION_FILTER_SET.has(attention)
      ? (attention as AttentionFilter)
      : DEFAULT_WORLDS_ROUTE_SEARCH.attention,
    health: HEALTH_FILTER_SET.has(health)
      ? (health as HealthFilter)
      : DEFAULT_WORLDS_ROUTE_SEARCH.health,
    query,
  };
}

export function validateWorldsRouteSearch(search: Record<string, unknown>) {
  return buildWorldsRouteSearch({
    status: normalizeRouteString(search.status),
    provider: normalizeRouteString(search.provider),
    powerState: normalizeRouteString(search.powerState),
    attention: normalizeRouteString(search.attention),
    health: normalizeRouteString(search.health),
    query: normalizeRouteString(search.query),
  });
}

export function buildCompactWorldsRouteSearch(
  search?: Partial<WorldsRouteSearch>,
) {
  const normalized = buildWorldsRouteSearch(search);
  const compact: Partial<WorldsRouteSearch> = {};

  if (normalized.status !== DEFAULT_WORLDS_ROUTE_SEARCH.status) {
    compact.status = normalized.status;
  }
  if (normalized.provider !== DEFAULT_WORLDS_ROUTE_SEARCH.provider) {
    compact.provider = normalized.provider;
  }
  if (normalized.powerState !== DEFAULT_WORLDS_ROUTE_SEARCH.powerState) {
    compact.powerState = normalized.powerState;
  }
  if (normalized.attention !== DEFAULT_WORLDS_ROUTE_SEARCH.attention) {
    compact.attention = normalized.attention;
  }
  if (normalized.health !== DEFAULT_WORLDS_ROUTE_SEARCH.health) {
    compact.health = normalized.health;
  }
  if (normalized.query) {
    compact.query = normalized.query;
  }

  return compact;
}

export function buildWorldsPermalink(search?: Partial<WorldsRouteSearch>) {
  const compact = buildCompactWorldsRouteSearch(search);
  const params = new URLSearchParams();

  if (compact.status) {
    params.set("status", compact.status);
  }
  if (compact.provider) {
    params.set("provider", compact.provider);
  }
  if (compact.powerState) {
    params.set("powerState", compact.powerState);
  }
  if (compact.attention) {
    params.set("attention", compact.attention);
  }
  if (compact.health) {
    params.set("health", compact.health);
  }
  if (compact.query) {
    params.set("query", compact.query);
  }

  const queryString = params.toString();
  return queryString ? `/worlds?${queryString}` : "/worlds";
}
