import { getAndroidRuntimeCapabilities, isAndroidPlatform } from "./adapters/android";
import { getDesktopRuntimeCapabilities, isDesktopPlatform } from "./adapters/desktop";
import { getIosRuntimeCapabilities, isIosPlatform } from "./adapters/ios";
import { getWebRuntimeCapabilities } from "./adapters/web";

export type AppPlatform = "web" | "desktop" | "android" | "ios";
export type AppChannel = "desktop" | "mobile" | "web";
export type DeploymentMode = "local-hosted" | "remote-connected";
export type HostRole = "host" | "client";

export type AppRuntimeCapabilities = {
  canManageLocalCoreApi: boolean;
  canResolveLocalRuntimeData: boolean;
  canConfigureProviderLocally: boolean;
  canUseSecureStorage: boolean;
  canReceivePush: boolean;
  canPickImages: boolean;
  canConfigureRemoteService: boolean;
  canExportDiagnostics: boolean;
  canManageProvider: boolean;
  canScanBootstrapCode: boolean;
  canOpenExternalLinks: boolean;
};

export type AppRuntimeContext = {
  platform: AppPlatform;
  channel: AppChannel;
  deploymentMode: DeploymentMode;
  hostRole: HostRole;
  capabilities: AppRuntimeCapabilities;
};

const MOBILE_WEB_BROWSER_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Windows Phone/i;

export function detectAppPlatform(): AppPlatform {
  if (isDesktopPlatform()) {
    return "desktop";
  }

  if (isAndroidPlatform()) {
    return "android";
  }

  if (isIosPlatform()) {
    return "ios";
  }

  return "web";
}

export function getAppRuntimeCapabilities(platform = detectAppPlatform()): AppRuntimeCapabilities {
  switch (platform) {
    case "desktop":
      return getDesktopRuntimeCapabilities();
    case "android":
      return getAndroidRuntimeCapabilities();
    case "ios":
      return getIosRuntimeCapabilities();
    default:
      return getWebRuntimeCapabilities();
  }
}

export function isMobileWebRuntime(platform = detectAppPlatform()) {
  if (platform !== "web" || typeof window === "undefined") {
    return false;
  }

  const userAgent =
    typeof navigator === "undefined" ? "" : navigator.userAgent;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  return MOBILE_WEB_BROWSER_PATTERN.test(userAgent) || coarsePointer;
}

function resolveAppChannel(platform: AppPlatform): AppChannel {
  switch (platform) {
    case "desktop":
      return "desktop";
    case "android":
    case "ios":
      return "mobile";
    default:
      return "web";
  }
}

export function resolveAppRuntimeContext(platform = detectAppPlatform()): AppRuntimeContext {
  const capabilities = getAppRuntimeCapabilities(platform);

  return {
    platform,
    channel: resolveAppChannel(platform),
    deploymentMode: capabilities.canManageLocalCoreApi ? "local-hosted" : "remote-connected",
    hostRole: capabilities.canManageLocalCoreApi ? "host" : "client",
    capabilities,
  };
}
