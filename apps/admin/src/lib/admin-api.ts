import type {
  CharacterBlueprintRevision,
  CharacterFactorySnapshot,
  ReplyLogicConstantSummary,
  ReplyLogicCharacterSnapshot,
  ReplyLogicConversationSnapshot,
  ReplyLogicOverview,
} from "@yinjie/contracts";

const ADMIN_SECRET_KEY = "yinjie_admin_secret";

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
  return getStorage()?.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
}

export function setAdminSecret(secret: string) {
  getStorage()?.setItem(ADMIN_SECRET_KEY, secret.trim());
}

export function clearAdminSecret() {
  getStorage()?.removeItem(ADMIN_SECRET_KEY);
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
    throw new Error(`管理接口请求失败 ${res.status}：${path}`);
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
  getCharacterFactory: (id: string) =>
    adminFetch<CharacterFactorySnapshot>(`/characters/${id}/factory`),
  updateCharacterFactory: (id: string, payload: Record<string, unknown>) =>
    adminFetch<CharacterFactorySnapshot>(`/characters/${id}/factory`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  publishCharacterFactory: (id: string, summary?: string) =>
    adminFetch<CharacterFactorySnapshot>(`/characters/${id}/factory/publish`, {
      method: "POST",
      body: JSON.stringify({ summary: summary?.trim() || null }),
    }),
  listCharacterFactoryRevisions: (id: string) =>
    adminFetch<CharacterBlueprintRevision[]>(`/characters/${id}/factory/revisions`),
  restoreCharacterFactoryRevision: (id: string, revisionId: string) =>
    adminFetch<CharacterFactorySnapshot>(
      `/characters/${id}/factory/revisions/${revisionId}/restore`,
      { method: "POST" },
    ),
  getReplyLogicOverview: () => adminFetch<ReplyLogicOverview>("/reply-logic/overview"),
  getReplyLogicRules: () => adminFetch<ReplyLogicConstantSummary>("/reply-logic/rules"),
  setReplyLogicRules: (payload: ReplyLogicConstantSummary) =>
    adminFetch<ReplyLogicConstantSummary>("/reply-logic/rules", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getReplyLogicCharacterSnapshot: (id: string) =>
    adminFetch<ReplyLogicCharacterSnapshot>(`/reply-logic/characters/${id}`),
  getReplyLogicConversationSnapshot: (id: string) =>
    adminFetch<ReplyLogicConversationSnapshot>(`/reply-logic/conversations/${id}`),
};
