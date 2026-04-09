import {
  DEFAULT_CLOUD_API_BASE_URL,
  resolveCloudApiBaseUrl,
  resolveCoreApiBaseUrl,
  setCloudApiBaseUrlProvider,
  setCoreApiBaseUrlProvider,
} from "@yinjie/contracts";
import { resolveAppRuntimeContext } from "../runtime/platform";
import { getAppRuntimeConfig } from "../runtime/runtime-config-store";

function fallbackBrowserBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin;
  }

  return null;
}

export function resolveAppCoreApiBaseUrl() {
  const runtimeConfig = getAppRuntimeConfig();
  if (runtimeConfig.apiBaseUrl) {
    return runtimeConfig.apiBaseUrl;
  }

  const browserBaseUrl = fallbackBrowserBaseUrl();
  if (browserBaseUrl) {
    return browserBaseUrl;
  }

  throw new Error("Remote Core API base URL is not configured for this runtime.");
}

export function resolveAppSocketBaseUrl() {
  const runtimeConfig = getAppRuntimeConfig();
  if (runtimeConfig.socketBaseUrl) {
    return runtimeConfig.socketBaseUrl;
  }

  if (runtimeConfig.apiBaseUrl) {
    return runtimeConfig.apiBaseUrl;
  }

  return resolveAppCoreApiBaseUrl();
}

export function configureContractsRuntime() {
  setCoreApiBaseUrlProvider(() => resolveAppCoreApiBaseUrl());
  setCloudApiBaseUrlProvider(() => {
    const runtimeConfig = getAppRuntimeConfig();
    return runtimeConfig.cloudApiBaseUrl ?? DEFAULT_CLOUD_API_BASE_URL;
  });
}

export function resolveConfiguredCoreApiBaseUrl() {
  return resolveCoreApiBaseUrl(undefined, { allowDefault: false });
}

export function hasRemoteServiceConfiguration() {
  const runtimeConfig = getAppRuntimeConfig();
  return Boolean(runtimeConfig.apiBaseUrl || fallbackBrowserBaseUrl());
}

export function resolveAppCloudApiBaseUrl() {
  const runtimeConfig = getAppRuntimeConfig();
  if (runtimeConfig.cloudApiBaseUrl) {
    return runtimeConfig.cloudApiBaseUrl;
  }

  return resolveCloudApiBaseUrl();
}

export function requiresRemoteServiceConfiguration() {
  const runtimeConfig = getAppRuntimeConfig();
  const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
  return (
    runtimeContext.deploymentMode === "remote-connected" &&
    (!runtimeConfig.worldAccessMode || !hasRemoteServiceConfiguration())
  );
}
