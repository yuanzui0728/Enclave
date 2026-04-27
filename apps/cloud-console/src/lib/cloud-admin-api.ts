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
  CloudWaitingSessionSyncTaskListQuery,
  CloudWaitingSessionSyncTaskListResponse,
  CloudWorldAlertSummary,
  CloudWorldDriftSummary,
  CloudWorldBootstrapConfig,
  CloudWorldInstanceFleetItem,
  CloudWorldLifecycleJobAggregateSummary,
  CloudWorldLifecycleJobListResponse,
  CloudWorldRuntimeStatusSummary,
  CloudInstanceSummary,
  CloudWorldLifecycleJobListQuery,
  CloudWorldLifecycleStatus,
  CloudWorldRequestRecord,
  CloudWorldRequestStatus,
  CloudWorldSummary,
  CloudApiErrorResponse,
  IssueCloudAdminAccessTokenResponse,
  ReplayFailedCloudWaitingSessionSyncTasksResponse,
  ReplayFilteredFailedCloudWaitingSessionSyncTasksRequest,
  ReplayFilteredFailedCloudWaitingSessionSyncTasksResponse,
  RevokeCloudAdminSessionSourceGroupRequest,
  RevokeCloudAdminSessionSourceGroupResponse,
  RevokeCloudAdminSessionSourceGroupsByRiskRequest,
  RevokeCloudAdminSessionSourceGroupsByRiskResponse,
  RevokeCloudAdminSessionsByFilterRequest,
  RevokeCloudAdminSessionsByFilterResponse,
  RevokeCloudAdminSessionsByIdResponse,
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

let inFlightAdminTokenPromise:
  | Promise<IssueCloudAdminAccessTokenResponse>
  | null = null;

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
      translateCloudConsoleTextForActiveLocale("CLOUD_ADMIN_SECRET is required."),
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
    throw new CloudAdminApiError(
      translateCloudConsoleTextForActiveLocale("CLOUD_ADMIN_SECRET is invalid."),
      getResponseRequestId(response),
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
    storedRefreshToken.expiresAt - Date.now() > ADMIN_ACCESS_TOKEN_REFRESH_SKEW_MS
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
      translateCloudConsoleTextForActiveLocale("CLOUD_ADMIN_SECRET is required."),
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
  listRequests: (status?: CloudWorldRequestStatus) =>
    adminFetch<CloudWorldRequestRecord[]>(
      `/world-requests${buildQueryString({ status })}`,
    ),

  getRequest: (id: string) =>
    adminFetch<CloudWorldRequestRecord>(`/world-requests/${id}`),

  updateRequest: (
    id: string,
    payload: {
      phone?: string;
      worldName?: string;
      status?: CloudWorldRequestStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) =>
    adminFetch<CloudWorldRequestRecord>(`/world-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateRequestWithMeta: (
    id: string,
    payload: {
      phone?: string;
      worldName?: string;
      status?: CloudWorldRequestStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) =>
    adminFetchWithMeta<CloudWorldRequestRecord>(`/world-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

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

  listWaitingSessionSyncTasks: (filters?: CloudWaitingSessionSyncTaskListQuery) =>
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

  listAdminSessionSourceGroups: (
    filters?: CloudAdminSessionSourceGroupQuery,
  ) =>
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
    adminFetchWithMeta<{ success: true }>(`/admin-sessions/${sessionId}/revoke`, {
      method: "POST",
    }),

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
};
