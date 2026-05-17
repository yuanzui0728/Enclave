import type {
  ClearFailedCloudWaitingSessionSyncTasksResponse,
  ClearFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ClearFilteredFailedCloudWaitingSessionSyncTasksResponse,
  CloudAdminSessionSourceGroupRiskSnapshot,
  CloudAdminSessionSourceGroupSnapshot,
  CloudAdminSessionSourceGroupListResponse,
  CloudAdminSessionSourceGroupQuery,
  CreateCloudAdminSessionSourceGroupRiskSnapshotRequest,
  CreateCloudAdminSessionSourceGroupSnapshotRequest,
  CloudAdminSessionListResponse,
  CloudAdminSessionListQuery,
  CloudAdminSessionSummary,
  CloudComputeProviderSummary,
  CloudFeedbackSummary,
  CloudWaitingSessionSyncTaskListQuery,
  CloudWaitingSessionSyncTaskListResponse,
  CloudWorldAlertSummary,
  CloudWorldDriftSummary,
  CloudWorldAdminBootstrap,
  CloudWorldBootstrapConfig,
  CloudWorldInstanceFleetItem,
  CloudWorldLifecycleJobAggregateSummary,
  CloudWorldLifecycleJobListResponse,
  CloudWorldRuntimeStatusSummary,
  CloudInstanceSummary,
  CloudWorldLifecycleJobListQuery,
  CloudWorldLifecycleStatus,
  CloudWorldSummary,
  CloudApiErrorResponse,
  CloudConfigEntry,
  CloudUserDetail,
  CloudUserListQuery,
  CloudUserListResponse,
  BanCloudUserRequest,
  GrantSubscriptionRequest,
  IssueCloudAdminAccessTokenResponse,
  InviteRedemptionListQuery,
  InviteRedemptionListResponse,
  ListCloudFeedbacksQuery,
  ListCloudFeedbacksResponse,
  UpdateCloudFeedbackStatusRequest,
  ReplayFailedCloudWaitingSessionSyncTasksResponse,
  ReplayFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse,
  RevenueEventListResponse,
  RevenueLedgerListResponse,
  RevenuePayeeSummary,
  RevenueSettlementBatchSummary,
  RevenueSettlementPreviewRequest,
  RevenueSettlementPreviewResponse,
  CloudTokenPricingCatalogResponse,
  CloudTokenPricingItem,
  CloudTokenPricingSyncResult,
  CloudTokenUsageBudgetItem,
  CloudTokenUsageBudgetResponse,
  CloudTokenUsageOverviewResponse,
  CloudTokenUsageWorldListResponse,
  TokenUsageBreakdownResponse,
  TokenUsageTrendPoint,
  UpdateCloudTokenUsageBudgetRequest,
  UpsertCloudTokenPricingRequest,
  RevenueSharingPolicySummary,
  RejectInviteRedemptionRequest,
  RevokeCloudAdminSessionSourceGroupRequest,
  RevokeCloudAdminSessionSourceGroupResponse,
  RevokeCloudAdminSessionSourceGroupsByRiskRequest,
  RevokeCloudAdminSessionSourceGroupsByRiskResponse,
  RevokeCloudAdminSessionsByFilterRequest,
  RevokeCloudAdminSessionsByFilterResponse,
  RevokeCloudAdminSessionsByIdResponse,
  SubscriptionPlanSummary,
  SubscriptionRecordSummary,
  MinimaxHourlyTelemetryResponse,
  TelemetryApiHealthResponse,
  TelemetryAppId,
  TelemetryErrorsResponse,
  TelemetryFunnelResponse,
  TelemetryOverviewResponse,
  TelemetryRange,
  TelemetryTimeseriesResponse,
  TelemetryTopEventsResponse,
  TelemetryTopWorldsResponse,
  TelemetryTopWorldsSortDir,
  TelemetryTopWorldsSortKey,
  TelemetryWorldRow,
  UpdateRevenueSharingPolicyRequest,
  UpsertCloudConfigRequest,
  UpsertRevenuePayeeRequest,
  UpsertSubscriptionPlanRequest,
  WikiUserListQuery,
  WikiUserListResponse,
  WikiUserPrivateCharacterListResponse,
  WorldLifecycleJobSummary,
} from "@yinjie/contracts";
import {
  formatCloudConsoleApiStatusError,
  formatCloudConsoleUnableToReachApiMessage,
  getCurrentCloudConsoleLocale,
  translateCloudConsoleTextForActiveLocale,
} from "./cloud-console-i18n";

const ADMIN_SECRET_KEY = "yinjie_cloud_admin_secret";
const ADMIN_ACCESS_TOKEN_KEY = "yinjie_cloud_admin_access_token";
const ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY =
  "yinjie_cloud_admin_access_token_expires_at";
const ADMIN_REFRESH_TOKEN_KEY = "yinjie_cloud_admin_refresh_token";
const ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY =
  "yinjie_cloud_admin_refresh_token_expires_at";
const ADMIN_ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;
export const CLOUD_ADMIN_SECRET_INVALID_EVENT =
  "yinjie-cloud-admin-secret-invalid";

export type CloudAdminApiResponseWithMeta<T> = {
  data: T;
  requestId: string | null;
};

export class CloudAdminApiError extends Error {
  readonly requestId: string | null;
  readonly errorCode: string | null;
  readonly statusCode: number | null;
  readonly params: CloudApiErrorResponse["params"] | null;

  constructor(
    message: string,
    requestId: string | null = null,
    options: {
      errorCode?: string | null;
      statusCode?: number | null;
      params?: CloudApiErrorResponse["params"] | null;
    } = {},
  ) {
    super(message);
    // i18n-ignore-next-line: Error class identifier, not user-facing copy.
    this.name = "CloudAdminApiError";
    this.requestId = requestId;
    this.errorCode = options.errorCode ?? null;
    this.statusCode = options.statusCode ?? null;
    this.params = options.params ?? null;
  }
}

export function getCloudAdminApiErrorRequestId(error: unknown) {
  return error instanceof CloudAdminApiError ? error.requestId : null;
}

export function getCloudAdminApiErrorCode(error: unknown) {
  return error instanceof CloudAdminApiError ? error.errorCode : null;
}

let inFlightAdminTokenPromise: Promise<IssueCloudAdminAccessTokenResponse> | null =
  null;

type CloudAdminSecretInvalidEventDetail = {
  requestId: string | null;
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function addCloudAdminSecretInvalidListener(
  listener: (detail: CloudAdminSecretInvalidEventDetail) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const eventListener = (event: Event) => {
    listener(
      event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === "object"
        ? (event.detail as CloudAdminSecretInvalidEventDetail)
        : { requestId: null },
    );
  };

  window.addEventListener(CLOUD_ADMIN_SECRET_INVALID_EVENT, eventListener);
  return () =>
    window.removeEventListener(CLOUD_ADMIN_SECRET_INVALID_EVENT, eventListener);
}

function notifyCloudAdminSecretInvalid(requestId: string | null) {
  setCloudAdminSecret("");

  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<CloudAdminSecretInvalidEventDetail>(
      CLOUD_ADMIN_SECRET_INVALID_EVENT,
      {
        detail: { requestId },
      },
    ),
  );
}

type CloudAdminRuntimeLocation = {
  hostname: string;
  origin: string;
  port: string;
  protocol: string;
};

function isLocalHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]"
  );
}

function isLocalVitePort(port: string) {
  if (!/^\d+$/.test(port)) {
    return false;
  }

  const portNumber = Number(port);
  return (
    (portNumber >= 5173 && portNumber <= 5199) ||
    (portNumber >= 4173 && portNumber <= 4199)
  );
}

export function resolveCloudAdminApiBaseFromLocation({
  configuredBase,
  location,
}: {
  configuredBase?: string | null;
  location?: CloudAdminRuntimeLocation | null;
}) {
  const normalizedConfiguredBase = configuredBase?.trim();
  if (normalizedConfiguredBase) {
    return normalizedConfiguredBase.replace(/\/+$/, "");
  }

  if (
    location &&
    (location.protocol === "http:" || location.protocol === "https:") &&
    isLocalHostname(location.hostname) &&
    isLocalVitePort(location.port)
  ) {
    return "http://127.0.0.1:3001";
  }

  if (
    location &&
    (location.protocol === "http:" || location.protocol === "https:")
  ) {
    return location.origin;
  }

  return "http://127.0.0.1:3001";
}

function resolveCloudAdminApiBase() {
  return resolveCloudAdminApiBaseFromLocation({
    configuredBase: import.meta.env.VITE_CLOUD_API_BASE,
    location: typeof window !== "undefined" ? window.location : null,
  });
}

function createCloudAdminLocaleHeaders() {
  const locale = getCurrentCloudConsoleLocale();
  return {
    "Accept-Language": locale,
    "X-Yinjie-Locale": locale,
  };
}

function mergeHeaders(...headerSets: (HeadersInit | undefined)[]) {
  const headers = new Headers();

  for (const headerSet of headerSets) {
    if (!headerSet) {
      continue;
    }

    new Headers(headerSet).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getNetworkErrorDetail(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : translateCloudConsoleTextForActiveLocale("Network request failed.");
}

function createNetworkError(apiBase: string, error: unknown) {
  return new CloudAdminApiError(
    formatCloudConsoleUnableToReachApiMessage({
      apiBase,
      detail: getNetworkErrorDetail(error),
      locale: getCurrentCloudConsoleLocale(),
    }),
    null,
    {
      errorCode: "CLOUD_ADMIN_API_UNREACHABLE",
    },
  );
}

type CloudAdminApiErrorPayload = Partial<CloudApiErrorResponse> & {
  error?: string;
  message?: string | string[];
};

function parseCloudAdminApiErrorPayload(rawBody: string) {
  if (!rawBody.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawBody) as CloudAdminApiErrorPayload;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeCloudAdminApiPayloadMessage(
  payload: CloudAdminApiErrorPayload | null,
) {
  if (!payload) {
    return "";
  }

  if (Array.isArray(payload.message)) {
    return payload.message.filter(Boolean).join(" ");
  }

  return typeof payload.message === "string" ? payload.message.trim() : "";
}

function createCloudAdminApiErrorFromResponse({
  fallbackMessage,
  rawBody,
  requestId,
  statusCode,
}: {
  fallbackMessage?: string;
  rawBody: string;
  requestId: string | null;
  statusCode: number;
}) {
  const payload = parseCloudAdminApiErrorPayload(rawBody);
  const payloadMessage = normalizeCloudAdminApiPayloadMessage(payload);
  const rawMessage = rawBody.trim();
  const message =
    payloadMessage ||
    (payload?.errorCode
      ? translateCloudConsoleTextForActiveLocale(payload.errorCode)
      : "") ||
    (rawMessage
      ? translateCloudConsoleTextForActiveLocale(rawMessage)
      : fallbackMessage) ||
    formatCloudConsoleApiStatusError(
      statusCode,
      getCurrentCloudConsoleLocale(),
    );

  return new CloudAdminApiError(message, requestId, {
    errorCode:
      typeof payload?.errorCode === "string" && payload.errorCode.trim()
        ? payload.errorCode.trim()
        : null,
    params: payload?.params ?? null,
    statusCode,
  });
}

function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getCloudAdminSecret() {
  return getStorage()?.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
}

export function setCloudAdminSecret(secret: string) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const normalizedSecret = secret.trim();
  if (normalizedSecret) {
    storage.setItem(ADMIN_SECRET_KEY, normalizedSecret);
  } else {
    storage.removeItem(ADMIN_SECRET_KEY);
  }

  clearCloudAdminSessionTokens();
}

function clearCloudAdminSessionTokens() {
  const storage = getStorage();
  storage?.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  storage?.removeItem(ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY);
  storage?.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  storage?.removeItem(ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY);
  inFlightAdminTokenPromise = null;
}

function clearStoredCloudAdminAccessToken() {
  const storage = getStorage();
  storage?.removeItem(ADMIN_ACCESS_TOKEN_KEY);
  storage?.removeItem(ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY);
}

function getStoredToken(tokenKey: string, expiresAtKey: string) {
  const storage = getStorage();
  const token = storage?.getItem(tokenKey)?.trim() ?? "";
  const expiresAtRaw = storage?.getItem(expiresAtKey)?.trim() ?? "";
  const expiresAt = Date.parse(expiresAtRaw);

  if (!token || !Number.isFinite(expiresAt)) {
    return null;
  }

  return {
    token,
    expiresAt,
  };
}

function getStoredCloudAdminAccessToken() {
  return getStoredToken(
    ADMIN_ACCESS_TOKEN_KEY,
    ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY,
  );
}

function getStoredCloudAdminRefreshToken() {
  return getStoredToken(
    ADMIN_REFRESH_TOKEN_KEY,
    ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY,
  );
}

function storeCloudAdminAccessToken(
  response: IssueCloudAdminAccessTokenResponse,
) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(ADMIN_ACCESS_TOKEN_KEY, response.accessToken);
  storage.setItem(ADMIN_ACCESS_TOKEN_EXPIRES_AT_KEY, response.expiresAt);
  storage.setItem(ADMIN_REFRESH_TOKEN_KEY, response.refreshToken);
  storage.setItem(
    ADMIN_REFRESH_TOKEN_EXPIRES_AT_KEY,
    response.refreshExpiresAt,
  );
}

async function issueCloudAdminAccessToken(
  secret: string,
): Promise<IssueCloudAdminAccessTokenResponse> {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) {
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "CLOUD_ADMIN_SECRET is required.",
      ),
      null,
      {
        errorCode: "CLOUD_ADMIN_SECRET_REQUIRED",
      },
    );
  }

  const apiBase = resolveCloudAdminApiBase();
  let response: Response;

  try {
    response = await fetch(`${apiBase}/admin/cloud/auth/token`, {
      method: "POST",
      headers: mergeHeaders(createCloudAdminLocaleHeaders(), {
        "X-Admin-Secret": normalizedSecret,
      }),
    });
  } catch (error) {
    throw createNetworkError(apiBase, error);
  }

  if (response.status === 401) {
    const requestId = getResponseRequestId(response);
    notifyCloudAdminSecretInvalid(requestId);
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "CLOUD_ADMIN_SECRET is invalid.",
      ),
      requestId,
      {
        errorCode: "CLOUD_ADMIN_SECRET_INVALID",
        statusCode: 401,
      },
    );
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw createCloudAdminApiErrorFromResponse({
      rawBody,
      requestId: getResponseRequestId(response),
      statusCode: response.status,
    });
  }

  if (!rawBody) {
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "Cloud admin token exchange returned an empty response.",
      ),
      getResponseRequestId(response),
      {
        errorCode: "CLOUD_ADMIN_EMPTY_TOKEN_RESPONSE",
        statusCode: response.status,
      },
    );
  }

  return JSON.parse(rawBody) as IssueCloudAdminAccessTokenResponse;
}

async function refreshCloudAdminAccessToken(
  refreshToken: string,
): Promise<IssueCloudAdminAccessTokenResponse> {
  const apiBase = resolveCloudAdminApiBase();
  let response: Response;

  try {
    response = await fetch(`${apiBase}/admin/cloud/auth/refresh`, {
      method: "POST",
      headers: mergeHeaders(createCloudAdminLocaleHeaders(), {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        refreshToken,
      }),
    });
  } catch (error) {
    throw createNetworkError(apiBase, error);
  }

  if (response.status === 401) {
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "Cloud admin session is invalid or expired.",
      ),
      getResponseRequestId(response),
      {
        errorCode: "CLOUD_ADMIN_SESSION_INVALID",
        statusCode: 401,
      },
    );
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw createCloudAdminApiErrorFromResponse({
      rawBody,
      requestId: getResponseRequestId(response),
      statusCode: response.status,
    });
  }

  if (!rawBody) {
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "Cloud admin refresh returned an empty response.",
      ),
      getResponseRequestId(response),
      {
        errorCode: "CLOUD_ADMIN_EMPTY_REFRESH_RESPONSE",
        statusCode: response.status,
      },
    );
  }

  return JSON.parse(rawBody) as IssueCloudAdminAccessTokenResponse;
}

async function revokeCloudAdminSession(refreshToken: string) {
  const apiBase = resolveCloudAdminApiBase();

  try {
    await fetch(`${apiBase}/admin/cloud/auth/logout`, {
      method: "POST",
      headers: mergeHeaders(createCloudAdminLocaleHeaders(), {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        refreshToken,
      }),
    });
  } catch {
    return;
  }
}

export async function revokeStoredCloudAdminSession() {
  const storedRefreshToken = getStoredCloudAdminRefreshToken();
  clearCloudAdminSessionTokens();
  if (!storedRefreshToken) {
    return;
  }

  await revokeCloudAdminSession(storedRefreshToken.token);
}

async function ensureCloudAdminAccessToken(forceRefresh = false) {
  const secret = getCloudAdminSecret();
  if (!forceRefresh) {
    const storedToken = getStoredCloudAdminAccessToken();
    if (
      storedToken &&
      storedToken.expiresAt - Date.now() > ADMIN_ACCESS_TOKEN_REFRESH_SKEW_MS
    ) {
      return storedToken.token;
    }

    if (inFlightAdminTokenPromise) {
      return (await inFlightAdminTokenPromise).accessToken;
    }
  }

  const storedRefreshToken = getStoredCloudAdminRefreshToken();
  if (
    storedRefreshToken &&
    storedRefreshToken.expiresAt - Date.now() >
      ADMIN_ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    inFlightAdminTokenPromise = refreshCloudAdminAccessToken(
      storedRefreshToken.token,
    );

    try {
      const response = await inFlightAdminTokenPromise;
      storeCloudAdminAccessToken(response);
      return response.accessToken;
    } catch (error) {
      clearCloudAdminSessionTokens();
      if (!secret) {
        throw error;
      }
    } finally {
      inFlightAdminTokenPromise = null;
    }
  }

  if (!secret) {
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "CLOUD_ADMIN_SECRET is required.",
      ),
      null,
      {
        errorCode: "CLOUD_ADMIN_SECRET_REQUIRED",
      },
    );
  }

  inFlightAdminTokenPromise = issueCloudAdminAccessToken(secret);

  try {
    const response = await inFlightAdminTokenPromise;
    storeCloudAdminAccessToken(response);
    return response.accessToken;
  } finally {
    inFlightAdminTokenPromise = null;
  }
}

async function sendAdminRequest(
  path: string,
  accessToken: string,
  options?: RequestInit,
) {
  const apiBase = resolveCloudAdminApiBase();
  const { headers: optionHeaders, ...requestInit } = options ?? {};

  try {
    return await fetch(`${apiBase}/admin/cloud${path}`, {
      ...requestInit,
      headers: mergeHeaders(
        createCloudAdminLocaleHeaders(),
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        optionHeaders,
      ),
    });
  } catch (error) {
    throw createNetworkError(apiBase, error);
  }
}

function getResponseRequestId(response: Response) {
  const requestId = response.headers?.get("X-Request-Id")?.trim();
  return requestId ? requestId : null;
}

async function adminFetchWithMeta<T>(
  path: string,
  options?: RequestInit,
): Promise<CloudAdminApiResponseWithMeta<T>> {
  let response = await sendAdminRequest(
    path,
    await ensureCloudAdminAccessToken(),
    options,
  );

  if (response.status === 401) {
    clearStoredCloudAdminAccessToken();
    response = await sendAdminRequest(
      path,
      await ensureCloudAdminAccessToken(true),
      options,
    );
  }

  if (response.status === 401) {
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale(
        "Cloud admin session is invalid or expired.",
      ),
      getResponseRequestId(response),
      {
        errorCode: "CLOUD_ADMIN_SESSION_INVALID",
        statusCode: 401,
      },
    );
  }

  const requestId = getResponseRequestId(response);
  const rawBody = await response.text();
  if (!response.ok) {
    throw createCloudAdminApiErrorFromResponse({
      rawBody,
      requestId,
      statusCode: response.status,
    });
  }

  return {
    data: rawBody ? (JSON.parse(rawBody) as T) : (undefined as T),
    requestId,
  };
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return (await adminFetchWithMeta<T>(path, options)).data;
}

export const cloudAdminApi = {
  listWorlds: (status?: CloudWorldLifecycleStatus) =>
    adminFetch<CloudWorldSummary[]>(`/worlds${buildQueryString({ status })}`),

  listInstances: (status?: CloudWorldLifecycleStatus) =>
    adminFetch<CloudWorldInstanceFleetItem[]>(
      `/instances${buildQueryString({ status })}`,
    ),

  getWorldDriftSummary: () =>
    adminFetch<CloudWorldDriftSummary>("/drift-summary"),

  getWorld: (id: string) => adminFetch<CloudWorldSummary>(`/worlds/${id}`),

  listProviders: () => adminFetch<CloudComputeProviderSummary[]>("/providers"),

  updateWorld: (
    id: string,
    payload: {
      phone?: string;
      name?: string;
      status?: CloudWorldLifecycleStatus;
      provisionStrategy?: string;
      providerKey?: string | null;
      providerRegion?: string | null;
      providerZone?: string | null;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) =>
    adminFetch<CloudWorldSummary>(`/worlds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateWorldWithMeta: (
    id: string,
    payload: {
      phone?: string;
      name?: string;
      status?: CloudWorldLifecycleStatus;
      provisionStrategy?: string;
      providerKey?: string | null;
      providerRegion?: string | null;
      providerZone?: string | null;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) =>
    adminFetchWithMeta<CloudWorldSummary>(`/worlds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listJobs: (filters?: CloudWorldLifecycleJobListQuery) =>
    adminFetch<CloudWorldLifecycleJobListResponse>(
      `/jobs${buildQueryString({
        worldId: filters?.worldId,
        status: filters?.status,
        jobType: filters?.jobType,
        provider: filters?.provider,
        queueState: filters?.queueState,
        audit: filters?.audit,
        supersededBy: filters?.supersededBy,
        query: filters?.query,
        sortBy: filters?.sortBy,
        sortDirection: filters?.sortDirection,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })}`,
    ),

  getJobSummary: (filters?: CloudWorldLifecycleJobListQuery) =>
    adminFetch<CloudWorldLifecycleJobAggregateSummary>(
      `/jobs/summary${buildQueryString({
        worldId: filters?.worldId,
        status: filters?.status,
        jobType: filters?.jobType,
        provider: filters?.provider,
        queueState: filters?.queueState,
        audit: filters?.audit,
        supersededBy: filters?.supersededBy,
        query: filters?.query,
      })}`,
    ),

  getJob: (id: string) => adminFetch<WorldLifecycleJobSummary>(`/jobs/${id}`),

  listWaitingSessionSyncTasks: (
    filters?: CloudWaitingSessionSyncTaskListQuery,
  ) =>
    adminFetch<CloudWaitingSessionSyncTaskListResponse>(
      `/waiting-session-sync-tasks${buildQueryString({
        status: filters?.status,
        taskType: filters?.taskType,
        query: filters?.query,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })}`,
    ),

  replayFailedWaitingSessionSyncTasks: (taskIds: string[]) =>
    adminFetch<ReplayFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/replay-failed",
      {
        method: "POST",
        body: JSON.stringify({
          taskIds,
        }),
      },
    ),

  replayFailedWaitingSessionSyncTasksWithMeta: (taskIds: string[]) =>
    adminFetchWithMeta<ReplayFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/replay-failed",
      {
        method: "POST",
        body: JSON.stringify({
          taskIds,
        }),
      },
    ),

  clearFailedWaitingSessionSyncTasks: (taskIds: string[]) =>
    adminFetch<ClearFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/clear-failed",
      {
        method: "POST",
        body: JSON.stringify({
          taskIds,
        }),
      },
    ),

  clearFailedWaitingSessionSyncTasksWithMeta: (taskIds: string[]) =>
    adminFetchWithMeta<ClearFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/clear-failed",
      {
        method: "POST",
        body: JSON.stringify({
          taskIds,
        }),
      },
    ),

  replayFilteredFailedWaitingSessionSyncTasks: (
    payload?: ReplayFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ) =>
    adminFetch<ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/replay-filtered-failed",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  replayFilteredFailedWaitingSessionSyncTasksWithMeta: (
    payload?: ReplayFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ) =>
    adminFetchWithMeta<ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/replay-filtered-failed",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  clearFilteredFailedWaitingSessionSyncTasks: (
    payload?: ClearFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ) =>
    adminFetch<ClearFilteredFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/clear-filtered-failed",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  clearFilteredFailedWaitingSessionSyncTasksWithMeta: (
    payload?: ClearFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ) =>
    adminFetchWithMeta<ClearFilteredFailedCloudWaitingSessionSyncTasksResponse>(
      "/waiting-session-sync-tasks/clear-filtered-failed",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  getWorldInstance: (worldId: string) =>
    adminFetch<CloudInstanceSummary | null>(`/worlds/${worldId}/instance`).then(
      (instance) => instance ?? null,
    ),

  getWorldBootstrapConfig: (worldId: string) =>
    adminFetch<CloudWorldBootstrapConfig>(
      `/worlds/${worldId}/bootstrap-config`,
    ),

  getWorldAdminBootstrap: (worldId: string) =>
    adminFetch<CloudWorldAdminBootstrap>(
      `/worlds/${worldId}/admin-bootstrap`,
    ),

  getWorldRuntimeStatus: (worldId: string) =>
    adminFetch<CloudWorldRuntimeStatusSummary>(
      `/worlds/${worldId}/runtime-status`,
    ),

  getWorldAlertSummary: (worldId: string) =>
    adminFetch<CloudWorldAlertSummary>(`/worlds/${worldId}/alert-summary`),

  reconcileWorld: (worldId: string) =>
    adminFetch<CloudWorldSummary>(`/worlds/${worldId}/reconcile`, {
      method: "POST",
    }),

  reconcileWorldWithMeta: (worldId: string) =>
    adminFetchWithMeta<CloudWorldSummary>(`/worlds/${worldId}/reconcile`, {
      method: "POST",
    }),

  resumeWorld: (worldId: string) =>
    adminFetch<CloudWorldSummary>(`/worlds/${worldId}/resume`, {
      method: "POST",
    }),

  resumeWorldWithMeta: (worldId: string) =>
    adminFetchWithMeta<CloudWorldSummary>(`/worlds/${worldId}/resume`, {
      method: "POST",
    }),

  suspendWorld: (worldId: string) =>
    adminFetch<CloudWorldSummary>(`/worlds/${worldId}/suspend`, {
      method: "POST",
    }),

  suspendWorldWithMeta: (worldId: string) =>
    adminFetchWithMeta<CloudWorldSummary>(`/worlds/${worldId}/suspend`, {
      method: "POST",
    }),

  retryWorld: (worldId: string) =>
    adminFetch<CloudWorldSummary>(`/worlds/${worldId}/retry`, {
      method: "POST",
    }),

  retryWorldWithMeta: (worldId: string) =>
    adminFetchWithMeta<CloudWorldSummary>(`/worlds/${worldId}/retry`, {
      method: "POST",
    }),

  rotateWorldCallbackToken: (worldId: string) =>
    adminFetch<CloudWorldBootstrapConfig>(
      `/worlds/${worldId}/rotate-callback-token`,
      { method: "POST" },
    ),

  rotateWorldCallbackTokenWithMeta: (worldId: string) =>
    adminFetchWithMeta<CloudWorldBootstrapConfig>(
      `/worlds/${worldId}/rotate-callback-token`,
      { method: "POST" },
    ),

  listAdminSessions: (filters?: CloudAdminSessionListQuery) =>
    adminFetch<CloudAdminSessionListResponse>(
      `/admin-sessions${buildQueryString({
        status: filters?.status,
        revocationReason: filters?.revocationReason,
        currentOnly: filters?.currentOnly,
        query: filters?.query,
        sourceKey: filters?.sourceKey,
        sortBy: filters?.sortBy,
        sortDirection: filters?.sortDirection,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })}`,
    ),

  listAdminSessionSourceGroups: (filters?: CloudAdminSessionSourceGroupQuery) =>
    adminFetch<CloudAdminSessionSourceGroupListResponse>(
      `/admin-session-source-groups${buildQueryString({
        status: filters?.status,
        revocationReason: filters?.revocationReason,
        currentOnly: filters?.currentOnly,
        query: filters?.query,
        sourceKey: filters?.sourceKey,
        riskLevel: filters?.riskLevel,
        sortBy: filters?.sortBy,
        sortDirection: filters?.sortDirection,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })}`,
    ),

  revokeAdminSessionById: (sessionId: string) =>
    adminFetch<{ success: true }>(`/admin-sessions/${sessionId}/revoke`, {
      method: "POST",
    }),

  revokeAdminSessionByIdWithMeta: (sessionId: string) =>
    adminFetchWithMeta<{ success: true }>(
      `/admin-sessions/${sessionId}/revoke`,
      {
        method: "POST",
      },
    ),

  revokeAdminSessionsById: (sessionIds: string[]) =>
    adminFetch<RevokeCloudAdminSessionsByIdResponse>("/admin-sessions/revoke", {
      method: "POST",
      body: JSON.stringify({
        sessionIds,
      }),
    }),

  revokeAdminSessionsByIdWithMeta: (sessionIds: string[]) =>
    adminFetchWithMeta<RevokeCloudAdminSessionsByIdResponse>(
      "/admin-sessions/revoke",
      {
        method: "POST",
        body: JSON.stringify({
          sessionIds,
        }),
      },
    ),

  revokeFilteredAdminSessions: (
    payload?: RevokeCloudAdminSessionsByFilterRequest,
  ) =>
    adminFetch<RevokeCloudAdminSessionsByFilterResponse>(
      "/admin-sessions/revoke-filtered",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  revokeFilteredAdminSessionsWithMeta: (
    payload?: RevokeCloudAdminSessionsByFilterRequest,
  ) =>
    adminFetchWithMeta<RevokeCloudAdminSessionsByFilterResponse>(
      "/admin-sessions/revoke-filtered",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  revokeAdminSessionSourceGroup: (
    payload: RevokeCloudAdminSessionSourceGroupRequest,
  ) =>
    adminFetch<RevokeCloudAdminSessionSourceGroupResponse>(
      "/admin-session-source-groups/revoke",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  revokeAdminSessionSourceGroupWithMeta: (
    payload: RevokeCloudAdminSessionSourceGroupRequest,
  ) =>
    adminFetchWithMeta<RevokeCloudAdminSessionSourceGroupResponse>(
      "/admin-session-source-groups/revoke",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  revokeAdminSessionSourceGroupsByRisk: (
    payload: RevokeCloudAdminSessionSourceGroupsByRiskRequest,
  ) =>
    adminFetch<RevokeCloudAdminSessionSourceGroupsByRiskResponse>(
      "/admin-session-source-groups/revoke-risk",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  revokeAdminSessionSourceGroupsByRiskWithMeta: (
    payload: RevokeCloudAdminSessionSourceGroupsByRiskRequest,
  ) =>
    adminFetchWithMeta<RevokeCloudAdminSessionSourceGroupsByRiskResponse>(
      "/admin-session-source-groups/revoke-risk",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  createAdminSessionSourceGroupSnapshot: (
    payload: CreateCloudAdminSessionSourceGroupSnapshotRequest,
  ) =>
    adminFetch<CloudAdminSessionSourceGroupSnapshot>(
      "/admin-session-source-groups/snapshot",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  createAdminSessionSourceGroupSnapshotWithMeta: (
    payload: CreateCloudAdminSessionSourceGroupSnapshotRequest,
  ) =>
    adminFetchWithMeta<CloudAdminSessionSourceGroupSnapshot>(
      "/admin-session-source-groups/snapshot",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  createAdminSessionSourceGroupRiskSnapshot: (
    payload: CreateCloudAdminSessionSourceGroupRiskSnapshotRequest,
  ) =>
    adminFetch<CloudAdminSessionSourceGroupRiskSnapshot>(
      "/admin-session-source-groups/risk-snapshot",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  createAdminSessionSourceGroupRiskSnapshotWithMeta: (
    payload: CreateCloudAdminSessionSourceGroupRiskSnapshotRequest,
  ) =>
    adminFetchWithMeta<CloudAdminSessionSourceGroupRiskSnapshot>(
      "/admin-session-source-groups/risk-snapshot",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  getRevenueSharingPolicy: () =>
    adminFetch<RevenueSharingPolicySummary>("/revenue-sharing/policy"),

  updateRevenueSharingPolicy: (payload: UpdateRevenueSharingPolicyRequest) =>
    adminFetch<RevenueSharingPolicySummary>("/revenue-sharing/policy", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  listRevenuePayees: () =>
    adminFetch<RevenuePayeeSummary[]>("/revenue-sharing/payees"),

  upsertRevenuePayee: (payload: UpsertRevenuePayeeRequest) =>
    adminFetch<RevenuePayeeSummary>("/revenue-sharing/payees", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listCloudUsers: (query?: CloudUserListQuery) =>
    adminFetch<CloudUserListResponse>(
      `/users${buildQueryString({
        query: query?.query,
        subscriptionStatus: query?.subscriptionStatus,
        status: query?.status,
        inviterPhone: query?.inviterPhone,
        registeredFrom: query?.registeredFrom,
        registeredTo: query?.registeredTo,
        page: query?.page,
        pageSize: query?.pageSize,
        includeTestAccounts: query?.includeTestAccounts,
      })}`,
    ),

  getCloudUser: (id: string) => adminFetch<CloudUserDetail>(`/users/${id}`),

  lookupIpRegion: (ip: string) =>
    adminFetch<{
      ip: string;
      countryCode: string | null;
      country: string | null;
      region: string | null;
      city: string | null;
      source: "ip-api.com" | "ipinfo.io" | "cache" | "unresolved";
    }>(`/ip-region/${encodeURIComponent(ip)}`),

  grantSubscription: (id: string, payload: GrantSubscriptionRequest) =>
    adminFetch<SubscriptionRecordSummary>(`/users/${id}/subscriptions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listRevenueEvents: (filters?: { worldId?: string; characterId?: string }) =>
    adminFetch<RevenueEventListResponse>(
      `/revenue-sharing/events${buildQueryString({
        worldId: filters?.worldId,
        characterId: filters?.characterId,
      })}`,
    ),

  listRevenueLedger: (filters?: {
    worldId?: string;
    characterId?: string;
    payeeId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) =>
    adminFetch<RevenueLedgerListResponse>(
      `/revenue-sharing/ledger${buildQueryString({
        worldId: filters?.worldId,
        characterId: filters?.characterId,
        payeeId: filters?.payeeId,
        status: filters?.status,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })}`,
    ),

  previewRevenueSettlement: (payload?: RevenueSettlementPreviewRequest) =>
    adminFetch<RevenueSettlementPreviewResponse>(
      "/revenue-sharing/settlements/preview",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  generateRevenueSettlement: (payload?: RevenueSettlementPreviewRequest) =>
    adminFetch<RevenueSettlementBatchSummary>(
      "/revenue-sharing/settlements/generate",
      {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      },
    ),

  banUser: (id: string, payload: BanCloudUserRequest) =>
    adminFetch<{ success: true }>(`/users/${id}/ban`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  unbanUser: (id: string) =>
    adminFetch<{ success: true }>(`/users/${id}/unban`, {
      method: "POST",
    }),

  listSubscriptionPlans: () =>
    adminFetch<SubscriptionPlanSummary[]>("/subscription-plans"),

  upsertSubscriptionPlan: (payload: UpsertSubscriptionPlanRequest) =>
    adminFetch<SubscriptionPlanSummary>("/subscription-plans", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listCloudConfigs: () => adminFetch<CloudConfigEntry[]>("/configs"),

  upsertCloudConfig: (payload: UpsertCloudConfigRequest) =>
    adminFetch<CloudConfigEntry>("/configs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listInviteRedemptions: (query?: InviteRedemptionListQuery) =>
    adminFetch<InviteRedemptionListResponse>(
      `/invites/redemptions${buildQueryString({
        query: query?.query,
        status: query?.status,
        page: query?.page,
        pageSize: query?.pageSize,
      })}`,
    ),

  rejectInviteRedemption: (
    id: string,
    payload: RejectInviteRedemptionRequest,
  ) =>
    adminFetch<{ success: true }>(`/invites/redemptions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listFeedbacks: (query?: ListCloudFeedbacksQuery) =>
    adminFetch<ListCloudFeedbacksResponse>(
      `/feedback${buildQueryString({
        query: query?.query,
        category: query?.category,
        priority: query?.priority,
        status: query?.status,
        source: query?.source,
        page: query?.page,
        pageSize: query?.pageSize,
      })}`,
    ),

  getFeedback: (id: string) =>
    adminFetch<CloudFeedbackSummary>(`/feedback/${id}`),

  updateFeedbackStatus: (
    id: string,
    payload: UpdateCloudFeedbackStatusRequest,
  ) =>
    adminFetch<CloudFeedbackSummary>(`/feedback/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getTelemetryOverview: (
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
  ) =>
    adminFetch<TelemetryOverviewResponse>(
      `/telemetry/overview${buildQueryString({ range, appId, worldId })}`,
    ),

  getTelemetryTimeseries: (params: {
    eventName: string;
    range: TelemetryRange;
    groupBy?: "appId" | "none";
    appId?: TelemetryAppId;
    worldId?: string;
  }) =>
    adminFetch<TelemetryTimeseriesResponse>(
      `/telemetry/timeseries${buildQueryString(params)}`,
    ),

  getTelemetryTopEvents: (
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
  ) =>
    adminFetch<TelemetryTopEventsResponse>(
      `/telemetry/top-events${buildQueryString({ range, appId, worldId })}`,
    ),

  getTelemetryFunnel: (params: {
    steps: string;
    range: TelemetryRange;
    appId?: TelemetryAppId;
    worldId?: string;
  }) =>
    adminFetch<TelemetryFunnelResponse>(
      `/telemetry/funnel${buildQueryString(params)}`,
    ),

  getTelemetryApiHealth: (
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
  ) =>
    adminFetch<TelemetryApiHealthResponse>(
      `/telemetry/api-health${buildQueryString({ range, appId, worldId })}`,
    ),

  getTelemetryErrors: (
    range: TelemetryRange,
    appId?: TelemetryAppId,
    worldId?: string,
  ) =>
    adminFetch<TelemetryErrorsResponse>(
      `/telemetry/errors${buildQueryString({ range, appId, worldId })}`,
    ),

  getTelemetryTopWorlds: (
    range: TelemetryRange,
    params?: {
      page?: number;
      pageSize?: number;
      sortBy?: TelemetryTopWorldsSortKey;
      sortDir?: TelemetryTopWorldsSortDir;
    },
  ) =>
    adminFetch<TelemetryTopWorldsResponse>(
      `/telemetry/top-worlds${buildQueryString({
        range,
        page: params?.page,
        pageSize: params?.pageSize,
        sortBy: params?.sortBy,
        sortDir: params?.sortDir,
      })}`,
    ),

  listTelemetryWorlds: (range: TelemetryRange) =>
    adminFetch<TelemetryWorldRow[]>(
      `/telemetry/worlds${buildQueryString({ range })}`,
    ),

  getTelemetryMinimaxHourly: (range: TelemetryRange, worldId?: string) =>
    adminFetch<MinimaxHourlyTelemetryResponse>(
      `/telemetry/minimax-hourly${buildQueryString({ range, worldId })}`,
    ),

  getCloudTokenUsageOverview: (filters?: { from?: string; to?: string }) =>
    adminFetch<CloudTokenUsageOverviewResponse>(
      `/token-usage/overview${buildQueryString({
        from: filters?.from,
        to: filters?.to,
      })}`,
    ),

  getCloudTokenUsageTrends: (filters?: { from?: string; to?: string }) =>
    adminFetch<TokenUsageTrendPoint[]>(
      `/token-usage/trends${buildQueryString({
        from: filters?.from,
        to: filters?.to,
      })}`,
    ),

  listCloudTokenUsageWorlds: (filters?: {
    from?: string;
    to?: string;
    sort?: "tokens" | "cost" | "requests" | "failureRate";
    dir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    search?: string;
  }) =>
    adminFetch<CloudTokenUsageWorldListResponse>(
      `/token-usage/worlds${buildQueryString({
        from: filters?.from,
        to: filters?.to,
        sort: filters?.sort,
        dir: filters?.dir,
        page: filters?.page,
        pageSize: filters?.pageSize,
        search: filters?.search,
      })}`,
    ),

  getCloudTokenUsageWorldBreakdown: (
    worldId: string,
    filters?: { from?: string; to?: string },
  ) =>
    adminFetch<TokenUsageBreakdownResponse>(
      `/token-usage/worlds/${worldId}/breakdown${buildQueryString({
        from: filters?.from,
        to: filters?.to,
      })}`,
    ),

  getCloudTokenUsageWorldDaily: (
    worldId: string,
    filters?: { from?: string; to?: string },
  ) =>
    adminFetch<
      Array<{
        bucketDate: string;
        currency: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        estimatedCost: number;
        requestCount: number;
        successCount: number;
        failedCount: number;
        activeCharacterCount: number;
        syncedAt: string;
      }>
    >(
      `/token-usage/worlds/${worldId}/daily${buildQueryString({
        from: filters?.from,
        to: filters?.to,
      })}`,
    ),

  getCloudTokenUsageBudgets: () =>
    adminFetch<CloudTokenUsageBudgetResponse>("/token-usage/budgets"),

  upsertCloudTokenUsageBudget: (payload: UpdateCloudTokenUsageBudgetRequest) =>
    adminFetch<CloudTokenUsageBudgetItem>("/token-usage/budgets", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteCloudTokenUsageBudget: (worldId: string) =>
    adminFetch<{ ok: true }>(`/token-usage/budgets/${worldId}`, {
      method: "DELETE",
    }),

  getCloudTokenPricingCatalog: () =>
    adminFetch<CloudTokenPricingCatalogResponse>("/token-usage/pricing"),

  upsertCloudTokenPricing: (payload: UpsertCloudTokenPricingRequest) =>
    adminFetch<CloudTokenPricingItem>("/token-usage/pricing", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deleteCloudTokenPricing: (currency: "CNY" | "USD", model: string) =>
    adminFetch<{ ok: true }>(
      `/token-usage/pricing${buildQueryString({ currency, model })}`,
      { method: "DELETE" },
    ),

  syncCloudTokenPricingFromN1n: () =>
    adminFetch<CloudTokenPricingSyncResult>(
      "/token-usage/pricing/sync-n1n",
      { method: "POST" },
    ),

  listWikiUsers: (query?: WikiUserListQuery) =>
    adminFetch<WikiUserListResponse>(
      `/wiki/users${buildQueryString({
        q: query?.q,
        page: query?.page,
        pageSize: query?.pageSize,
      })}`,
    ),

  listWikiUserPrivateCharacters: (userId: string) =>
    adminFetch<WikiUserPrivateCharacterListResponse>(
      `/wiki/users/${encodeURIComponent(userId)}/private-characters`,
    ),
};
