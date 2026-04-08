import { Capacitor, registerPlugin } from "@capacitor/core";

export type MobileBridgeSharePayload = {
  title?: string;
  text?: string;
  url?: string;
};

export type MobileBridgeImageAsset = {
  path: string;
  webPath?: string;
  mimeType?: string;
  fileName?: string;
};

type MobileBridgePlugin = {
  openExternalUrl(options: { url: string }): Promise<void>;
  share(options: MobileBridgeSharePayload): Promise<void>;
  pickImages(options?: { multiple?: boolean }): Promise<{ assets: MobileBridgeImageAsset[] }>;
  getPushToken(): Promise<{ token: string | null }>;
};

const mobileBridge = registerPlugin<MobileBridgePlugin>("YinjieMobileBridge");

export function isNativeMobileBridgeAvailable() {
  return Capacitor.isNativePlatform() && (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android");
}

export async function openExternalUrl(url: string) {
  if (!isNativeMobileBridgeAvailable()) {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return false;
  }

  try {
    await mobileBridge.openExternalUrl({ url });
    return true;
  } catch {
    return false;
  }
}

export async function shareWithNativeShell(payload: MobileBridgeSharePayload) {
  if (!isNativeMobileBridgeAvailable()) {
    return false;
  }

  try {
    await mobileBridge.share(payload);
    return true;
  } catch {
    return false;
  }
}

export async function pickImagesWithNativeShell(multiple = false) {
  if (!isNativeMobileBridgeAvailable()) {
    return [];
  }

  try {
    const result = await mobileBridge.pickImages({ multiple });
    return result.assets ?? [];
  } catch {
    return [];
  }
}

export async function readNativePushToken() {
  if (!isNativeMobileBridgeAvailable()) {
    return null;
  }

  try {
    const result = await mobileBridge.getPushToken();
    return result.token ?? null;
  } catch {
    return null;
  }
}
