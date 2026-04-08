import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import type { AppRuntimeCapabilities } from "../platform";

export function isDesktopPlatform() {
  return isDesktopRuntimeAvailable();
}

export function getDesktopRuntimeCapabilities(): AppRuntimeCapabilities {
  return {
    canManageLocalCoreApi: true,
    canResolveLocalRuntimeData: true,
    canConfigureProviderLocally: true,
    canUseSecureStorage: false,
    canReceivePush: false,
    canPickImages: false,
    canConfigureRemoteService: false,
    canExportDiagnostics: true,
    canManageProvider: true,
    canScanBootstrapCode: false,
    canOpenExternalLinks: true,
  };
}
