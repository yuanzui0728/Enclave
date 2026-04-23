export type ConnectorProviderKey = "manual-json";

export interface ConnectorConfig {
  host: string;
  port: number;
  connectorLabel: string;
  providerKey: ConnectorProviderKey;
  manualJsonPath: string | null;
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
    providerKey: "manual-json",
    manualJsonPath: normalizeText(env.WECHAT_CONNECTOR_MANUAL_JSON_PATH),
    allowedOrigins: normalizeAllowedOrigins(env.WECHAT_CONNECTOR_ALLOWED_ORIGINS),
  };
}

export function applyConfigPatch(
  current: ConnectorConfig,
  patch: Partial<Pick<ConnectorConfig, "connectorLabel" | "manualJsonPath">>,
): ConnectorConfig {
  return {
    ...current,
    connectorLabel:
      normalizeText(patch.connectorLabel) ?? current.connectorLabel,
    manualJsonPath:
      patch.manualJsonPath === undefined
        ? current.manualJsonPath
        : normalizeText(patch.manualJsonPath),
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

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
