import type { WechatSyncContactBundle } from "@yinjie/contracts";

export const DEFAULT_WECHAT_CONNECTOR_BASE_URL = "http://127.0.0.1:17364";
const WECHAT_CONNECTOR_STORAGE_KEY = "yinjie_wechat_connector_settings";

export interface WechatConnectorSettings {
  baseUrl: string;
}

export type WechatConnectorProviderKey =
  | "manual-json"
  | "wechat-decrypt-http"
  | "weflow-http";

export interface WechatConnectorSourceConfig {
  connectorLabel?: string | null;
  providerKey: WechatConnectorProviderKey;
  manualJsonPath?: string | null;
  wechatDecryptBaseUrl?: string | null;
  weflowBaseUrl?: string | null;
  weflowAccessToken?: string | null;
}

export interface WechatConnectorHealth {
  ok: boolean;
  version: string;
  lastScanAt?: string | null;
  contactCount: number;
  activeConfig: {
    connectorLabel?: string | null;
    sourceSummary?: string | null;
    providerKey?: WechatConnectorProviderKey;
    manualJsonPath?: string | null;
    wechatDecryptBaseUrl?: string | null;
    weflowBaseUrl?: string | null;
    weflowAccessToken?: string | null;
  };
}

export interface WechatConnectorScanResponse {
  ok: boolean;
  message: string;
  lastScanAt: string;
  contactCount: number;
  latestMessageAt?: string | null;
  activeConfig: {
    connectorLabel?: string | null;
    sourceSummary?: string | null;
    providerKey?: WechatConnectorProviderKey;
    manualJsonPath?: string | null;
    wechatDecryptBaseUrl?: string | null;
    weflowBaseUrl?: string | null;
    weflowAccessToken?: string | null;
  };
}

export interface WechatConnectorContactSummary {
  username: string;
  displayName: string;
  nickname?: string | null;
  remarkName?: string | null;
  tags: string[];
  isGroup: boolean;
  messageCount: number;
  ownerMessageCount: number;
  contactMessageCount: number;
  latestMessageAt?: string | null;
  sampleSnippet?: string | null;
}

export type WechatConnectorUpstreamServiceKey =
  | "wechat-decrypt"
  | "weflow";

export type WechatConnectorUpstreamServiceStatus =
  | "idle"
  | "starting"
  | "running"
  | "error";

export interface WechatConnectorUpstreamService {
  key: WechatConnectorUpstreamServiceKey;
  label: string;
  status: WechatConnectorUpstreamServiceStatus;
  baseUrl: string;
  healthUrl: string;
  healthOk: boolean;
  canStart: boolean;
  commandPreview?: string | null;
  cwd?: string | null;
  lastStartedAt?: string | null;
  lastExitedAt?: string | null;
  lastError?: string | null;
  notes: string[];
  logs: {
    stdout?: string | null;
    stderr?: string | null;
  };
}

export interface WechatConnectorUpstreamServiceStartResponse {
  ok: true;
  message: string;
  service: WechatConnectorUpstreamService;
}

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

export function loadWechatConnectorSettings(): WechatConnectorSettings {
  const raw = getStorage()?.getItem(WECHAT_CONNECTOR_STORAGE_KEY);
  if (!raw) {
    return {
      baseUrl: DEFAULT_WECHAT_CONNECTOR_BASE_URL,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WechatConnectorSettings>;
    return {
      baseUrl: normalizeBaseUrl(parsed.baseUrl) || DEFAULT_WECHAT_CONNECTOR_BASE_URL,
    };
  } catch {
    return {
      baseUrl: DEFAULT_WECHAT_CONNECTOR_BASE_URL,
    };
  }
}

export function saveWechatConnectorSettings(settings: WechatConnectorSettings) {
  getStorage()?.setItem(
    WECHAT_CONNECTOR_STORAGE_KEY,
    JSON.stringify({
      baseUrl: normalizeBaseUrl(settings.baseUrl) || DEFAULT_WECHAT_CONNECTOR_BASE_URL,
    }),
  );
}

function normalizeBaseUrl(value?: string | null) {
  const normalized = value?.trim().replace(/\/+$/, "");
  return normalized || "";
}

async function connectorFetch<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl) || DEFAULT_WECHAT_CONNECTOR_BASE_URL;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new Error(
      `本地微信连接器不可达，请先启动 ${normalizedBaseUrl}。${
        error instanceof Error ? ` ${error.message}` : ""
      }`,
    );
  }

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(
      extractConnectorError(rawBody) ||
        `本地微信连接器请求失败：${response.status}`,
    );
  }

  try {
    return (rawBody ? JSON.parse(rawBody) : undefined) as T;
  } catch (error) {
    throw new Error(
      `本地微信连接器返回了非 JSON 响应。${
        error instanceof Error ? error.message : ""
      }`,
    );
  }
}

function extractConnectorError(rawBody: string) {
  const normalized = rawBody.trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!isRecord(parsed)) {
      return normalized;
    }

    const error = parsed.error;
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }

    const message = parsed.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getWechatConnectorHealth(baseUrl: string) {
  return connectorFetch<WechatConnectorHealth>(baseUrl, "/health");
}

export function patchWechatConnectorConfig(
  baseUrl: string,
  config: Partial<WechatConnectorSourceConfig>,
) {
  return connectorFetch<WechatConnectorSourceConfig>(baseUrl, "/api/config", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export function scanWechatConnector(
  baseUrl: string,
  config?: Partial<WechatConnectorSourceConfig>,
) {
  return connectorFetch<WechatConnectorScanResponse>(baseUrl, "/api/scan", {
    method: "POST",
    body: config ? JSON.stringify(config) : undefined,
  });
}

export function listWechatConnectorContacts(
  baseUrl: string,
  options?: { query?: string; includeGroups?: boolean; limit?: number },
) {
  const params = new URLSearchParams();
  if (options?.query?.trim()) {
    params.set("query", options.query.trim());
  }
  if (options?.includeGroups) {
    params.set("includeGroups", "true");
  }
  if (options?.limit != null) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  return connectorFetch<WechatConnectorContactSummary[]>(
    baseUrl,
    `/api/contacts${query ? `?${query}` : ""}`,
  );
}

export function buildWechatConnectorContactBundles(
  baseUrl: string,
  usernames: string[],
) {
  return connectorFetch<WechatSyncContactBundle[]>(baseUrl, "/api/contact-bundles", {
    method: "POST",
    body: JSON.stringify({ usernames }),
  });
}

export function listWechatConnectorUpstreamServices(baseUrl: string) {
  return connectorFetch<WechatConnectorUpstreamService[]>(
    baseUrl,
    "/api/upstream-services",
  );
}

export function startWechatConnectorUpstreamService(
  baseUrl: string,
  key: WechatConnectorUpstreamServiceKey,
) {
  return connectorFetch<WechatConnectorUpstreamServiceStartResponse>(
    baseUrl,
    `/api/upstream-services/${key}/start`,
    {
      method: "POST",
    },
  );
}
