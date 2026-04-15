import type {
  AdminChatRecordConversationDetail,
  AdminChatRecordConversationListQuery,
  AdminChatRecordConversationListResponse,
  AdminChatRecordConversationSearchQuery,
  AdminChatRecordConversationSearchResponse,
  AdminChatRecordMessagesPage,
  AdminChatRecordMessagesQuery,
  AdminChatRecordOverview,
  AdminChatRecordTokenUsageSummary,
} from "@yinjie/contracts";
import { getAdminSecret, setAdminSecret } from "./admin-api";

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

  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:")
  ) {
    return `${window.location.origin}/api`;
  }

  return "http://localhost:3000/api";
}

async function requestWithSecret(
  path: string,
  secret: string,
  options?: RequestInit,
) {
  return fetch(`${resolveAdminApiBase()}/admin/chat-records${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
      ...options?.headers,
    },
    ...options,
  });
}

async function chatRecordsFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const storedSecret = getStorage()?.getItem("yinjie_admin_secret")?.trim() ?? "";
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error("请先配置 ADMIN_SECRET。");
  }

  let res = await requestWithSecret(path, secret, options);
  let rawBody = await res.text();
  const isNotConfigured = (body: string) => {
    try { return ((JSON.parse(body)?.message as string) ?? body).includes("not configured"); } catch { return body.includes("not configured"); }
  };

  if (
    res.status === 401 &&
    storedSecret &&
    DEV_ADMIN_SECRET &&
    storedSecret !== DEV_ADMIN_SECRET &&
    !isNotConfigured(rawBody)
  ) {
    res = await requestWithSecret(path, DEV_ADMIN_SECRET, options);
    rawBody = await res.text();
    if (res.ok) {
      setAdminSecret(DEV_ADMIN_SECRET);
    }
  }

  if (res.status === 401) {
    if (isNotConfigured(rawBody)) {
      throw new Error("服务端尚未配置 ADMIN_SECRET。");
    }

    throw new Error("ADMIN_SECRET 不正确。");
  }

  if (!res.ok) {
    throw new Error(rawBody || `聊天记录接口请求失败 ${res.status}：${path}`);
  }

  try {
    return (rawBody ? JSON.parse(rawBody) : undefined) as T;
  } catch {
    throw new Error(`聊天记录接口响应解析失败 (${path})：${rawBody.slice(0, 200)}`);
  }
}

function buildQueryString<T extends object>(query?: T) {
  const params = new URLSearchParams();
  Object.entries((query ?? {}) as Record<string, unknown>).forEach(
    ([key, value]) => {
      if (value == null || value === "") {
        return;
      }
      params.set(key, String(value));
    },
  );
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export const chatRecordsAdminApi = {
  getOverview: () => chatRecordsFetch<AdminChatRecordOverview>("/overview"),
  listConversations: (query?: AdminChatRecordConversationListQuery) =>
    chatRecordsFetch<AdminChatRecordConversationListResponse>(
      `/conversations${buildQueryString(query)}`,
    ),
  getConversationDetail: (
    id: string,
    query?: { includeClearedHistory?: boolean },
  ) =>
    chatRecordsFetch<AdminChatRecordConversationDetail>(
      `/conversations/${id}${buildQueryString(query)}`,
    ),
  getConversationMessages: (
    id: string,
    query?: AdminChatRecordMessagesQuery,
  ) =>
    chatRecordsFetch<AdminChatRecordMessagesPage>(
      `/conversations/${id}/messages${buildQueryString(query)}`,
    ),
  searchConversationMessages: (
    id: string,
    query?: AdminChatRecordConversationSearchQuery,
  ) =>
    chatRecordsFetch<AdminChatRecordConversationSearchResponse>(
      `/conversations/${id}/search${buildQueryString(query)}`,
    ),
  getConversationTokenUsage: (id: string) =>
    chatRecordsFetch<AdminChatRecordTokenUsageSummary>(
      `/conversations/${id}/token-usage`,
    ),
};
