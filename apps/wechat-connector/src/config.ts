export type ConnectorProviderKey =
  | "manual-json"
  | "wechat-decrypt-http"
  | "weflow-http";

export interface ConnectorConfig {
  host: string;
  port: number;
  connectorLabel: string;
  providerKey: ConnectorProviderKey;
  manualJsonPath: string | null;
  wechatDecryptBaseUrl: string | null;
  weflowBaseUrl: string | null;
  weflowAccessToken: string | null;
  allowedOrigins: string[];
}

const DEFAULT_PORT = 17364;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5181",
  "http://localhost:5181",
];

export function loadConnectorConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConnectorConfig {
  return {
    host: normalizeHost(env.WECHAT_CONNECTOR_HOST),
    port: normalizePort(env.WECHAT_CONNECTOR_PORT),
    connectorLabel:
      normalizeText(env.WECHAT_CONNECTOR_LABEL) ?? "隐界本地微信连接器",
    providerKey: normalizeProviderKey(env.WECHAT_CONNECTOR_PROVIDER, env),
    manualJsonPath: normalizeText(env.WECHAT_CONNECTOR_MANUAL_JSON_PATH),
    wechatDecryptBaseUrl:
      normalizeBaseUrl(env.WECHAT_DECRYPT_BASE_URL) ??
      normalizeBaseUrl(env.WECHAT_CONNECTOR_WECHAT_DECRYPT_BASE_URL),
    weflowBaseUrl:
      normalizeBaseUrl(env.WEFLOW_BASE_URL) ??
      normalizeBaseUrl(env.WECHAT_CONNECTOR_WEFLOW_BASE_URL),
    weflowAccessToken:
      normalizeToken(env.WEFLOW_ACCESS_TOKEN) ??
      normalizeToken(env.WECHAT_CONNECTOR_WEFLOW_ACCESS_TOKEN),
    allowedOrigins: normalizeAllowedOrigins(env.WECHAT_CONNECTOR_ALLOWED_ORIGINS),
  };
}

export function applyConfigPatch(
  current: ConnectorConfig,
  patch: Partial<
    Pick<
      ConnectorConfig,
      | "connectorLabel"
      | "manualJsonPath"
      | "providerKey"
      | "wechatDecryptBaseUrl"
      | "weflowBaseUrl"
      | "weflowAccessToken"
    >
  >,
): ConnectorConfig {
  return {
    ...current,
    providerKey: normalizePatchProviderKey(patch.providerKey) ?? current.providerKey,
    connectorLabel:
      normalizeText(patch.connectorLabel) ?? current.connectorLabel,
    manualJsonPath:
      patch.manualJsonPath === undefined
        ? current.manualJsonPath
        : normalizeText(patch.manualJsonPath),
    wechatDecryptBaseUrl:
      patch.wechatDecryptBaseUrl === undefined
        ? current.wechatDecryptBaseUrl
        : normalizeBaseUrl(patch.wechatDecryptBaseUrl),
    weflowBaseUrl:
      patch.weflowBaseUrl === undefined
        ? current.weflowBaseUrl
        : normalizeBaseUrl(patch.weflowBaseUrl),
    weflowAccessToken:
      patch.weflowAccessToken === undefined
        ? current.weflowAccessToken
        : normalizeToken(patch.weflowAccessToken),
  };
}

function normalizeHost(value: string | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return DEFAULT_HOST;
  }

  if (["127.0.0.1", "localhost", "::1"].includes(normalized)) {
    return normalized;
  }

  return DEFAULT_HOST;
}

function normalizePort(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }
  return parsed;
}

function normalizeAllowedOrigins(value: string | undefined) {
  const configured = normalizeText(value)
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function normalizeProviderKey(
  value: string | undefined,
  env: NodeJS.ProcessEnv,
): ConnectorProviderKey {
  if (value === "weflow-http") {
    return "weflow-http";
  }

  if (value === "wechat-decrypt-http") {
    return "wechat-decrypt-http";
  }

  if (value === "manual-json") {
    return "manual-json";
  }

  if (env.WEFLOW_BASE_URL || env.WECHAT_CONNECTOR_WEFLOW_BASE_URL) {
    return "weflow-http";
  }

  if (
    env.WECHAT_DECRYPT_BASE_URL ||
    env.WECHAT_CONNECTOR_WECHAT_DECRYPT_BASE_URL
  ) {
    return "wechat-decrypt-http";
  }

  return "manual-json";
}

function normalizePatchProviderKey(
  value: ConnectorProviderKey | undefined,
): ConnectorProviderKey | null {
  if (
    value === "manual-json" ||
    value === "wechat-decrypt-http" ||
    value === "weflow-http"
  ) {
    return value;
  }

  return null;
}

function normalizeBaseUrl(value: string | null | undefined) {
  const normalized = normalizeText(value)?.replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    ) {
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeToken(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
