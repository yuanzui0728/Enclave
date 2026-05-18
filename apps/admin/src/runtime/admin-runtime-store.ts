import { useSyncExternalStore } from "react";

const STORAGE_KEY = "yinjie-admin-runtime";

export type AdminRuntimeState = {
  apiBaseUrl?: string;
  cloudApiBaseUrl?: string;
  accessToken?: string;
  cloudPhone?: string;
  cloudEmail?: string;
  cloudWorldId?: string;
  cloudAccessSessionId?: string;
};

const listeners = new Set<() => void>();

// 用 sessionStorage 而不是 localStorage：admin 运行时（apiBaseUrl/cloudWorldId/...）
// 是"哪个云世界的后台"的 per-tab 状态。云控制台同时点开两个世界的"进入后台"会
// 各自打开一个 tab，每个 tab 通过 hash bootstrap 写入自己那个世界的 apiBaseUrl。
// localStorage 跨 tab 共享 → 后来的 tab 会覆盖前一个 tab 的值；前一个 tab 一旦刷新
// （hash 早就被 replaceState 抹掉以防 secret 泄露），就只能从 storage 读到对方
// 的 apiBaseUrl，再次串台。sessionStorage 按 tab 隔离，同 tab 内刷新仍能保留状态，
// 跨 tab 完全独立。
function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readPersisted(): AdminRuntimeState {
  const storage = getStorage();
  const raw = storage?.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as AdminRuntimeState;
    }
  } catch {
    // ignore
  }

  return {};
}

function writePersisted(state: AdminRuntimeState) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (Object.keys(state).length === 0) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let runtime: AdminRuntimeState = readPersisted();

function emit() {
  listeners.forEach((listener) => listener());
}

function compact(state: AdminRuntimeState): AdminRuntimeState {
  const result: AdminRuntimeState = {};
  for (const key of Object.keys(state) as (keyof AdminRuntimeState)[]) {
    const value = state[key];
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

export function getAdminRuntime(): AdminRuntimeState {
  return runtime;
}

export function setAdminRuntime(next: Partial<AdminRuntimeState>): AdminRuntimeState {
  runtime = compact({ ...runtime, ...next });
  writePersisted(runtime);
  emit();
  return runtime;
}

export function clearAdminRuntimeSession() {
  runtime = {};
  writePersisted(runtime);
  emit();
}

export function subscribeAdminRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdminRuntime(): AdminRuntimeState {
  return useSyncExternalStore(subscribeAdminRuntime, getAdminRuntime, getAdminRuntime);
}
