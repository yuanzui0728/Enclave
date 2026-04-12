import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type LiveDraft = {
  title: string;
  topic: string;
  coverHook: string;
  referencePostAuthorName: string | null;
  referencePostId: string | null;
  quality: "standard" | "hd" | "ultra";
  mode: "solo" | "product" | "story";
  syncComments: boolean;
  autoClip: boolean;
};

export type LiveSessionRecord = {
  id: string;
  title: string;
  topic: string;
  quality: LiveDraft["quality"];
  mode: LiveDraft["mode"];
  startedAt: string;
  endedAt?: string;
  status: "live" | "ended";
  channelPostId?: string;
};

type LiveCompanionStore = {
  draft: LiveDraft;
  history: LiveSessionRecord[];
};

const LIVE_DRAFT_STORAGE_KEY = "yinjie-desktop-live-companion-draft";
const LIVE_HISTORY_STORAGE_KEY = "yinjie-desktop-live-companion-history";
const MAX_LIVE_HISTORY = 12;
let liveCompanionNativeWriteQueue: Promise<void> = Promise.resolve();

export const defaultLiveDraft: LiveDraft = {
  title: "",
  topic: "",
  coverHook: "",
  referencePostAuthorName: null,
  referencePostId: null,
  quality: "hd",
  mode: "solo",
  syncComments: true,
  autoClip: true,
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function normalizeLiveDraft(
  draft: Partial<LiveDraft> | null | undefined,
): LiveDraft {
  return {
    title: typeof draft?.title === "string" ? draft.title : "",
    topic: typeof draft?.topic === "string" ? draft.topic : "",
    coverHook: typeof draft?.coverHook === "string" ? draft.coverHook : "",
    referencePostAuthorName:
      typeof draft?.referencePostAuthorName === "string"
        ? draft.referencePostAuthorName
        : null,
    referencePostId:
      typeof draft?.referencePostId === "string" ? draft.referencePostId : null,
    quality: isLiveQuality(draft?.quality) ? draft.quality : "hd",
    mode: isLiveMode(draft?.mode) ? draft.mode : "solo",
    syncComments:
      typeof draft?.syncComments === "boolean"
        ? draft.syncComments
        : defaultLiveDraft.syncComments,
    autoClip:
      typeof draft?.autoClip === "boolean"
        ? draft.autoClip
        : defaultLiveDraft.autoClip,
  };
}

function normalizeLiveHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as LiveSessionRecord[];
  }

  return value.filter(
    (item): item is LiveSessionRecord =>
      typeof item?.id === "string" &&
      typeof item.title === "string" &&
      typeof item.topic === "string" &&
      isLiveQuality(item.quality) &&
      isLiveMode(item.mode) &&
      typeof item.startedAt === "string" &&
      (item.endedAt === undefined || typeof item.endedAt === "string") &&
      (item.channelPostId === undefined || typeof item.channelPostId === "string") &&
      (item.status === "live" || item.status === "ended"),
  );
}

function normalizeLiveCompanionStore(value: unknown): LiveCompanionStore {
  if (!value || typeof value !== "object") {
    return {
      draft: { ...defaultLiveDraft },
      history: [] as LiveSessionRecord[],
    };
  }

  const parsed = value as {
    draft?: Partial<LiveDraft>;
    history?: unknown;
  };

  return {
    draft: normalizeLiveDraft(parsed.draft),
    history: normalizeLiveHistory(parsed.history),
  };
}

function parseLiveCompanionStore(raw: string | null | undefined) {
  if (!raw) {
    return {
      draft: { ...defaultLiveDraft },
      history: [] as LiveSessionRecord[],
    } satisfies LiveCompanionStore;
  }

  try {
    return normalizeLiveCompanionStore(JSON.parse(raw));
  } catch {
    return {
      draft: { ...defaultLiveDraft },
      history: [] as LiveSessionRecord[],
    } satisfies LiveCompanionStore;
  }
}

function parseLiveDraftRaw(raw: string | null) {
  if (!raw) {
    return { ...defaultLiveDraft };
  }

  try {
    return normalizeLiveDraft(JSON.parse(raw) as Partial<LiveDraft>);
  } catch {
    return { ...defaultLiveDraft };
  }
}

function parseLiveHistoryRaw(raw: string | null) {
  if (!raw) {
    return [] as LiveSessionRecord[];
  }

  try {
    return normalizeLiveHistory(JSON.parse(raw) as LiveSessionRecord[]);
  } catch {
    return [] as LiveSessionRecord[];
  }
}

function hasLiveDraftChanges(draft: LiveDraft) {
  return (
    draft.title.trim().length > 0 ||
    draft.topic.trim().length > 0 ||
    draft.coverHook.trim().length > 0 ||
    draft.referencePostAuthorName !== defaultLiveDraft.referencePostAuthorName ||
    draft.referencePostId !== defaultLiveDraft.referencePostId ||
    draft.quality !== defaultLiveDraft.quality ||
    draft.mode !== defaultLiveDraft.mode ||
    draft.syncComments !== defaultLiveDraft.syncComments ||
    draft.autoClip !== defaultLiveDraft.autoClip
  );
}

function hasLiveCompanionStoreData(store: LiveCompanionStore) {
  return hasLiveDraftChanges(store.draft) || store.history.length > 0;
}

function getLatestLiveHistoryTimestamp(history: LiveSessionRecord[]) {
  return history.reduce((latest, item) => {
    const startedAt = Date.parse(item.startedAt);
    const endedAt = item.endedAt ? Date.parse(item.endedAt) : Number.NaN;
    return Math.max(
      latest,
      Number.isFinite(startedAt) ? startedAt : 0,
      Number.isFinite(endedAt) ? endedAt : 0,
    );
  }, 0);
}

function readLocalLiveCompanionStore(): LiveCompanionStore {
  const storage = getStorage();
  if (!storage) {
    return {
      draft: { ...defaultLiveDraft },
      history: [] as LiveSessionRecord[],
    };
  }

  const draftRaw = storage.getItem(LIVE_DRAFT_STORAGE_KEY);
  const historyRaw = storage.getItem(LIVE_HISTORY_STORAGE_KEY);

  return {
    draft: parseLiveDraftRaw(draftRaw),
    history: parseLiveHistoryRaw(historyRaw),
  };
}

function queueNativeLiveCompanionStoreWrite(store: LiveCompanionStore) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(store);
  liveCompanionNativeWriteQueue = liveCompanionNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_live_companion_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeLiveCompanionStoreToLocal(
  store: LiveCompanionStore,
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return store;
  }

  if (hasLiveDraftChanges(store.draft)) {
    storage.setItem(LIVE_DRAFT_STORAGE_KEY, JSON.stringify(store.draft));
  } else {
    storage.removeItem(LIVE_DRAFT_STORAGE_KEY);
  }

  if (store.history.length) {
    storage.setItem(LIVE_HISTORY_STORAGE_KEY, JSON.stringify(store.history));
  } else {
    storage.removeItem(LIVE_HISTORY_STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeLiveCompanionStoreWrite(store);
  }

  return store;
}

export function readLiveDraft() {
  return readLocalLiveCompanionStore().draft;
}

export function writeLiveDraft(draft: LiveDraft) {
  const nextStore = {
    ...readLocalLiveCompanionStore(),
    draft: normalizeLiveDraft(draft),
  } satisfies LiveCompanionStore;
  writeLiveCompanionStoreToLocal(nextStore);
  return nextStore.draft;
}

export function readLiveHistory() {
  return readLocalLiveCompanionStore().history;
}

export function writeLiveHistory(history: LiveSessionRecord[]) {
  const nextStore = {
    ...readLocalLiveCompanionStore(),
    history: normalizeLiveHistory(history),
  } satisfies LiveCompanionStore;
  writeLiveCompanionStoreToLocal(nextStore);
  return nextStore.history;
}

export async function hydrateLiveCompanionFromNative() {
  const localStore = readLocalLiveCompanionStore();
  if (!isDesktopRuntimeAvailable()) {
    return localStore;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_live_companion_store");

    if (!result.exists) {
      if (hasLiveCompanionStoreData(localStore)) {
        queueNativeLiveCompanionStoreWrite(localStore);
      }
      return localStore;
    }

    const nativeStore = parseLiveCompanionStore(result.contents ?? null);
    const shouldPreferLocal =
      (!hasLiveCompanionStoreData(nativeStore) &&
        hasLiveCompanionStoreData(localStore)) ||
      (hasLiveDraftChanges(localStore.draft) &&
        !hasLiveDraftChanges(nativeStore.draft)) ||
      getLatestLiveHistoryTimestamp(localStore.history) >
        getLatestLiveHistoryTimestamp(nativeStore.history);

    if (shouldPreferLocal) {
      if (hasLiveCompanionStoreData(localStore)) {
        queueNativeLiveCompanionStoreWrite(localStore);
      }
      return localStore;
    }

    writeLiveCompanionStoreToLocal(nativeStore, {
      syncNative: false,
    });
    return nativeStore;
  } catch {
    return localStore;
  }
}

export function startLocalLiveSession(input: {
  draft: LiveDraft;
  previous: LiveSessionRecord[];
}) {
  const nextSession: LiveSessionRecord = {
    id: `live-session-${Date.now()}`,
    title: input.draft.title.trim(),
    topic: input.draft.topic.trim(),
    channelPostId: input.draft.referencePostId ?? undefined,
    quality: input.draft.quality,
    mode: input.draft.mode,
    startedAt: new Date().toISOString(),
    status: "live",
  };
  const nextHistory = [
    nextSession,
    ...input.previous.map((item) =>
      item.status === "live"
        ? {
            ...item,
            status: "ended" as const,
            endedAt: item.endedAt ?? new Date().toISOString(),
          }
        : item,
    ),
  ].slice(0, MAX_LIVE_HISTORY);

  writeLiveHistory(nextHistory);
  return nextHistory;
}

export function endLocalLiveSession(previous: LiveSessionRecord[]) {
  const endedAt = new Date().toISOString();
  const nextHistory = previous.map((item) =>
    item.status === "live"
      ? {
          ...item,
          status: "ended" as const,
          endedAt,
        }
      : item,
  );

  writeLiveHistory(nextHistory);
  return nextHistory;
}

function isLiveMode(value: unknown): value is LiveDraft["mode"] {
  return value === "solo" || value === "product" || value === "story";
}

function isLiveQuality(value: unknown): value is LiveDraft["quality"] {
  return value === "standard" || value === "hd" || value === "ultra";
}
