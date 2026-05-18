import { resolveAppCoreApiBaseUrl } from "../lib/runtime-config";
import { useWorldOwnerStore } from "../store/world-owner-store";
import {
  getNativeNotificationPermissionState,
  isNativeMobileBridgeAvailable,
  onNativePushTokenChanged,
  readNativePushToken,
} from "./mobile-bridge";
import { isIosPlatform } from "./adapters/ios";
import { isAndroidPlatform } from "./adapters/android";
import { getAppRuntimeConfig } from "./runtime-config-store";

const SYNC_CACHE_KEY = "yinjie-push-token-sync-cache.v1";

type SyncTarget = {
  platform: "ios" | "android";
  bundleIdDefault: string;
};

const IOS_TARGET: SyncTarget = {
  platform: "ios",
  bundleIdDefault: "com.yinjie.ios",
};

const ANDROID_TARGET: SyncTarget = {
  platform: "android",
  bundleIdDefault: "com.yinjie.mobile",
};

type CachedSyncRecord = {
  ownerId: string;
  tokenHash: string;
  syncedAt: string;
};

function readCache(): CachedSyncRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SYNC_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedSyncRecord) : null;
  } catch {
    return null;
  }
}

function writeCache(record: CachedSyncRecord) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(record));
  } catch {
    // 静默：localStorage 配额满或 Safari private mode
  }
}

function clearCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYNC_CACHE_KEY);
  } catch {
    // 同上
  }
}

function hashToken(token: string) {
  let h = 0;
  for (let i = 0; i < token.length; i += 1) {
    h = (h * 31 + token.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export type SyncIosPushTokenResult =
  | { ok: true; updated: boolean; reason?: never }
  | {
      ok: false;
      reason:
        | "not-ios"
        | "no-permission"
        | "no-token"
        | "no-owner"
        | "skipped-cache"
        | "request-failed"
        | "network-error";
    };

export type SyncAndroidPushTokenResult =
  | { ok: true; updated: boolean; reason?: never }
  | {
      ok: false;
      reason:
        | "not-android"
        | "no-permission"
        | "no-token"
        | "no-owner"
        | "skipped-cache"
        | "request-failed"
        | "network-error";
    };

type SyncCoreResult =
  | { ok: true; updated: boolean }
  | {
      ok: false;
      reason:
        | "no-permission"
        | "no-token"
        | "no-owner"
        | "skipped-cache"
        | "request-failed"
        | "network-error";
    };

async function syncNativePushTokenCore(
  target: SyncTarget,
  options?: { force?: boolean },
): Promise<SyncCoreResult> {
  const permission = await getNativeNotificationPermissionState();
  if (permission !== "granted") {
    return { ok: false, reason: "no-permission" };
  }

  const token = await readNativePushToken();
  if (!token) {
    return { ok: false, reason: "no-token" };
  }

  const ownerId = useWorldOwnerStore.getState().id;
  if (!ownerId) {
    return { ok: false, reason: "no-owner" };
  }

  const tokenHash = hashToken(token);
  const cache = readCache();
  if (
    !options?.force &&
    cache &&
    cache.ownerId === ownerId &&
    cache.tokenHash === tokenHash
  ) {
    return { ok: false, reason: "skipped-cache" };
  }

  const runtimeConfig = getAppRuntimeConfig();
  const bundleId =
    runtimeConfig.applicationId?.trim() || target.bundleIdDefault;
  const appVersion = runtimeConfig.appVersionName?.trim() || null;
  const environment =
    runtimeConfig.environment === "development" ? "development" : "production";
  const locale =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : null;

  let baseUrl: string;
  try {
    baseUrl = resolveAppCoreApiBaseUrl();
  } catch {
    return { ok: false, reason: "network-error" };
  }

  try {
    const response = await fetch(`${baseUrl}/api/push/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: target.platform,
        token,
        bundleId,
        environment,
        appVersion,
        locale,
      }),
    });
    if (!response.ok) {
      console.warn(
        "[push-token-sync] register failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return { ok: false, reason: "request-failed" };
    }
    let updated = false;
    try {
      const data = (await response.json()) as { updated?: boolean };
      updated = Boolean(data.updated);
    } catch {
      // 静默：忽略 body 解析失败
    }
    writeCache({
      ownerId,
      tokenHash,
      syncedAt: new Date().toISOString(),
    });
    return { ok: true, updated };
  } catch (error) {
    console.warn("[push-token-sync] network error", error);
    return { ok: false, reason: "network-error" };
  }
}

/**
 * 把 iOS 设备的 APNs device token 上报给后端 (POST /api/push/tokens)。
 * 调用时机：
 *   - bootstrapIos 兜底跑一次（只有用户已授权时才会真正上报）
 *   - 用户授权通知后立刻调一次（chat-details-page 等）
 *   - 登录成功后调一次（让换号也能立刻 attach）
 *   - APNs 重发新 token 时（onNativePushTokenChanged 监听 → 走 cache 短路，
 *     token 真换了 cache miss 再 POST；走查 R7 把这里 force:true 去掉了）
 *
 * 缓存机制：localStorage 记 (ownerId + tokenHash)；相同则跳过避免每次启动都打接口。
 */
export async function syncIosPushToken(options?: {
  force?: boolean;
}): Promise<SyncIosPushTokenResult> {
  if (!isIosPlatform() || !isNativeMobileBridgeAvailable()) {
    return { ok: false, reason: "not-ios" };
  }
  const result = await syncNativePushTokenCore(IOS_TARGET, options);
  if (result.ok) {
    return { ok: true, updated: result.updated };
  }
  return { ok: false, reason: result.reason };
}

/**
 * 把 Android 设备的 FCM device token 上报给后端 (POST /api/push/tokens)。
 * 同 iOS 的契约：调用时机 = bootstrapAndroid + 授权通知后 + 登录成功 / 换号。
 * Android 的 FCM token 由 YinjieFirebaseMessagingService.onNewToken 写到
 * SharedPreferences；JS 这里每次 sync 重新 readNativePushToken 抓最新值，
 * token 轮换（reinstall / 清 app data）下次冷启自然会重报。
 */
export async function syncAndroidPushToken(options?: {
  force?: boolean;
}): Promise<SyncAndroidPushTokenResult> {
  if (!isAndroidPlatform() || !isNativeMobileBridgeAvailable()) {
    return { ok: false, reason: "not-android" };
  }
  const result = await syncNativePushTokenCore(ANDROID_TARGET, options);
  if (result.ok) {
    return { ok: true, updated: result.updated };
  }
  return { ok: false, reason: result.reason };
}

let listenerHandlePromise: Promise<unknown> | null = null;
let ownerSubscriptionStarted = false;

/**
 * 注册 native 端 pushTokenChanged 事件监听 —— 当 APNs 重发新 device token
 * 时（比如 reinstall、iOS 大版本升级），自动 resync 到后端。
 *
 * 走查 R7：listener 不能写 `force: true`。Apple 保证
 * didRegisterForRemoteNotificationsWithDeviceToken 一定 fire（即使 token 没
 * 变），AppDelegate.applicationDidBecomeActive 的「Settings 改通知权限 →
 * not-granted → granted transition → re-register」路径每次触发都会让 listener
 * 收到一次事件；in-app 第一次授权时 Plugin 自己 register 一次，紧接着第一次
 * 切回前台 didBecomeActive 又 register 一次（lastNotificationAuthStatus 那条
 * transition 判定看到 previous=.notDetermined → current=.authorized 视作新
 * 授权）。force: true 让这每一次都打 cloud-api POST /api/push/tokens，对同一
 * 个 token 重复打没意义。
 *
 * 改 force: false：让 syncIosPushToken 走 (ownerId, tokenHash) cache 短路 ——
 *   - token 真换了（reinstall / 大版本升级 / iCloud restore）→ tokenHash 不
 *     一样 → cache miss → 正常 POST 上去；
 *   - token 没换（每次 register 通常都是同 token）→ cache hit → skipped-cache
 *     不发请求。
 * 业务上对 token rotation 的捕获能力不变，仅去掉重复 POST 的浪费。
 */
export function startIosPushTokenSyncListener() {
  if (!isIosPlatform() || !isNativeMobileBridgeAvailable()) {
    return;
  }
  if (listenerHandlePromise) {
    return;
  }

  listenerHandlePromise = onNativePushTokenChanged((event) => {
    if (event.error) {
      console.warn("[push-token-sync] APNs registration error:", event.error);
      return;
    }
    if (event.token) {
      void syncIosPushToken();
    }
  });
}

/**
 * 监听 owner 状态变化：从 null 变成有值（登录）或换号时触发 sync。
 * 登出时清缓存。
 */
export function startIosOwnerChangeListener() {
  if (!isIosPlatform() || !isNativeMobileBridgeAvailable()) {
    return;
  }
  if (ownerSubscriptionStarted) {
    return;
  }
  ownerSubscriptionStarted = true;

  let lastOwnerId = useWorldOwnerStore.getState().id;
  useWorldOwnerStore.subscribe((state) => {
    const next = state.id;
    if (next === lastOwnerId) {
      return;
    }
    if (!next) {
      // 登出：清缓存，让下次登录立刻重报
      clearCache();
    } else {
      // 换号或首次登录：force resync
      void syncIosPushToken({ force: true });
    }
    lastOwnerId = next;
  });
}

/**
 * Android 端 owner 监听：跟 iOS 完全一样的契约，登录 / 换号 force resync、
 * 登出清缓存。Android 没有 pushTokenChanged 事件（FCM SDK 把 onNewToken 直接
 * 落到 SharedPreferences，JS 这边下次冷启读最新值即可），所以不开 push token
 * listener，token 轮换走 bootstrap 路径。
 */
export function startAndroidOwnerChangeListener() {
  if (!isAndroidPlatform() || !isNativeMobileBridgeAvailable()) {
    return;
  }
  if (ownerSubscriptionStarted) {
    return;
  }
  ownerSubscriptionStarted = true;

  let lastOwnerId = useWorldOwnerStore.getState().id;
  useWorldOwnerStore.subscribe((state) => {
    const next = state.id;
    if (next === lastOwnerId) {
      return;
    }
    if (!next) {
      clearCache();
    } else {
      void syncAndroidPushToken({ force: true });
    }
    lastOwnerId = next;
  });
}

/**
 * 用户登出 / 切号时清缓存，下次 sync 必然会重报。
 */
export function clearIosPushTokenSyncCache() {
  clearCache();
}

/**
 * Android 端同样的缓存清理；登出 / 切号路径上调用。
 */
export function clearAndroidPushTokenSyncCache() {
  clearCache();
}

/**
 * 平台无关的同步入口：业务页（chat-details-page 等）授权通知后调一次，
 * 内部按平台分发，非原生壳 / 非 iOS / 非 Android 都安全短路。
 */
export async function syncNativePushTokenAcrossPlatforms(options?: {
  force?: boolean;
}) {
  if (isIosPlatform()) {
    return syncIosPushToken(options);
  }
  if (isAndroidPlatform()) {
    return syncAndroidPushToken(options);
  }
  return null;
}
