const ADMIN_SECRET_KEY = "yinjie_admin_secret";

function resolveAdminApiBase() {
  const configuredBase = import.meta.env.VITE_API_BASE?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
    return `${window.location.origin}/api`;
  }

  return "http://localhost:3000/api";
}

export function getAdminSecret(): string {
  return localStorage.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
}

export function setAdminSecret(secret: string) {
  localStorage.setItem(ADMIN_SECRET_KEY, secret.trim());
}

export function clearAdminSecret() {
  localStorage.removeItem(ADMIN_SECRET_KEY);
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error("请先配置 ADMIN_SECRET。");
  }

  const res = await fetch(`${resolveAdminApiBase()}/admin${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
      ...options?.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    throw new Error("ADMIN_SECRET 不正确。");
  }
  if (!res.ok) {
    throw new Error(`Admin API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export type AdminStats = {
  ownerCount: number;
  characterCount: number;
  totalMessages: number;
  aiMessages: number;
};

export type AdminSystemInfo = {
  version: string;
  nodeVersion: string;
  uptimeSeconds: number;
  dbSizeBytes: number;
  dbPath: string;
};

export const adminApi = {
  getStats: () => adminFetch<AdminStats>("/stats"),
  getSystem: () => adminFetch<AdminSystemInfo>("/system"),
  getConfig: () => adminFetch<Record<string, string>>("/config"),
  setConfig: (key: string, value: string) =>
    adminFetch<{ success: boolean }>("/config", { method: "PATCH", body: JSON.stringify({ key, value }) }),
};
