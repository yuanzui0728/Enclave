import type {
  Character,
  CharacterBlueprintRevision,
  CharacterPresetSummary,
  CharacterFactorySnapshot,
  InstallCharacterPresetsResult,
  ReplyLogicConstantSummary,
  ReplyLogicCharacterSnapshot,
  ReplyLogicConversationSnapshot,
  ReplyLogicGroupReplyTurnRetryResult,
  ReplyLogicGroupReplyTaskCleanupResult,
  ReplyLogicGroupReplyTaskRetryResult,
  ReplyLogicOverview,
  ReplyLogicPreviewRequest,
  ReplyLogicPreviewResult,
  TokenUsageBudgetSnapshot,
  TokenPricingCatalog,
  TokenUsageBreakdownResponse,
  TokenUsageOverview,
  TokenUsageQuery,
  TokenUsageRecordListResponse,
  TokenUsageTrendPoint,
} from "@yinjie/contracts";

const ADMIN_SECRET_KEY = "yinjie_admin_secret";
const DEV_ADMIN_SECRET =
  import.meta.env.DEV ? import.meta.env.VITE_ADMIN_SECRET?.trim() ?? "" : "";

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
  const stored = getStorage()?.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
  return stored || DEV_ADMIN_SECRET;
}

async function requestWithSecret(path: string, secret: string, options?: RequestInit) {
  return fetch(`${resolveAdminApiBase()}/admin${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
      ...options?.headers,
    },
    ...options,
  });
}

export function setAdminSecret(secret: string) {
  getStorage()?.setItem(ADMIN_SECRET_KEY, secret.trim());
}

export function clearAdminSecret() {
  getStorage()?.removeItem(ADMIN_SECRET_KEY);
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const storedSecret = getStorage()?.getItem(ADMIN_SECRET_KEY)?.trim() ?? "";
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error("请先配置 ADMIN_SECRET。");
  }

  let res = await requestWithSecret(path, secret, options);
  let rawBody = await res.text();
  if (
    res.status === 401 &&
    storedSecret &&
    DEV_ADMIN_SECRET &&
    storedSecret !== DEV_ADMIN_SECRET &&
    !rawBody.includes("not configured")
  ) {
    res = await requestWithSecret(path, DEV_ADMIN_SECRET, options);
    rawBody = await res.text();
    if (res.ok) {
      setAdminSecret(DEV_ADMIN_SECRET);
    }
  }
  if (res.status === 401) {
    if (rawBody.includes("not configured")) {
      throw new Error("服务端尚未配置 ADMIN_SECRET。");
    }
    throw new Error("ADMIN_SECRET 不正确。");
  }
  if (!res.ok) {
    throw new Error(rawBody || `管理接口请求失败 ${res.status}：${path}`);
  }
  return (rawBody ? JSON.parse(rawBody) : undefined) as T;
}

function buildQueryString(query?: TokenUsageQuery) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }
    params.set(key, String(value));
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
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
  getCharacters: () => adminFetch<Character[]>("/characters"),
  getConfig: () => adminFetch<Record<string, string>>("/config"),
  setConfig: (key: string, value: string) =>
    adminFetch<{ success: boolean }>("/config", { method: "PATCH", body: JSON.stringify({ key, value }) }),
  generateQuickCharacter: (description: string) =>
    adminFetch<Record<string, unknown>>("/characters/generate-quick", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),
  listCharacterPresets: () =>
    adminFetch<CharacterPresetSummary[]>("/characters/presets"),
  installCharacterPreset: (presetKey: string) =>
    adminFetch<Character>(`/characters/presets/${presetKey}/install`, {
      method: "POST",
    }),
  installCharacterPresetBatch: (presetKeys: string[]) =>
    adminFetch<InstallCharacterPresetsResult>("/characters/presets/install-batch", {
      method: "POST",
      body: JSON.stringify({ presetKeys }),
    }),
  deleteCharacter: (id: string) =>
    adminFetch<{ success: boolean }>(`/characters/${id}`, { method: "DELETE" }),
  getCharacterFactory: (id: string) =>
    adminFetch<CharacterFactorySnapshot>(`/characters/${id}/factory`),
  updateCharacterFactory: (id: string, payload: Record<string, unknown>) =>
    adminFetch<CharacterFactorySnapshot>(`/characters/${id}/factory`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  generateCharacterFactoryDraft: (
    id: string,
    payload: { chatSample: string; personName?: string | null },
  ) =>
    adminFetch<CharacterFactorySnapshot>(`/characters/${id}/factory/generate`, {
      method: "POST",
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
  previewReplyLogicCharacter: (id: string, payload: ReplyLogicPreviewRequest) =>
    adminFetch<ReplyLogicPreviewResult>(`/reply-logic/characters/${id}/preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getReplyLogicConversationSnapshot: (id: string) =>
    adminFetch<ReplyLogicConversationSnapshot>(`/reply-logic/conversations/${id}`),
  retryReplyLogicGroupReplyTask: (taskId: string) =>
    adminFetch<ReplyLogicGroupReplyTaskRetryResult>(`/reply-logic/group-reply-tasks/${taskId}/retry`, {
      method: "POST",
    }),
  retryReplyLogicGroupReplyTurn: (turnId: string) =>
    adminFetch<ReplyLogicGroupReplyTurnRetryResult>(`/reply-logic/group-reply-turns/${turnId}/retry`, {
      method: "POST",
    }),
  cleanupReplyLogicGroupReplyTasks: (payload?: {
    olderThanDays?: number | null;
    groupId?: string | null;
    statuses?: string[] | null;
  }) =>
    adminFetch<ReplyLogicGroupReplyTaskCleanupResult>("/reply-logic/group-reply-tasks/cleanup", {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),
  previewReplyLogicConversation: (id: string, payload: ReplyLogicPreviewRequest) =>
    adminFetch<ReplyLogicPreviewResult>(`/reply-logic/conversations/${id}/preview`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTokenUsageOverview: (query?: TokenUsageQuery) =>
    adminFetch<TokenUsageOverview>(`/token-usage/overview${buildQueryString(query)}`),
  getTokenUsageTrend: (query?: TokenUsageQuery) =>
    adminFetch<TokenUsageTrendPoint[]>(`/token-usage/trend${buildQueryString(query)}`),
  getTokenUsageBreakdown: (query?: TokenUsageQuery) =>
    adminFetch<TokenUsageBreakdownResponse>(`/token-usage/breakdown${buildQueryString(query)}`),
  getTokenUsageRecords: (query?: TokenUsageQuery) =>
    adminFetch<TokenUsageRecordListResponse>(`/token-usage/records${buildQueryString(query)}`),
  getTokenUsagePricing: () =>
    adminFetch<TokenPricingCatalog>("/token-usage/pricing"),
  setTokenUsagePricing: (payload: TokenPricingCatalog) =>
    adminFetch<TokenPricingCatalog>("/token-usage/pricing", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getTokenUsageBudgets: () =>
    adminFetch<TokenUsageBudgetSnapshot>("/token-usage/budgets"),
  setTokenUsageBudgets: (payload: TokenUsageBudgetSnapshot["config"]) =>
    adminFetch<TokenUsageBudgetSnapshot>("/token-usage/budgets", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};
