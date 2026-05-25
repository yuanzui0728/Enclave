import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  AdminBehaviorOverview,
  AdminBehaviorRecordExportQuery,
  AdminBehaviorRecordExportResponse,
  AdminBehaviorRecordListQuery,
  AdminBehaviorRecordListResponse,
} from "@yinjie/contracts";
import { getAdminSecret, setAdminSecret } from "./admin-api";
import { resolveAdminApiBase } from "./admin-api-base";

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

async function requestWithSecret(
  path: string,
  secret: string,
  options?: RequestInit,
) {
  return fetch(`${resolveAdminApiBase()}/admin/behavior-records${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
      ...options?.headers,
    },
    ...options,
  });
}

async function behaviorRecordsFetch<T>(
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
    throw new Error(rawBody || `用户行为记录接口请求失败 ${res.status}：${path}`);
  }

  try {
    return (rawBody ? JSON.parse(rawBody) : undefined) as T;
  } catch {
    throw new Error(`用户行为记录接口响应解析失败 (${path})：${rawBody.slice(0, 200)}`);
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

export const behaviorRecordsAdminApi = {
  getOverview: () => behaviorRecordsFetch<AdminBehaviorOverview>("/overview"),
  listRecords: (query?: AdminBehaviorRecordListQuery) =>
    behaviorRecordsFetch<AdminBehaviorRecordListResponse>(
      `/records${buildQueryString(query)}`,
    ),
  exportRecords: (query?: AdminBehaviorRecordExportQuery) =>
    behaviorRecordsFetch<AdminBehaviorRecordExportResponse>(
      `/records/export${buildQueryString(query)}`,
    ),
};
// i18n-ignore-end
