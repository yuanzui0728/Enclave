import type {
  CloudAdminSessionRevocationReason,
  CloudAdminSessionSourceGroupRiskLevel,
  CloudAdminSessionSourceGroupSortField,
  CloudAdminSessionSortDirection,
  CloudAdminSessionSortField,
  CloudAdminSessionStatus,
} from "@yinjie/contracts";

export type AdminSessionStatusFilter = CloudAdminSessionStatus | "all";
export type AdminSessionReasonFilter =
  | CloudAdminSessionRevocationReason
  | "all";
export type AdminSessionScopeFilter = "all" | "current";
export type AdminSessionSortFieldFilter = CloudAdminSessionSortField;
export type AdminSessionSortDirectionFilter = CloudAdminSessionSortDirection;
export type AdminSessionSourceGroupSortFieldFilter =
  CloudAdminSessionSourceGroupSortField;
export type AdminSessionSourceGroupSortDirectionFilter =
  CloudAdminSessionSortDirection;
export type AdminSessionSourceGroupRiskLevelFilter =
  | CloudAdminSessionSourceGroupRiskLevel
  | "all";

export type AdminSessionsRouteSearch = {
  status: AdminSessionStatusFilter;
  revocationReason: AdminSessionReasonFilter;
  scope: AdminSessionScopeFilter;
  query: string;
  sourceKey: string;
  sourceIssuedFromIp: string;
  sourceIssuedUserAgent: string;
  sortBy: AdminSessionSortFieldFilter;
  sortDirection: AdminSessionSortDirectionFilter;
  page: number;
  pageSize: number;
  sourceSortBy: AdminSessionSourceGroupSortFieldFilter;
  sourceSortDirection: AdminSessionSourceGroupSortDirectionFilter;
  sourceRiskLevel: AdminSessionSourceGroupRiskLevelFilter;
  sourcePage: number;
  sourcePageSize: number;
};

export const ADMIN_SESSION_STATUS_FILTERS: AdminSessionStatusFilter[] = [
  "all",
  "active",
  "expired",
  "revoked",
];

export const ADMIN_SESSION_REASON_FILTERS: AdminSessionReasonFilter[] = [
  "all",
  "logout",
  "manual-revocation",
  "refresh-token-reuse",
];

export const ADMIN_SESSION_SCOPE_FILTERS: AdminSessionScopeFilter[] = [
  "all",
  "current",
];
export const ADMIN_SESSION_SORT_FIELDS: AdminSessionSortFieldFilter[] = [
  "updatedAt",
  "createdAt",
  "expiresAt",
  "lastUsedAt",
  "revokedAt",
];
export const ADMIN_SESSION_SORT_DIRECTIONS: AdminSessionSortDirectionFilter[] =
  ["desc", "asc"];
export const ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS: AdminSessionSourceGroupSortFieldFilter[] =
  [
    "activeSessions",
    "totalSessions",
    "latestLastUsedAt",
    "latestCreatedAt",
    "latestRevokedAt",
  ];
export const ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTIONS: AdminSessionSourceGroupSortDirectionFilter[] =
  ["desc", "asc"];
export const ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS: AdminSessionSourceGroupRiskLevelFilter[] =
  ["all", "critical", "watch", "normal"];

export const ADMIN_SESSION_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const ADMIN_SESSION_SOURCE_GROUP_PAGE_SIZE_OPTIONS = [6, 12, 24] as const;

export const DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH: AdminSessionsRouteSearch = {
  status: "all",
  revocationReason: "all",
  scope: "all",
  query: "",
  sourceKey: "",
  sourceIssuedFromIp: "",
  sourceIssuedUserAgent: "",
  sortBy: "updatedAt",
  sortDirection: "desc",
  page: 1,
  pageSize: 10,
  sourceSortBy: "activeSessions",
  sourceSortDirection: "desc",
  sourceRiskLevel: "all",
  sourcePage: 1,
  sourcePageSize: 6,
};

const STATUS_FILTER_SET = new Set<string>(ADMIN_SESSION_STATUS_FILTERS);
const REASON_FILTER_SET = new Set<string>(ADMIN_SESSION_REASON_FILTERS);
const SCOPE_FILTER_SET = new Set<string>(ADMIN_SESSION_SCOPE_FILTERS);
const SORT_FIELD_SET = new Set<string>(ADMIN_SESSION_SORT_FIELDS);
const SORT_DIRECTION_SET = new Set<string>(ADMIN_SESSION_SORT_DIRECTIONS);
const SOURCE_SORT_FIELD_SET = new Set<string>(
  ADMIN_SESSION_SOURCE_GROUP_SORT_FIELDS,
);
const SOURCE_SORT_DIRECTION_SET = new Set<string>(
  ADMIN_SESSION_SOURCE_GROUP_SORT_DIRECTIONS,
);
const SOURCE_RISK_LEVEL_SET = new Set<string>(
  ADMIN_SESSION_SOURCE_GROUP_RISK_LEVELS,
);
const PAGE_SIZE_SET = new Set<number>(ADMIN_SESSION_PAGE_SIZE_OPTIONS);
const SOURCE_PAGE_SIZE_SET = new Set<number>(
  ADMIN_SESSION_SOURCE_GROUP_PAGE_SIZE_OPTIONS,
);

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

export function buildAdminSessionsRouteSearch(
  search?: Partial<Record<keyof AdminSessionsRouteSearch, unknown>>,
): AdminSessionsRouteSearch {
  const status = normalizeRouteString(search?.status);
  const revocationReason = normalizeRouteString(search?.revocationReason);
  const scope = normalizeRouteString(search?.scope);
  const sortBy = normalizeRouteString(search?.sortBy);
  const sortDirection = normalizeRouteString(search?.sortDirection);
  const sourceKey = normalizeRouteString(search?.sourceKey);
  const sourceIssuedFromIp = normalizeRouteString(search?.sourceIssuedFromIp);
  const sourceIssuedUserAgent = normalizeRouteString(
    search?.sourceIssuedUserAgent,
  );
  const sourceSortBy = normalizeRouteString(search?.sourceSortBy);
  const sourceSortDirection = normalizeRouteString(search?.sourceSortDirection);
  const sourceRiskLevel = normalizeRouteString(search?.sourceRiskLevel);
  const pageSize = normalizePositiveInteger(
    search?.pageSize,
    DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.pageSize,
  );
  const sourcePageSize = normalizePositiveInteger(
    search?.sourcePageSize,
    DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourcePageSize,
  );

  return {
    status: STATUS_FILTER_SET.has(status)
      ? (status as AdminSessionStatusFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.status,
    revocationReason: REASON_FILTER_SET.has(revocationReason)
      ? (revocationReason as AdminSessionReasonFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.revocationReason,
    scope: SCOPE_FILTER_SET.has(scope)
      ? (scope as AdminSessionScopeFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.scope,
    query:
      typeof search?.query === "string"
        ? search.query
        : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.query,
    sourceKey,
    sourceIssuedFromIp,
    sourceIssuedUserAgent,
    sortBy: SORT_FIELD_SET.has(sortBy)
      ? (sortBy as AdminSessionSortFieldFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sortBy,
    sortDirection: SORT_DIRECTION_SET.has(sortDirection)
      ? (sortDirection as AdminSessionSortDirectionFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sortDirection,
    page: normalizePositiveInteger(
      search?.page,
      DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.page,
    ),
    pageSize: PAGE_SIZE_SET.has(pageSize)
      ? pageSize
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.pageSize,
    sourceSortBy: SOURCE_SORT_FIELD_SET.has(sourceSortBy)
      ? (sourceSortBy as AdminSessionSourceGroupSortFieldFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourceSortBy,
    sourceSortDirection: SOURCE_SORT_DIRECTION_SET.has(sourceSortDirection)
      ? (sourceSortDirection as AdminSessionSourceGroupSortDirectionFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourceSortDirection,
    sourceRiskLevel: SOURCE_RISK_LEVEL_SET.has(sourceRiskLevel)
      ? (sourceRiskLevel as AdminSessionSourceGroupRiskLevelFilter)
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourceRiskLevel,
    sourcePage: normalizePositiveInteger(
      search?.sourcePage,
      DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourcePage,
    ),
    sourcePageSize: SOURCE_PAGE_SIZE_SET.has(sourcePageSize)
      ? sourcePageSize
      : DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourcePageSize,
  };
}

export function validateAdminSessionsRouteSearch(
  search: Record<string, unknown>,
) {
  return buildAdminSessionsRouteSearch({
    status: normalizeRouteString(search.status),
    revocationReason: normalizeRouteString(search.revocationReason),
    scope: normalizeRouteString(search.scope),
    query: typeof search.query === "string" ? search.query : "",
    sourceKey: normalizeRouteString(search.sourceKey),
    sourceIssuedFromIp: normalizeRouteString(search.sourceIssuedFromIp),
    sourceIssuedUserAgent: normalizeRouteString(search.sourceIssuedUserAgent),
    sortBy: normalizeRouteString(search.sortBy),
    sortDirection: normalizeRouteString(search.sortDirection),
    page: search.page,
    pageSize: search.pageSize,
    sourceSortBy: normalizeRouteString(search.sourceSortBy),
    sourceSortDirection: normalizeRouteString(search.sourceSortDirection),
    sourceRiskLevel: normalizeRouteString(search.sourceRiskLevel),
    sourcePage: search.sourcePage,
    sourcePageSize: search.sourcePageSize,
  });
}

export function buildCompactAdminSessionsRouteSearch(
  search?: Partial<AdminSessionsRouteSearch>,
) {
  const normalized = buildAdminSessionsRouteSearch(search);
  const compact: Partial<AdminSessionsRouteSearch> = {};

  if (normalized.status !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.status) {
    compact.status = normalized.status;
  }
  if (
    normalized.revocationReason !==
    DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.revocationReason
  ) {
    compact.revocationReason = normalized.revocationReason;
  }
  if (normalized.scope !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.scope) {
    compact.scope = normalized.scope;
  }
  if (normalized.query) {
    compact.query = normalized.query;
  }
  if (normalized.sourceKey) {
    compact.sourceKey = normalized.sourceKey;
  }
  if (normalized.sourceIssuedFromIp) {
    compact.sourceIssuedFromIp = normalized.sourceIssuedFromIp;
  }
  if (normalized.sourceIssuedUserAgent) {
    compact.sourceIssuedUserAgent = normalized.sourceIssuedUserAgent;
  }
  if (normalized.sortBy !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sortBy) {
    compact.sortBy = normalized.sortBy;
  }
  if (
    normalized.sortDirection !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sortDirection
  ) {
    compact.sortDirection = normalized.sortDirection;
  }
  if (normalized.page !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.page) {
    compact.page = normalized.page;
  }
  if (normalized.pageSize !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.pageSize) {
    compact.pageSize = normalized.pageSize;
  }
  if (
    normalized.sourceSortBy !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourceSortBy
  ) {
    compact.sourceSortBy = normalized.sourceSortBy;
  }
  if (
    normalized.sourceSortDirection !==
    DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourceSortDirection
  ) {
    compact.sourceSortDirection = normalized.sourceSortDirection;
  }
  if (
    normalized.sourceRiskLevel !==
    DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourceRiskLevel
  ) {
    compact.sourceRiskLevel = normalized.sourceRiskLevel;
  }
  if (normalized.sourcePage !== DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourcePage) {
    compact.sourcePage = normalized.sourcePage;
  }
  if (
    normalized.sourcePageSize !==
    DEFAULT_ADMIN_SESSIONS_ROUTE_SEARCH.sourcePageSize
  ) {
    compact.sourcePageSize = normalized.sourcePageSize;
  }

  return compact;
}

export function buildAdminSessionsPermalink(
  search?: Partial<AdminSessionsRouteSearch>,
) {
  const compact = buildCompactAdminSessionsRouteSearch(search);
  const params = new URLSearchParams();

  if (compact.status) {
    params.set("status", compact.status);
  }
  if (compact.revocationReason) {
    params.set("revocationReason", compact.revocationReason);
  }
  if (compact.scope) {
    params.set("scope", compact.scope);
  }
  if (compact.query) {
    params.set("query", compact.query);
  }
  if (compact.sourceKey) {
    params.set("sourceKey", compact.sourceKey);
  }
  if (compact.sourceIssuedFromIp) {
    params.set("sourceIssuedFromIp", compact.sourceIssuedFromIp);
  }
  if (compact.sourceIssuedUserAgent) {
    params.set("sourceIssuedUserAgent", compact.sourceIssuedUserAgent);
  }
  if (compact.sortBy) {
    params.set("sortBy", compact.sortBy);
  }
  if (compact.sortDirection) {
    params.set("sortDirection", compact.sortDirection);
  }
  if (typeof compact.page === "number") {
    params.set("page", String(compact.page));
  }
  if (typeof compact.pageSize === "number") {
    params.set("pageSize", String(compact.pageSize));
  }
  if (compact.sourceSortBy) {
    params.set("sourceSortBy", compact.sourceSortBy);
  }
  if (compact.sourceSortDirection) {
    params.set("sourceSortDirection", compact.sourceSortDirection);
  }
  if (compact.sourceRiskLevel) {
    params.set("sourceRiskLevel", compact.sourceRiskLevel);
  }
  if (typeof compact.sourcePage === "number") {
    params.set("sourcePage", String(compact.sourcePage));
  }
  if (typeof compact.sourcePageSize === "number") {
    params.set("sourcePageSize", String(compact.sourcePageSize));
  }

  const queryString = params.toString();
  return queryString ? `/sessions?${queryString}` : "/sessions";
}
