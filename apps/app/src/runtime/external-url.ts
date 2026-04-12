import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  isNativeMobileBridgeAvailable,
  openExternalUrl as openExternalUrlWithMobileBridge,
} from "./mobile-bridge";

function openExternalUrlWithBrowser(url: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const nextWindow = window.open(url, "_blank", "noopener,noreferrer");
  return Boolean(nextWindow);
}

export async function openExternalUrl(url: string) {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return false;
  }

  if (isNativeMobileBridgeAvailable()) {
    return openExternalUrlWithMobileBridge(normalizedUrl);
  }

  if (isDesktopRuntimeAvailable()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(normalizedUrl);
      return true;
    } catch {
      return openExternalUrlWithBrowser(normalizedUrl);
    }
  }

  return openExternalUrlWithBrowser(normalizedUrl);
}
