import { resolveAppRuntimeContext, type AppPlatform as RuntimePlatform } from "../runtime/platform";

export type AppPlatform = RuntimePlatform | "ios";
export type AppRuntimeMode = "self-hosted" | "remote";

export type PlatformCapabilities = {
  platform: AppPlatform;
  runtimeMode: AppRuntimeMode;
  hasDesktopRuntimeControl: boolean;
  hasNativeShell: boolean;
  hasSafeAreaInsets: boolean;
  storageMode: "web-storage" | "secure-storage";
  requiresEnvironmentSetup: boolean;
};

function normalizePlatform(value: string | undefined): AppPlatform | null {
  if (value === "desktop" || value === "web" || value === "android" || value === "ios") {
    return value;
  }

  return null;
}

function detectBrowserPlatform(): AppPlatform {
  if (typeof navigator === "undefined") {
    return "web";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (/(iphone|ipad|ipod)/.test(userAgent)) {
    return "ios";
  }
  if (/android/.test(userAgent)) {
    return "android";
  }

  return "web";
}

export function getPlatformCapabilities(): PlatformCapabilities {
  const envPlatform = normalizePlatform(import.meta.env.VITE_APP_PLATFORM) ?? detectBrowserPlatform();
  const runtimeContext = resolveAppRuntimeContext(envPlatform);
  const runtimeCapabilities = runtimeContext.capabilities;
  const runtimeMode: AppRuntimeMode = runtimeContext.deploymentMode === "local-hosted" ? "self-hosted" : "remote";

  return {
    platform: runtimeContext.platform,
    runtimeMode,
    hasDesktopRuntimeControl: runtimeCapabilities.canManageLocalCoreApi,
    hasNativeShell: runtimeContext.platform === "desktop" || runtimeContext.platform === "ios" || runtimeContext.platform === "android",
    hasSafeAreaInsets: runtimeContext.platform === "ios" || runtimeContext.platform === "android",
    storageMode: runtimeCapabilities.canUseSecureStorage ? "secure-storage" : "web-storage",
    requiresEnvironmentSetup: runtimeCapabilities.canManageLocalCoreApi,
  };
}
