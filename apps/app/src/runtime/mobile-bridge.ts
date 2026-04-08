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

export type MobileBridgeLaunchTarget = {
  kind: "route" | "conversation" | "group";
  route?: string;
  conversationId?: string;
  groupId?: string;
  source?: string;
};

type RawLaunchTarget = {
  kind?: string | null;
  route?: string | null;
  conversationId?: string | null;
  groupId?: string | null;
  source?: string | null;
} | null;

type MobileBridgePlugin = {
  openExternalUrl(options: { url: string }): Promise<void>;
  share(options: MobileBridgeSharePayload): Promise<void>;
  pickImages(options?: { multiple?: boolean }): Promise<{ assets: MobileBridgeImageAsset[] }>;
  getPushToken(): Promise<{ token: string | null }>;
  getNotificationPermissionState(): Promise<{ state: string }>;
  requestNotificationPermission(): Promise<{ state: string }>;
  getPendingLaunchTarget(): Promise<{ target: MobileBridgeLaunchTarget | null }>;
  clearPendingLaunchTarget(): Promise<void>;
};

const mobileBridge = registerPlugin<MobileBridgePlugin>("YinjieMobileBridge");

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLaunchTarget(target: RawLaunchTarget): MobileBridgeLaunchTarget | null {
  if (!target) {
    return null;
  }

  const route = normalizeText(target.route);
  const conversationId = normalizeText(target.conversationId);
  const groupId = normalizeText(target.groupId);
  const source = normalizeText(target.source) ?? undefined;
  const kind = normalizeText(target.kind);

  if ((kind === "conversation" || (!kind && conversationId)) && conversationId) {
    return {
      kind: "conversation",
      conversationId,
      source,
    };
  }

  if ((kind === "group" || (!kind && groupId)) && groupId) {
    return {
      kind: "group",
      groupId,
      source,
    };
  }

  if ((kind === "route" || (!kind && route)) && route?.startsWith("/")) {
    return {
      kind: "route",
      route,
      source,
    };
  }

  return null;
}

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

export async function getPendingNativeLaunchTarget() {
  if (!isNativeMobileBridgeAvailable()) {
    return null;
  }

  try {
    const result = await mobileBridge.getPendingLaunchTarget();
    return normalizeLaunchTarget(result.target as RawLaunchTarget);
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
