import { useEffect } from "react";
import { create } from "zustand";

// 朋友圈单条草稿：按 baseUrl（账户）隔离，Blob 直接走 IndexedDB structured-clone
// 持久化。模仿 moment-publish-flash.ts 的扁平模块形状（环境守卫 + store/clear/has），
// 但因为要存 Blob 必须走 IDB，不能像 flash 那样塞 sessionStorage。
//
// 不引入 idb/idb-keyval 第三方依赖——单一 store + 单一 key 的场景，原生 API 足够。

const DB_NAME = "yinjie-moments";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export type StoredMomentImageBlob = {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
  type: string;
};

export type StoredMomentVideoBlob = {
  id: string;
  blob: Blob;
  posterBlob: Blob | null;
  width: number;
  height: number;
  durationMs: number;
  name: string;
  type: string;
};

export type StoredMomentDraft = {
  text: string;
  imageBlobs: StoredMomentImageBlob[];
  videoBlob: StoredMomentVideoBlob | null;
  savedAt: number;
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

// 单飞 DB 句柄。indexedDB.open 本身允许多次调用，但同一 tab 内复用一个 connection
// 能避开 onupgradeneeded 撞 versionchange 的边界情况；同时也免了每次操作一次握手开销。
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 另一个 tab 升级了 schema → 当前 connection 被 versionchange 顶下来，
      // 不主动 close 会卡住别的 tab 的 onupgradeneeded。下次操作时重新 open。
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB.open failed"));
    req.onblocked = () => reject(new Error("indexedDB.open blocked"));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | { result: T },
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = fn(store);
        // 单 store 单操作场景，oncomplete 比 onsuccess 更稳；前者保证写已落盘。
        tx.oncomplete = () => {
          resolve((req as { result: T }).result);
        };
        tx.onerror = () => reject(tx.error ?? new Error("idb tx error"));
        tx.onabort = () => reject(tx.error ?? new Error("idb tx aborted"));
      }),
  );
}

export async function loadMomentDraft(
  baseUrl: string | null | undefined,
): Promise<StoredMomentDraft | null> {
  if (!hasIndexedDb() || !baseUrl) {
    return null;
  }
  try {
    const value = await runTransaction<StoredMomentDraft | undefined>(
      "readonly",
      (store) => store.get(baseUrl) as IDBRequest<StoredMomentDraft | undefined>,
    );
    return value ?? null;
  } catch {
    // IDB 翻车（隐私模式 / quota 满 / Firefox 私有窗口禁 IDB）静默退化为"没草稿"。
    // 不要把错误冒到 UI 上——发朋友圈本身完全独立于草稿是否能存。
    return null;
  }
}

export async function saveMomentDraft(
  baseUrl: string | null | undefined,
  draft: StoredMomentDraft,
): Promise<void> {
  if (!hasIndexedDb() || !baseUrl) {
    return;
  }
  try {
    await runTransaction("readwrite", (store) => store.put(draft, baseUrl));
    useMomentDraftIndicatorStore.getState().setHasDraft(baseUrl, true);
  } catch {
    // 同 load 路径：失败不冒泡，UI 该正常关 sheet 就关。
  }
}

export async function clearMomentDraft(
  baseUrl: string | null | undefined,
): Promise<void> {
  if (!hasIndexedDb() || !baseUrl) {
    return;
  }
  try {
    await runTransaction("readwrite", (store) => store.delete(baseUrl));
  } catch {
    // ignore
  }
  // 即使 IDB 那边 delete 失败也把 indicator 翻 false——下次入口刷新 hydrate 会
  // 重新对齐到真实状态；保持红点是个"乐观提示"。
  useMomentDraftIndicatorStore.getState().setHasDraft(baseUrl, false);
}

// 切号 / 登出收敛点（clearUserScopedClientState）调用：一把抹掉整个 drafts
// objectStore + 重置 indicator zustand。原本 draft 按 baseUrl 当 key 想做"账户
// 隔离"，但 baseUrl 是 world 服务 URL，会跟 port pool 复用 / world 重启撞同一
// 个 key，所以切号时必须从 IDB 物理删干净——不能依赖"新账户 baseUrl 不同所以
// 读不到"这个假设。
export async function clearAllMomentDrafts(): Promise<void> {
  if (hasIndexedDb()) {
    try {
      await runTransaction("readwrite", (store) => store.clear());
    } catch {
      // 同 load/save/clear 路径：IDB 失败静默退化。clearUserScopedClientState
      // 的其他步骤已经把 runtime-config.apiBaseUrl 清掉，新账户登录拿到新
      // baseUrl 大概率读不到旧 key；极端 quota 满场景下接受残留。
    }
  }
  useMomentDraftIndicatorStore.setState({ hasByBaseUrl: {} });
}

export async function hasMomentDraft(
  baseUrl: string | null | undefined,
): Promise<boolean> {
  if (!hasIndexedDb() || !baseUrl) {
    return false;
  }
  try {
    const count = await runTransaction<number>("readonly", (store) =>
      store.count(baseUrl),
    );
    return count > 0;
  } catch {
    return false;
  }
}

// 红点 indicator：按 baseUrl 分桶。IDB 是真理源，store 是它的镜像 + 同步 UI。
// 不走 zustand persist——重启时由 useMomentDraftIndicator hook 重新 hydrate。
type IndicatorState = {
  hasByBaseUrl: Record<string, boolean>;
  setHasDraft: (baseUrl: string, has: boolean) => void;
};

export const useMomentDraftIndicatorStore = create<IndicatorState>((set) => ({
  hasByBaseUrl: {},
  setHasDraft: (baseUrl, has) =>
    set((state) => {
      const current = state.hasByBaseUrl[baseUrl] ?? false;
      if (current === has) {
        return state;
      }
      return {
        hasByBaseUrl: { ...state.hasByBaseUrl, [baseUrl]: has },
      };
    }),
}));

export function useMomentDraftIndicator(baseUrl: string | null | undefined) {
  useEffect(() => {
    if (!baseUrl) return;
    let cancelled = false;
    void hasMomentDraft(baseUrl).then((has) => {
      if (cancelled) return;
      useMomentDraftIndicatorStore.getState().setHasDraft(baseUrl, has);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return useMomentDraftIndicatorStore((state) =>
    baseUrl ? Boolean(state.hasByBaseUrl[baseUrl]) : false,
  );
}
