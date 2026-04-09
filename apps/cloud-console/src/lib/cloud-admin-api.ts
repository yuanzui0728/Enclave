import type { CloudWorldRequestRecord, CloudWorldStatus, CloudWorldSummary } from "@yinjie/contracts";

const ADMIN_SECRET_KEY = "yinjie_cloud_admin_secret";

type EditableStatus = Exclude<CloudWorldStatus, "none">;

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

export function getCloudAdminSecret() {
  return localStorage.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
}

export function setCloudAdminSecret(secret: string) {
  localStorage.setItem(ADMIN_SECRET_KEY, secret.trim());
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const secret = getCloudAdminSecret();
  if (!secret) {
    throw new Error("请先配置 CLOUD_ADMIN_SECRET。");
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
    throw new Error("CLOUD_ADMIN_SECRET 不正确。");
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(rawBody || `Cloud admin API error ${response.status}`);
  }

  return rawBody ? (JSON.parse(rawBody) as T) : (undefined as T);
}

export const cloudAdminApi = {
  listRequests: (status?: EditableStatus) =>
    adminFetch<CloudWorldRequestRecord[]>(status ? `/world-requests?status=${encodeURIComponent(status)}` : "/world-requests"),
  getRequest: (id: string) => adminFetch<CloudWorldRequestRecord>(`/world-requests/${id}`),
  updateRequest: (
    id: string,
    payload: {
      phone?: string;
      worldName?: string;
      status?: EditableStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) => adminFetch<CloudWorldRequestRecord>(`/world-requests/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  listWorlds: (status?: EditableStatus) =>
    adminFetch<CloudWorldSummary[]>(status ? `/worlds?status=${encodeURIComponent(status)}` : "/worlds"),
  getWorld: (id: string) => adminFetch<CloudWorldSummary>(`/worlds/${id}`),
  updateWorld: (
    id: string,
    payload: {
      phone?: string;
      name?: string;
      status?: EditableStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) => adminFetch<CloudWorldSummary>(`/worlds/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};
