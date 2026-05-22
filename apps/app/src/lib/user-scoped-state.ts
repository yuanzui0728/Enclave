import type { QueryClient } from "@tanstack/react-query";
import { clearAllMomentDrafts } from "../features/moments/moment-draft-store";
import { removeSecureStorageItem } from "../runtime/native-secure-storage";
import {
  getAppRuntimeConfig,
  setAppRuntimeConfig,
} from "../runtime/runtime-config-store";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

// 切号 / 登出时不该清掉的 localStorage key（设备级元信息）。runtime-config
// 走特殊处理：内部字段选择性 reset，不整体删 key（保留 cloudApiBaseUrl 等）。
// owner-identity 是"上次登录人"的设备级哨兵，自己清自己会让下次登录失去对照
// 基准——必须保留。
const PRESERVED_LOCAL_STORAGE_KEYS = new Set<string>([
  "yinjie-device-fingerprint",
  "yinjie-app-runtime-config",
  "yinjie-app-runtime-config-updated-at",
  "yinjie-app-owner-identity",
]);

// 用户级 key 的前缀。yinjie-* / yinjie.* / yinjie:* 三种风格在仓库里都有用。
// 用前缀匹配 + 白名单豁免，未来新加 store 默认就被覆盖，不需要再回头登记。
const USER_SCOPED_KEY_PREFIXES = ["yinjie-", "yinjie.", "yinjie:"];

// 没有统一前缀、但功能上是 user-scoped 的散点 key。
const USER_SCOPED_EXPLICIT_KEYS = [
  "chat-detailed-timestamp-mode",
  "chat-detailed-timestamp-mode-updated-at",
];

// sessionStorage 里属于用户级的 key（清完 vite-preload-recovery 之类的设备级
// 不动）。
const USER_SCOPED_SESSION_KEYS = [
  "yinjie-app-navigation-state",
  "yinjie:feed-publish-flash",
  "yinjie:moment-publish-flash",
];

// 这些 key 同时在 native secure storage 上有副本（zustand persist 用
// createSessionStateStorage 时会优先写到 native secure storage）。Web 浏览器
// 上不可达，会 no-op 静默失败。
const NATIVE_SECURE_STORAGE_USER_KEYS = [
  "yinjie-app-cloud-session",
  "yinjie-app-world-owner",
];

// 持久化"当前已登录用户的身份键"用的 key。bootstrap / 登录回调时拿它跟实际
// JWT 解出的 phone 对账，不一致就执行 clearUserScopedClientState。
export const OWNER_IDENTITY_STORAGE_KEY = "yinjie-app-owner-identity";

function isUserScopedLocalStorageKey(key: string) {
  if (PRESERVED_LOCAL_STORAGE_KEYS.has(key)) return false;
  if (USER_SCOPED_EXPLICIT_KEYS.includes(key)) return true;
  return USER_SCOPED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function clearLocalStorageUserKeys() {
  if (typeof window === "undefined") return;
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  if (!storage) return;

  const toRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && isUserScopedLocalStorageKey(key)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    storage.removeItem(key);
  }
}

function clearSessionStorageUserKeys() {
  if (typeof window === "undefined") return;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    return;
  }
  if (!storage) return;
  for (const key of USER_SCOPED_SESSION_KEYS) {
    storage.removeItem(key);
  }
}

async function clearNativeSecureUserKeys() {
  await Promise.all(
    NATIVE_SECURE_STORAGE_USER_KEYS.map((key) =>
      removeSecureStorageItem(key).catch(() => undefined),
    ),
  );
}

function resetRuntimeConfigUserFields() {
  const current = getAppRuntimeConfig();
  setAppRuntimeConfig({
    apiBaseUrl: undefined,
    socketBaseUrl: undefined,
    worldAccessMode: undefined,
    cloudPhone: undefined,
    cloudWorldId: undefined,
    bootstrapSource: "user",
    configStatus: "unconfigured",
    cloudApiBaseUrl: current.cloudApiBaseUrl,
  });
}

function resetZustandUserStores() {
  useCloudSessionStore.getState().clearSession();
  useWorldOwnerStore.getState().clearOwner();
}

export type ClearUserScopedStateOptions = {
  queryClient?: QueryClient;
};

// 切号 / 登出时调用。把所有跟"当前登录人"绑定的客户端状态一次清干净：
//   - React Query 内存缓存
//   - 用户级 zustand store 的内存 state
//   - localStorage / sessionStorage 里所有 yinjie-* / yinjie.* / yinjie:*
//     前缀 key（豁免 device-fingerprint / runtime-config 整体 key）
//   - native secure storage 上 zustand persist 的副本
//   - IndexedDB 里的朋友圈草稿（yinjie-moments / drafts；按 baseUrl 当 key，
//     但 baseUrl 会跨账户撞，切号必须物理删整个 store）
//   - runtime-config 里跟身份绑定的字段（apiBaseUrl / cloudPhone / ...）
// 保留：device fingerprint、cloudApiBaseUrl、appVersion 等设备级元信息。
export async function clearUserScopedClientState(
  options: ClearUserScopedStateOptions = {},
) {
  const { queryClient } = options;
  queryClient?.clear();
  resetZustandUserStores();
  resetRuntimeConfigUserFields();
  clearLocalStorageUserKeys();
  clearSessionStorageUserKeys();
  await Promise.all([clearNativeSecureUserKeys(), clearAllMomentDrafts()]);
}

export function readPersistedOwnerIdentity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(OWNER_IDENTITY_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

// 登录入口拿到新身份后调一次。已记录的身份跟新身份不一致 → 视为切号，先把
// 所有 user-scoped 状态硬清掉再写入新身份；一致或无记录 → 直接写。
// identity 推荐用 "phone:xxx" / "email:xxx" / "google:xxx" 这种带前缀格式，
// 避免不同登录方式之间误判。
export async function assertOwnerIdentity(
  newIdentity: string,
  options: ClearUserScopedStateOptions = {},
) {
  const trimmed = newIdentity.trim();
  if (!trimmed) return;
  const current = readPersistedOwnerIdentity();
  if (current && current !== trimmed) {
    await clearUserScopedClientState(options);
  }
  writePersistedOwnerIdentity(trimmed);
}

export function writePersistedOwnerIdentity(identity: string | null) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = identity?.trim();
    if (trimmed) {
      window.localStorage.setItem(OWNER_IDENTITY_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(OWNER_IDENTITY_STORAGE_KEY);
    }
  } catch {
    // localStorage 不可用时静默忽略；身份哨兵会失效但不会让登录中断。
  }
}
