import type { AppRuntimeCapabilities } from "../platform";

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
};

export function isAndroidPlatform() {
  const capacitorWindow = window as CapacitorWindow;
  const platform = capacitorWindow.Capacitor?.getPlatform?.();

  return platform === "android" && Boolean(capacitorWindow.Capacitor?.isNativePlatform?.());
}

export function getAndroidRuntimeCapabilities(): AppRuntimeCapabilities {
  return {
    canManageLocalCoreApi: false,
    canResolveLocalRuntimeData: false,
    canConfigureProviderLocally: false,
    canUseSecureStorage: true,
    canReceivePush: true,
    canPickImages: true,
    canConfigureRemoteService: true,
    canExportDiagnostics: false,
    canManageProvider: false,
    canScanBootstrapCode: false,
    canOpenExternalLinks: true,
  };
}
