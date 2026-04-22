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

  constructor(message: string, requestId: string | null = null) {
    super(message);
    this.name = "CloudAdminApiError";
    this.requestId = requestId;
  }
}

export function getCloudAdminApiErrorRequestId(error: unknown) {
  return error instanceof CloudAdminApiError ? error.requestId : null;
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

function resolveCloudAdminApiBase() {
  const configuredBase = import.meta.env.VITE_CLOUD_API_BASE?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:")
  ) {
    return window.location.origin;
  }

  return "http://localhost:3001";
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
    throw new Error("CLOUD_ADMIN_SECRET is required.");
  }

  const apiBase = resolveCloudAdminApiBase();
  let response: Response;

  try {
    response = await fetch(`${apiBase}/admin/cloud/auth/token`, {
      method: "POST",
      headers: {
        "X-Admin-Secret": normalizedSecret,
      },
    });
  } catch (error) {
    throw new Error(
      `Unable to reach the cloud admin API at ${apiBase}. ${
        error instanceof Error ? error.message : "Network request failed."
      }`,
    );
  }

  if (response.status === 401) {
    throw new Error("CLOUD_ADMIN_SECRET is invalid.");
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(rawBody || `Cloud admin API error ${response.status}`);
  }

  if (!rawBody) {
    throw new Error("Cloud admin token exchange returned an empty response.");
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });
  } catch (error) {
    throw new Error(
      `Unable to reach the cloud admin API at ${apiBase}. ${
        error instanceof Error ? error.message : "Network request failed."
      }`,
    );
  }

  if (response.status === 401) {
    throw new Error("Cloud admin session is invalid or expired.");
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(rawBody || `Cloud admin API error ${response.status}`);
  }

  if (!rawBody) {
    throw new Error("Cloud admin refresh returned an empty response.");
  }

  return JSON.parse(rawBody) as IssueCloudAdminAccessTokenResponse;
}

async function revokeCloudAdminSession(refreshToken: string) {
  const apiBase = resolveCloudAdminApiBase();

  try {
    await fetch(`${apiBase}/admin/cloud/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
    throw new Error("CLOUD_ADMIN_SECRET is required.");
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...optionHeaders,
      },
    });
  } catch (error) {
    throw new Error(
      `Unable to reach the cloud admin API at ${apiBase}. ${
        error instanceof Error ? error.message : "Network request failed."
      }`,
    );
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
      "Cloud admin session is invalid or expired.",
      getResponseRequestId(response),
    );
  }

  const requestId = getResponseRequestId(response);
  const rawBody = await response.text();
  if (!response.ok) {
    throw new CloudAdminApiError(
      rawBody || `Cloud admin API error ${response.status}`,
      requestId,
    );
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
