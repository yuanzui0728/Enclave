import type {
  CloudInstanceSummary,
  CloudWorldLifecycleStatus,
  CloudWorldRequestRecord,
  CloudWorldRequestStatus,
  CloudWorldSummary,
  WorldLifecycleJobStatus,
  WorldLifecycleJobSummary,
  WorldLifecycleJobType,
} from "@yinjie/contracts";

const ADMIN_SECRET_KEY = "yinjie_cloud_admin_secret";

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

  if (typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
    return window.location.origin;
  }

  return "http://localhost:3001";
}

function buildQueryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function getCloudAdminSecret() {
  return getStorage()?.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
}

export function setCloudAdminSecret(secret: string) {
  getStorage()?.setItem(ADMIN_SECRET_KEY, secret.trim());
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const secret = getCloudAdminSecret();
  if (!secret) {
    throw new Error("CLOUD_ADMIN_SECRET is required.");
  }

  const response = await fetch(`${resolveCloudAdminApiBase()}/admin/cloud${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
      ...options?.headers,
    },
    ...options,
  });

  if (response.status === 401) {
    throw new Error("CLOUD_ADMIN_SECRET is invalid.");
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(rawBody || `Cloud admin API error ${response.status}`);
  }

  return rawBody ? (JSON.parse(rawBody) as T) : (undefined as T);
}

export const cloudAdminApi = {
  listRequests: (status?: CloudWorldRequestStatus) =>
    adminFetch<CloudWorldRequestRecord[]>(`/world-requests${buildQueryString({ status })}`),

  getRequest: (id: string) => adminFetch<CloudWorldRequestRecord>(`/world-requests/${id}`),

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
  ) => adminFetch<CloudWorldRequestRecord>(`/world-requests/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  listWorlds: (status?: CloudWorldLifecycleStatus) =>
    adminFetch<CloudWorldSummary[]>(`/worlds${buildQueryString({ status })}`),

  getWorld: (id: string) => adminFetch<CloudWorldSummary>(`/worlds/${id}`),

  updateWorld: (
    id: string,
    payload: {
      phone?: string;
      name?: string;
      status?: CloudWorldLifecycleStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) => adminFetch<CloudWorldSummary>(`/worlds/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  listJobs: (filters?: { worldId?: string; status?: WorldLifecycleJobStatus; jobType?: WorldLifecycleJobType }) =>
    adminFetch<WorldLifecycleJobSummary[]>(
      `/jobs${buildQueryString({
        worldId: filters?.worldId,
        status: filters?.status,
        jobType: filters?.jobType,
      })}`,
    ),

  getJob: (id: string) => adminFetch<WorldLifecycleJobSummary>(`/jobs/${id}`),

  getWorldInstance: (worldId: string) => adminFetch<CloudInstanceSummary | null>(`/worlds/${worldId}/instance`),

  resumeWorld: (worldId: string) => adminFetch<CloudWorldSummary>(`/worlds/${worldId}/resume`, { method: "POST" }),

  suspendWorld: (worldId: string) => adminFetch<CloudWorldSummary>(`/worlds/${worldId}/suspend`, { method: "POST" }),

  retryWorld: (worldId: string) => adminFetch<CloudWorldSummary>(`/worlds/${worldId}/retry`, { method: "POST" }),
};
