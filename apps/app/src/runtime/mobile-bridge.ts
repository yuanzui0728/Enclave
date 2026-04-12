import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  normalizeMobilePushLaunchTarget,
  type MobilePushLaunchTarget,
} from "@yinjie/contracts";

export type MobileBridgeSharePayload = {
  title?: string;
  text?: string;
  url?: string;
};

export type MobileBridgeNativeFileSharePayload = {
  blob: Blob;
  fileName: string;
  mimeType?: string;
  title?: string;
};

export type MobileBridgeFileAsset = {
  path: string;
  webPath?: string;
  mimeType?: string;
  fileName?: string;
};

export type MobileBridgeImageAsset = MobileBridgeFileAsset;

export type MobileBridgeImageCaptureResult = {
  asset: MobileBridgeImageAsset | null;
  error: string | null;
};

export type MobileBridgeFilePickResult = {
  asset: MobileBridgeFileAsset | null;
  error: string | null;
};

export type MobileBridgeFileShareResult = {
  shared: boolean;
  error: string | null;
};

export type MobileBridgeLaunchTarget = MobilePushLaunchTarget;

export type MobileBridgeLocalNotificationPayload = {
  id?: string;
  title: string;
  body: string;
  route?: string;
  conversationId?: string;
  groupId?: string;
  source?: string;
};

type MobileBridgePlugin = {
  openExternalUrl(options: { url: string }): Promise<void>;
  openAppSettings(): Promise<void>;
  share(options: MobileBridgeSharePayload): Promise<void>;
  shareFile(options: {
    base64Data: string;
    fileName: string;
    mimeType?: string;
    title?: string;
  }): Promise<void>;
  pickImages(options?: {
    multiple?: boolean;
  }): Promise<{ assets: MobileBridgeImageAsset[] }>;
  pickFile(): Promise<{ asset: MobileBridgeFileAsset | null }>;
  captureImage(): Promise<{ asset: MobileBridgeImageAsset | null }>;
  getPushToken(): Promise<{ token: string | null }>;
  getNotificationPermissionState(): Promise<{ state: string }>;
  requestNotificationPermission(): Promise<{ state: string }>;
  showLocalNotification(
    options: MobileBridgeLocalNotificationPayload,
  ): Promise<void>;
  getPendingLaunchTarget(): Promise<{
    target: MobileBridgeLaunchTarget | null;
  }>;
  clearPendingLaunchTarget(): Promise<void>;
};

const mobileBridge = registerPlugin<MobileBridgePlugin>("YinjieMobileBridge");

export function isNativeMobileBridgeAvailable() {
  return (
    Capacitor.isNativePlatform() &&
    (Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android")
  );
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

export async function openAppSettings() {
  if (!isNativeMobileBridgeAvailable()) {
    return false;
  }

  try {
    await mobileBridge.openAppSettings();
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

export async function shareFileWithNativeShell(
  payload: MobileBridgeNativeFileSharePayload,
): Promise<MobileBridgeFileShareResult> {
  if (!isNativeMobileBridgeAvailable()) {
    return {
      shared: false,
      error: "native mobile bridge is unavailable",
    };
  }

  const normalizedFileName = payload.fileName.trim();
  if (!normalizedFileName) {
    return {
      shared: false,
      error: "file name is required",
    };
  }

  try {
    const base64Data = await encodeBlobAsBase64(payload.blob);
    await mobileBridge.shareFile({
      base64Data,
      fileName: normalizedFileName,
      mimeType: payload.mimeType?.trim() || undefined,
      title: payload.title?.trim() || undefined,
    });
    return {
      shared: true,
      error: null,
    };
  } catch (error) {
    return {
      shared: false,
      error: error instanceof Error ? error.message : "failed to share file",
    };
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

export async function pickFileWithNativeShell(): Promise<MobileBridgeFilePickResult> {
  if (!isNativeMobileBridgeAvailable()) {
    return {
      asset: null,
      error: "native mobile bridge is unavailable",
    };
  }

  try {
    const result = await mobileBridge.pickFile();
    return {
      asset: result.asset ?? null,
      error: null,
    };
  } catch (error) {
    return {
      asset: null,
      error: error instanceof Error ? error.message : "failed to pick file",
    };
  }
}

export async function captureImageWithNativeShell(): Promise<MobileBridgeImageCaptureResult> {
  if (!isNativeMobileBridgeAvailable()) {
    return {
      asset: null,
      error: "native mobile bridge is unavailable",
    };
  }

  try {
    const result = await mobileBridge.captureImage();
    return {
      asset: result.asset ?? null,
      error: null,
    };
  } catch (error) {
    return {
      asset: null,
      error: error instanceof Error ? error.message : "failed to capture image",
    };
  }
}

async function encodeBlobAsBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa !== "function") {
    throw new Error("base64 encoder is unavailable");
  }

  return btoa(binary);
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

export async function getNativeNotificationPermissionState() {
  if (!isNativeMobileBridgeAvailable()) {
    return "unsupported";
  }

  try {
    const result = await mobileBridge.getNotificationPermissionState();
    return result.state;
  } catch {
    return "unknown";
  }
}

export async function getNotificationPermissionState() {
  if (isNativeMobileBridgeAvailable()) {
    return getNativeNotificationPermissionState();
  }

  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  return "prompt";
}

export async function requestNativeNotificationPermission() {
  if (!isNativeMobileBridgeAvailable()) {
    return "unsupported";
  }

  try {
    const result = await mobileBridge.requestNotificationPermission();
    return result.state;
  } catch {
    return "unknown";
  }
}

export async function requestNotificationPermission() {
  if (isNativeMobileBridgeAvailable()) {
    return requestNativeNotificationPermission();
  }

  if (typeof Notification === "undefined") {
    return "unsupported";
  }

  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      return "granted";
    }

    if (result === "denied") {
      return "denied";
    }

    return "prompt";
  } catch {
    return "unknown";
  }
}

export async function showLocalNotification(
  payload: MobileBridgeLocalNotificationPayload,
) {
  if (isNativeMobileBridgeAvailable()) {
    try {
      await mobileBridge.showLocalNotification(payload);
      return true;
    } catch {
      return false;
    }
  }

  if (typeof Notification === "undefined") {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      tag: payload.id,
    });
    const targetUrl = resolveLocalNotificationTargetUrl(payload);
    if (targetUrl) {
      notification.onclick = () => {
        notification.close();
        if (typeof window === "undefined") {
          return;
        }

        window.focus();
        if (window.location.pathname + window.location.hash === targetUrl) {
          return;
        }

        if (targetUrl.startsWith("/")) {
          window.location.assign(targetUrl);
        }
      };
    }
    return true;
  } catch {
    return false;
  }
}

export async function getPendingNativeLaunchTarget() {
  if (!isNativeMobileBridgeAvailable()) {
    return null;
  }

  try {
    const result = await mobileBridge.getPendingLaunchTarget();
    return normalizeMobilePushLaunchTarget(result.target);
  } catch {
    return null;
  }
}

export async function clearPendingNativeLaunchTarget() {
  if (!isNativeMobileBridgeAvailable()) {
    return false;
  }

  try {
    await mobileBridge.clearPendingLaunchTarget();
    return true;
  } catch {
    return false;
  }
}

function resolveLocalNotificationTargetUrl(
  payload: MobileBridgeLocalNotificationPayload,
) {
  if (payload.route?.trim()) {
    return payload.route.trim();
  }

  if (payload.groupId?.trim()) {
    return `/group/${payload.groupId.trim()}`;
  }

  if (payload.conversationId?.trim()) {
    return `/chat/${payload.conversationId.trim()}`;
  }

  return null;
}
