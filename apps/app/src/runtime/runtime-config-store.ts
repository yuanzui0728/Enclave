import { useSyncExternalStore } from "react";
import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import { readNativeRuntimeConfig } from "./native-runtime";
import { detectAppPlatform } from "./platform";
import { normalizeAppRuntimeConfig, readInjectedRuntimeConfig, RUNTIME_CONFIG_STORAGE_KEY, type AppRuntimeConfig } from "./runtime-config";
import { APP_RUNTIME_SOCKET_CONFIG_CHANGE_EVENT } from "./runtime-config-events";

const listeners = new Set<() => void>();
let nativeRuntimeHydrated = false;
const RUNTIME_CONFIG_UPDATED_AT_STORAGE_KEY =
  "yinjie-app-runtime-config-updated-at";
let desktopRuntimeConfigNativeWriteQueue: Promise<void> = Promise.resolve();

type PersistedRuntimeConfigState = {
  config: Partial<AppRuntimeConfig>;
  updatedAt: string | null;
};

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

function readPersistedRuntimeConfig() {
  const storage = getStorage();
  const rawValue = storage?.getItem(RUNTIME_CONFIG_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as Partial<AppRuntimeConfig>;
  } catch {
    return null;
  }
}

function readPersistedRuntimeConfigUpdatedAt() {
  const storage = getStorage();
  const rawValue = storage?.getItem(RUNTIME_CONFIG_UPDATED_AT_STORAGE_KEY);
  return typeof rawValue === "string" ? rawValue : null;
}

function readPersistedRuntimeConfigState(): PersistedRuntimeConfigState {
  return {
    config: readPersistedRuntimeConfig() ?? {},
    updatedAt: readPersistedRuntimeConfigUpdatedAt(),
  };
}

function hasPersistedRuntimeConfigData(state: PersistedRuntimeConfigState) {
  return state.updatedAt !== null || Object.keys(state.config).length > 0;
}

function getPersistedRuntimeConfigTimestamp(state: PersistedRuntimeConfigState) {
  const timestamp = Date.parse(state.updatedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function writePersistedRuntimeConfigState(state: PersistedRuntimeConfigState) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (hasPersistedRuntimeConfigData(state)) {
    storage.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(state.config));
    if (state.updatedAt) {
      storage.setItem(RUNTIME_CONFIG_UPDATED_AT_STORAGE_KEY, state.updatedAt);
    } else {
      storage.removeItem(RUNTIME_CONFIG_UPDATED_AT_STORAGE_KEY);
    }
    return;
  }

  storage.removeItem(RUNTIME_CONFIG_STORAGE_KEY);
  storage.removeItem(RUNTIME_CONFIG_UPDATED_AT_STORAGE_KEY);
}

function normalizePersistedRuntimeConfigState(
  value: unknown,
): PersistedRuntimeConfigState {
  if (!value || typeof value !== "object") {
    return {
      config: {},
      updatedAt: null,
    };
  }

  const parsed = value as {
    config?: Partial<AppRuntimeConfig>;
    updatedAt?: string | null;
  };

  if ("config" in parsed) {
    return {
      config:
        parsed.config && typeof parsed.config === "object" ? parsed.config : {},
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  }

  return {
    config: parsed as Partial<AppRuntimeConfig>,
    updatedAt: null,
  };
}

function parsePersistedRuntimeConfigState(raw: string | null | undefined) {
  if (!raw) {
    return {
      config: {},
      updatedAt: null,
    } satisfies PersistedRuntimeConfigState;
  }

  try {
    return normalizePersistedRuntimeConfigState(JSON.parse(raw) as unknown);
  } catch {
    return {
      config: {},
      updatedAt: null,
    } satisfies PersistedRuntimeConfigState;
  }
}

function queueDesktopRuntimeConfigWrite(state: PersistedRuntimeConfigState) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(state);
  desktopRuntimeConfigNativeWriteQueue = desktopRuntimeConfigNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_runtime_config_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

async function hydrateDesktopRuntimeConfigFromNative() {
  const localState = readPersistedRuntimeConfigState();
  if (!isDesktopRuntimeAvailable()) {
    return hasPersistedRuntimeConfigData(localState) ? localState.config : null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_runtime_config_store");

    if (!result.exists) {
      if (hasPersistedRuntimeConfigData(localState)) {
        queueDesktopRuntimeConfigWrite(localState);
      }
      return hasPersistedRuntimeConfigData(localState) ? localState.config : null;
    }

    const nativeState = parsePersistedRuntimeConfigState(result.contents ?? null);
    if (
      getPersistedRuntimeConfigTimestamp(localState) >
      getPersistedRuntimeConfigTimestamp(nativeState)
    ) {
      if (hasPersistedRuntimeConfigData(localState)) {
        queueDesktopRuntimeConfigWrite(localState);
      }
      return hasPersistedRuntimeConfigData(localState) ? localState.config : null;
    }

    if (
      getPersistedRuntimeConfigTimestamp(localState) ===
        getPersistedRuntimeConfigTimestamp(nativeState) &&
      hasPersistedRuntimeConfigData(localState) &&
      !hasPersistedRuntimeConfigData(nativeState)
    ) {
      queueDesktopRuntimeConfigWrite(localState);
      return localState.config;
    }

    writePersistedRuntimeConfigState(nativeState);
    return hasPersistedRuntimeConfigData(nativeState) ? nativeState.config : null;
  } catch {
    return hasPersistedRuntimeConfigData(localState) ? localState.config : null;
  }
}

function createInitialRuntimeConfig() {
  const platform = detectAppPlatform();
  const injectedConfig = readInjectedRuntimeConfig();
  const persistedConfig = readPersistedRuntimeConfig();
  const envApiBaseUrl = import.meta.env.VITE_CORE_API_BASE_URL;
  const envSocketBaseUrl = import.meta.env.VITE_SOCKET_BASE_URL ?? import.meta.env.VITE_CORE_API_BASE_URL;
  const envCloudApiBaseUrl = import.meta.env.VITE_CLOUD_API_BASE_URL;
  const bootstrapSource =
    injectedConfig ? "window" : persistedConfig ? "storage" : envApiBaseUrl || envSocketBaseUrl || envCloudApiBaseUrl ? "env" : "default";
  const initialConfig: Parameters<typeof normalizeAppRuntimeConfig>[0] = {
    ...persistedConfig,
    ...injectedConfig,
    apiBaseUrl: injectedConfig?.apiBaseUrl ?? persistedConfig?.apiBaseUrl ?? envApiBaseUrl,
    socketBaseUrl:
      injectedConfig?.socketBaseUrl ??
      persistedConfig?.socketBaseUrl ??
      envSocketBaseUrl,
    cloudApiBaseUrl:
      injectedConfig?.cloudApiBaseUrl ??
      persistedConfig?.cloudApiBaseUrl ??
      envCloudApiBaseUrl,
    channel: injectedConfig?.channel ?? persistedConfig?.channel,
    worldAccessMode:
      injectedConfig?.worldAccessMode ?? persistedConfig?.worldAccessMode,
    cloudPhone: injectedConfig?.cloudPhone ?? persistedConfig?.cloudPhone,
    cloudWorldId: injectedConfig?.cloudWorldId ?? persistedConfig?.cloudWorldId,
    applicationId:
      injectedConfig?.applicationId ?? persistedConfig?.applicationId,
    appVersionName:
      injectedConfig?.appVersionName ?? persistedConfig?.appVersionName,
    appVersionCode:
      injectedConfig?.appVersionCode ?? persistedConfig?.appVersionCode,
    environment: injectedConfig?.environment ?? persistedConfig?.environment ?? import.meta.env.MODE,
    publicAppName: injectedConfig?.publicAppName ?? persistedConfig?.publicAppName ?? "Yinjie",
    preferredLocales:
      injectedConfig?.preferredLocales ?? persistedConfig?.preferredLocales,
    bootstrapSource: injectedConfig?.bootstrapSource ?? persistedConfig?.bootstrapSource ?? bootstrapSource,
    configStatus: injectedConfig?.configStatus ?? persistedConfig?.configStatus,
  };

  return normalizeAppRuntimeConfig(initialConfig, platform);
}

let runtimeConfig = createInitialRuntimeConfig();

function emitRuntimeConfigChange() {
  listeners.forEach((listener) => listener());
}

export function getAppRuntimeConfig() {
  return runtimeConfig;
}

export function setAppRuntimeConfig(nextConfig: Partial<AppRuntimeConfig>) {
  const previousApiBaseUrl = runtimeConfig.apiBaseUrl;
  const previousSocketBaseUrl = runtimeConfig.socketBaseUrl;
  const updatedAt = new Date().toISOString();
  runtimeConfig = normalizeAppRuntimeConfig(
    {
      ...runtimeConfig,
      ...nextConfig,
      bootstrapSource: nextConfig.bootstrapSource ?? "user",
    },
    runtimeConfig.appPlatform,
  );

  const persistedState = {
    config: runtimeConfig,
    updatedAt,
  } satisfies PersistedRuntimeConfigState;
  writePersistedRuntimeConfigState(persistedState);
  queueDesktopRuntimeConfigWrite(persistedState);
  if (previousApiBaseUrl !== runtimeConfig.apiBaseUrl || previousSocketBaseUrl !== runtimeConfig.socketBaseUrl) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(APP_RUNTIME_SOCKET_CONFIG_CHANGE_EVENT));
    }
  }
  emitRuntimeConfigChange();
  return runtimeConfig;
}

export async function hydrateNativeRuntimeConfig() {
  if (nativeRuntimeHydrated) {
    return runtimeConfig;
  }

  nativeRuntimeHydrated = true;
  const desktopConfig = await hydrateDesktopRuntimeConfigFromNative();
  const nativeConfig = await readNativeRuntimeConfig();
  if (!desktopConfig && !nativeConfig) {
    return runtimeConfig;
  }

  runtimeConfig = normalizeAppRuntimeConfig(
    {
      ...runtimeConfig,
      ...desktopConfig,
      ...nativeConfig,
      apiBaseUrl:
        nativeConfig?.apiBaseUrl ??
        desktopConfig?.apiBaseUrl ??
        runtimeConfig.apiBaseUrl,
      socketBaseUrl:
        nativeConfig?.socketBaseUrl ??
        desktopConfig?.socketBaseUrl ??
        nativeConfig?.apiBaseUrl ??
        desktopConfig?.apiBaseUrl ??
        runtimeConfig.socketBaseUrl,
      cloudApiBaseUrl:
        nativeConfig?.cloudApiBaseUrl ??
        desktopConfig?.cloudApiBaseUrl ??
        runtimeConfig.cloudApiBaseUrl,
      worldAccessMode:
        nativeConfig?.worldAccessMode ??
        desktopConfig?.worldAccessMode ??
        runtimeConfig.worldAccessMode,
      cloudPhone:
        nativeConfig?.cloudPhone ??
        desktopConfig?.cloudPhone ??
        runtimeConfig.cloudPhone,
      cloudWorldId:
        nativeConfig?.cloudWorldId ??
        desktopConfig?.cloudWorldId ??
        runtimeConfig.cloudWorldId,
      environment:
        nativeConfig?.environment ??
        desktopConfig?.environment ??
        runtimeConfig.environment,
      publicAppName:
        nativeConfig?.publicAppName ??
        desktopConfig?.publicAppName ??
        runtimeConfig.publicAppName,
      applicationId:
        nativeConfig?.applicationId ??
        desktopConfig?.applicationId ??
        runtimeConfig.applicationId,
      appVersionName:
        nativeConfig?.appVersionName ??
        desktopConfig?.appVersionName ??
        runtimeConfig.appVersionName,
      appVersionCode:
        nativeConfig?.appVersionCode ??
        desktopConfig?.appVersionCode ??
        runtimeConfig.appVersionCode,
      preferredLocales:
        nativeConfig?.preferredLocales ??
        desktopConfig?.preferredLocales ??
        runtimeConfig.preferredLocales,
      bootstrapSource: nativeConfig ? "native" : desktopConfig ? "storage" : runtimeConfig.bootstrapSource,
      configStatus:
        nativeConfig?.apiBaseUrl || desktopConfig?.apiBaseUrl
          ? "validated"
          : runtimeConfig.configStatus,
    },
    runtimeConfig.appPlatform,
  );

  emitRuntimeConfigChange();
  return runtimeConfig;
}

export function subscribeAppRuntimeConfig(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useAppRuntimeConfig() {
  return useSyncExternalStore(subscribeAppRuntimeConfig, getAppRuntimeConfig, getAppRuntimeConfig);
}
