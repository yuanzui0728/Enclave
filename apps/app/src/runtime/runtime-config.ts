import { resolveAppRuntimeContext, type AppChannel, type AppPlatform } from "./platform";

export type AppRuntimeEnvironment = "development" | "staging" | "production";
export type AppRuntimeBootstrapSource = "default" | "env" | "storage" | "window" | "native" | "user";
export type AppRuntimeConfigStatus = "unconfigured" | "configured" | "validated";

export type AppRuntimeConfig = {
  apiBaseUrl?: string;
  socketBaseUrl?: string;
  cloudApiBaseUrl?: string;
  environment: AppRuntimeEnvironment;
  appPlatform: AppPlatform;
  channel: AppChannel;
  bootstrapSource: AppRuntimeBootstrapSource;
  configStatus: AppRuntimeConfigStatus;
  publicAppName: string;
  worldAccessMode?: "cloud" | "local";
  cloudPhone?: string;
  cloudWorldId?: string;
  applicationId?: string;
  appVersionName?: string;
  appVersionCode?: number;
  preferredLocales?: string[];
};

type AppRuntimeConfigInput = Partial<Omit<AppRuntimeConfig, "environment">> & {
  environment?: string | null;
};

export const RUNTIME_CONFIG_STORAGE_KEY = "yinjie-app-runtime-config";

type RuntimeConfigWindow = Window & {
  __YINJIE_RUNTIME_CONFIG__?: Partial<AppRuntimeConfig>;
};

function normalizeBaseUrl(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/\/+$/, "");
}

function normalizeEnvironment(value?: string | null): AppRuntimeEnvironment {
  if (value === "production" || value === "staging") {
    return value;
  }

  return "development";
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeVersionCode(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return undefined;
  }

  return Math.trunc(value);
}

function normalizePreferredLocales(value?: readonly string[] | null) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const preferredLocales = Array.from(
    new Set(
      value
        .filter((locale): locale is string => typeof locale === "string")
        .map((locale) => locale.trim())
        .filter((locale) => locale.length > 0),
    ),
  );

  return preferredLocales.length > 0 ? preferredLocales : undefined;
}

function normalizeBootstrapSource(value?: string | null): AppRuntimeBootstrapSource {
  switch (value) {
    case "env":
    case "storage":
    case "window":
    case "native":
    case "user":
      return value;
    default:
      return "default";
  }
}

function normalizeConfigStatus(
  value: string | null | undefined,
  _platform: AppPlatform,
  apiBaseUrl?: string,
): AppRuntimeConfigStatus {
  if (!apiBaseUrl) {
    return "unconfigured";
  }

  return value === "validated" ? "validated" : "configured";
}

export function normalizeAppRuntimeConfig(config: AppRuntimeConfigInput, platform: AppPlatform): AppRuntimeConfig {
  const apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const socketBaseUrl = normalizeBaseUrl(config.socketBaseUrl ?? config.apiBaseUrl);
  const cloudApiBaseUrl = normalizeBaseUrl(config.cloudApiBaseUrl);
  const runtimeContext = resolveAppRuntimeContext(platform);

  return {
    apiBaseUrl,
    socketBaseUrl,
    cloudApiBaseUrl,
    environment: normalizeEnvironment(config.environment),
    appPlatform: platform,
    channel: config.channel === "desktop" || config.channel === "mobile" || config.channel === "web"
      ? config.channel
      : runtimeContext.channel,
    bootstrapSource: normalizeBootstrapSource(config.bootstrapSource),
    configStatus: normalizeConfigStatus(config.configStatus, platform, apiBaseUrl),
    publicAppName: config.publicAppName?.trim() || "Yinjie",
    worldAccessMode: config.worldAccessMode === "cloud" ? "cloud" : config.worldAccessMode === "local" ? "local" : undefined,
    cloudPhone: normalizeOptionalText(config.cloudPhone),
    cloudWorldId: normalizeOptionalText(config.cloudWorldId),
    applicationId: normalizeOptionalText(config.applicationId),
    appVersionName: normalizeOptionalText(config.appVersionName),
    appVersionCode: normalizeVersionCode(config.appVersionCode),
    preferredLocales: normalizePreferredLocales(config.preferredLocales),
  };
}

export function readInjectedRuntimeConfig() {
  if (typeof window === "undefined") {
    return null;
  }

  return ((window as RuntimeConfigWindow).__YINJIE_RUNTIME_CONFIG__ ?? null) as Partial<AppRuntimeConfig> | null;
}
