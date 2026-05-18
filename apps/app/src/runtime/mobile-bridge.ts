import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
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

export type MobileBridgeFileOpenResult = {
  opened: boolean;
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
  openFile(options: {
    base64Data: string;
    fileName: string;
    mimeType?: string;
    title?: string;
  }): Promise<void>;
  pickImages(options?: {
    multiple?: boolean;
    limit?: number;
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
  writeClipboardText(options: { text: string }): Promise<void>;
  readClipboardText(): Promise<{ text: string | null }>;
  writeClipboardImage(options: {
    base64Data: string;
    mimeType?: string;
  }): Promise<void>;
  addListener(
    eventName: "pushTokenChanged",
    listener: (event: { token: string | null; error?: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(
    eventName: "pendingLaunchTargetChanged",
    listener: () => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
};

export type PushTokenChangedEvent = {
  token: string | null;
  error?: string;
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

  // 真机走查 R1（iOS 真机走查 2026-05-18）：之前 8s timeout 跨平台无差别套。
  // iOS 侧 YinjieMobileBridgePlugin.share 用 completionWithItemsHandler 在 sheet
  // dismiss 才 resolve（这是 iOS 原生 UIActivityViewController 的契约——
  // 选好分享目标 / 用户主动取消 → 才走回调）。真机上 AirDrop 选好接收设备 /
  // Messages 选好联系人 / 选好回复内容这些步骤经常 10-30s，8s 强超时直接
  // 把 native 路径打成 false：
  //   - native-share.ts 接到 false 后跌进 navigator.share 兜底 → WKWebView 又
  //     弹一次同款 UIActivityViewController，叠在原 sheet 上；
  //   - share-card-modal、official-article-viewer 等调用方 catch 到失败展示
  //     「分享失败」toast，可是 iOS 原 sheet 还在屏幕上、用户最终也确实分享
  //     成功。
  // Android 侧那条超时是真实存在的：低优先级线程吃住 / WebView 进程被 OS
  // 切到后台 / native listener 异常没回 callback，所以 Android 保留 8s 超时
  // 兜底。iOS 干掉超时，直接 await 原生 callback，让 sheet 真正 dismiss 才结算。
  const platform = Capacitor.getPlatform();
  try {
    if (platform === "ios") {
      await mobileBridge.share(payload);
    } else {
      const SHARE_TIMEOUT_MS = 8_000;
      await Promise.race([
        mobileBridge.share(payload),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("native share timeout")),
            SHARE_TIMEOUT_MS,
          ),
        ),
      ]);
    }
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

  // 真机走查 R1（iOS 真机走查 2026-05-18）：跟 shareWithNativeShell 的 8s 超时
  // 同款问题，iOS 侧 YinjieMobileBridgePlugin.shareFile 用 completionWithItemsHandler
  // 在 sheet dismiss 才 resolve，文件比纯文本场景更慢（用户拣 AirDrop / 选
  // Files 目录 / 写 Mail 附带正文 → 单次决策常 20-60s 起），12s 强超时把
  // ShareCardModal 「保存/分享图片」 / save-remote-file / save-generated-file
  // 的真机正常路径全打成 false，调用方 saveError 上屏「分享失败」、可 iOS sheet
  // 还在屏上、用户最终也成功保存到了 Files / 发到了微信。
  // Android 侧那条超时仍然有效（WebView 进程被切后台 / native listener 没回
  // callback 的 hang 场景），分平台处理。
  const platform = Capacitor.getPlatform();
  try {
    const base64Data = await encodeBlobAsBase64(payload.blob);
    if (platform === "ios") {
      await mobileBridge.shareFile({
        base64Data,
        fileName: normalizedFileName,
        mimeType: payload.mimeType?.trim() || undefined,
        title: payload.title?.trim() || undefined,
      });
    } else {
      const SHARE_FILE_TIMEOUT_MS = 12_000;
      await Promise.race([
        mobileBridge.shareFile({
          base64Data,
          fileName: normalizedFileName,
          mimeType: payload.mimeType?.trim() || undefined,
          title: payload.title?.trim() || undefined,
        }),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("native share file timeout")),
            SHARE_FILE_TIMEOUT_MS,
          ),
        ),
      ]);
    }
    return {
      shared: true,
      error: null,
    };
  } catch (error) {
    return {
      shared: false,
      error: error instanceof Error ? error.message : "failed to share file", // i18n-ignore-line
    };
  }
}

export async function openFileWithNativeShell(
  payload: MobileBridgeNativeFileSharePayload,
): Promise<MobileBridgeFileOpenResult> {
  if (!isNativeMobileBridgeAvailable()) {
    return {
      opened: false,
      error: "native mobile bridge is unavailable",
    };
  }

  const normalizedFileName = payload.fileName.trim();
  if (!normalizedFileName) {
    return {
      opened: false,
      error: "file name is required",
    };
  }

  try {
    const base64Data = await encodeBlobAsBase64(payload.blob);
    await mobileBridge.openFile({
      base64Data,
      fileName: normalizedFileName,
      mimeType: payload.mimeType?.trim() || undefined,
      title: payload.title?.trim() || undefined,
    });
    return {
      opened: true,
      error: null,
    };
  } catch (error) {
    return {
      opened: false,
      error: error instanceof Error ? error.message : "failed to open file", // i18n-ignore-line
    };
  }
}

export async function pickImagesWithNativeShell(
  multiple = false,
  options?: { limit?: number },
) {
  if (!isNativeMobileBridgeAvailable()) {
    return [];
  }

  try {
    const result = await mobileBridge.pickImages({
      multiple,
      // iOS PHPicker selectionLimit + Android PickVisualMedia 用同一字段。
      // 调用方传业务侧的 MAX_*_COUNT，避免用户能勾远超上限的图触发原生层
      // 大量冗余 disk write。Swift / Android 端 limit 缺失时默认 9，跟
      // apps/app 端三条入口的 MAX_ALBUM_IMAGE_COUNT / MAX_IMAGE_COUNT 对齐。
      limit: options?.limit,
    });
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
      error: error instanceof Error ? error.message : "failed to pick file", // i18n-ignore-line
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
      error: error instanceof Error ? error.message : "failed to capture image", // i18n-ignore-line
    };
  }
}

// 真机走查 R2：老实现把 blob 一次性 ArrayBuffer 化成 Uint8Array，再用
// `binary += String.fromCharCode(...chunk)` 同步循环拼一个 binary 串，
// 最后 btoa。整条编码链全在 JS 主线程：
//   - 10MB 图（saveRemoteFile 常见）：~150-400ms 主线程阻塞
//   - 30MB+ PDF（saveGeneratedFile）：~500ms+
// shareFile 入口在 R1 已经把 native 端的 base64 decode + atomic write 挪去
// 后台跑了，但 JS 这条编码同步路径仍把 WKWebView 卡住 → 用户点「保存到
// 文件」 / 「分享」之后看到按钮高亮但好几百 ms 后才出 sheet。
//
// FileReader.readAsDataURL 走的是 WebKit 原生 base64 编码，async + 不占
// JS 主线程；onload 回调时把 "data:<mime>;base64,<payload>" 前缀剥掉就拿到
// 我们要的 base64 串。一次 await、零同步阻塞，分享按钮高亮到 sheet 弹出
// 之间的延迟从「肉眼可见的卡」降到「自然延迟」。WKWebView / Chrome WebView
// 都从 iOS 9 / Android 4.4 开始支持 FileReader，覆盖我们所有移动壳目标。
async function encodeBlobAsBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("base64 encoder produced non-string result")); // i18n-ignore-line
        return;
      }
      // readAsDataURL 输出 "data:<mime>;base64,<base64>"。空 blob 时是 "data:,"
      // 没逗号后内容；indexOf 兜底拿 -1 时退到原串（实际不会发生，留一条
      // 防御路径）。
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("failed to encode blob as base64")); // i18n-ignore-line
    };
    reader.readAsDataURL(blob);
  });
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

export async function writeNativeClipboardText(text: string) {
  if (!isNativeMobileBridgeAvailable()) {
    return false;
  }

  try {
    await mobileBridge.writeClipboardText({ text });
    return true;
  } catch {
    return false;
  }
}

export async function readNativeClipboardText(): Promise<string | null> {
  if (!isNativeMobileBridgeAvailable()) {
    return null;
  }

  try {
    const result = await mobileBridge.readClipboardText();
    return result.text ?? null;
  } catch {
    return null;
  }
}

export async function writeNativeClipboardImage(
  base64Data: string,
  mimeType?: string,
) {
  if (!isNativeMobileBridgeAvailable()) {
    return false;
  }

  try {
    await mobileBridge.writeClipboardImage({ base64Data, mimeType });
    return true;
  } catch {
    return false;
  }
}

export async function onNativePushTokenChanged(
  callback: (event: PushTokenChangedEvent) => void,
): Promise<PluginListenerHandle | null> {
  if (!isNativeMobileBridgeAvailable()) {
    return null;
  }
  try {
    return await mobileBridge.addListener("pushTokenChanged", (event) => {
      callback({
        token: event?.token ?? null,
        error: event?.error,
      });
    });
  } catch {
    return null;
  }
}

// 真机走查 R4：用户在前台收到 push 之后点横幅 → AppDelegate.didReceive 把
// pending target 写进 UserDefaults，但 window.focus / pageshow /
// visibilitychange 都不触发（app 一直 focused & visible），JS 那条
// MobileNotificationLaunchBridge 没人叫醒它读 target。
//
// native 侧 AppDelegate.cacheLaunchTarget 完成后 post 一条
// "YinjiePendingLaunchTargetChanged" NotificationCenter 通知，
// YinjieMobileBridgePlugin 转 notifyListeners 把它推到 JS。这里包一层
// 给 launch bridge 订阅，收到信号 callback 直接重跑 syncPendingLaunchTarget。
export async function onNativePendingLaunchTargetChanged(
  callback: () => void,
): Promise<PluginListenerHandle | null> {
  if (!isNativeMobileBridgeAvailable()) {
    return null;
  }
  try {
    return await mobileBridge.addListener("pendingLaunchTargetChanged", () => {
      callback();
    });
  } catch {
    return null;
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
