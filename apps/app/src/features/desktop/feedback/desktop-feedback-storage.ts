import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type DesktopFeedbackCategory =
  | "bug"
  | "interaction"
  | "performance"
  | "content"
  | "feature";

export type DesktopFeedbackPriority = "low" | "medium" | "high";

export type DesktopFeedbackDraft = {
  category: DesktopFeedbackCategory;
  priority: DesktopFeedbackPriority;
  title: string;
  detail: string;
  reproduction: string;
  expected: string;
  includeSystemSnapshot: boolean;
};

export type DesktopFeedbackRecord = DesktopFeedbackDraft & {
  id: string;
  submittedAt: string;
  diagnosticSummary: string;
};

type DesktopFeedbackStore = {
  draft: DesktopFeedbackDraft;
  history: DesktopFeedbackRecord[];
};

const DESKTOP_FEEDBACK_DRAFT_KEY = "yinjie-desktop-feedback-draft";
const DESKTOP_FEEDBACK_HISTORY_KEY = "yinjie-desktop-feedback-history";
const MAX_DESKTOP_FEEDBACK_HISTORY = 12;
let desktopFeedbackNativeWriteQueue: Promise<void> = Promise.resolve();

export const defaultDesktopFeedbackDraft: DesktopFeedbackDraft = {
  category: "bug",
  priority: "medium",
  title: "",
  detail: "",
  reproduction: "",
  expected: "",
  includeSystemSnapshot: true,
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function normalizeDesktopFeedbackDraft(
  draft: Partial<DesktopFeedbackDraft> | null | undefined,
): DesktopFeedbackDraft {
  return {
    category: isFeedbackCategory(draft?.category)
      ? draft.category
      : defaultDesktopFeedbackDraft.category,
    priority: isFeedbackPriority(draft?.priority)
      ? draft.priority
      : defaultDesktopFeedbackDraft.priority,
    title: typeof draft?.title === "string" ? draft.title : "",
    detail: typeof draft?.detail === "string" ? draft.detail : "",
    reproduction:
      typeof draft?.reproduction === "string" ? draft.reproduction : "",
    expected: typeof draft?.expected === "string" ? draft.expected : "",
    includeSystemSnapshot:
      typeof draft?.includeSystemSnapshot === "boolean"
        ? draft.includeSystemSnapshot
        : defaultDesktopFeedbackDraft.includeSystemSnapshot,
  };
}

function normalizeDesktopFeedbackHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as DesktopFeedbackRecord[];
  }

  return value.filter(
    (item): item is DesktopFeedbackRecord =>
      typeof item?.id === "string" &&
      isFeedbackCategory(item.category) &&
      isFeedbackPriority(item.priority) &&
      typeof item.title === "string" &&
      typeof item.detail === "string" &&
      typeof item.reproduction === "string" &&
      typeof item.expected === "string" &&
      typeof item.includeSystemSnapshot === "boolean" &&
      typeof item.diagnosticSummary === "string" &&
      typeof item.submittedAt === "string",
  );
}

function normalizeDesktopFeedbackStore(value: unknown): DesktopFeedbackStore {
  if (!value || typeof value !== "object") {
    return {
      draft: { ...defaultDesktopFeedbackDraft },
      history: [] as DesktopFeedbackRecord[],
    };
  }

  const parsed = value as {
    draft?: Partial<DesktopFeedbackDraft>;
    history?: unknown;
  };

  return {
    draft: normalizeDesktopFeedbackDraft(parsed.draft),
    history: normalizeDesktopFeedbackHistory(parsed.history),
  };
}

function parseDesktopFeedbackStore(raw: string | null | undefined) {
  if (!raw) {
    return {
      draft: { ...defaultDesktopFeedbackDraft },
      history: [] as DesktopFeedbackRecord[],
    } satisfies DesktopFeedbackStore;
  }

  try {
    return normalizeDesktopFeedbackStore(JSON.parse(raw));
  } catch {
    return {
      draft: { ...defaultDesktopFeedbackDraft },
      history: [] as DesktopFeedbackRecord[],
    } satisfies DesktopFeedbackStore;
  }
}

function parseDesktopFeedbackDraftRaw(raw: string | null) {
  if (!raw) {
    return { ...defaultDesktopFeedbackDraft };
  }

  try {
    return normalizeDesktopFeedbackDraft(
      JSON.parse(raw) as Partial<DesktopFeedbackDraft>,
    );
  } catch {
    return { ...defaultDesktopFeedbackDraft };
  }
}

function parseDesktopFeedbackHistoryRaw(raw: string | null) {
  if (!raw) {
    return [] as DesktopFeedbackRecord[];
  }

  try {
    return normalizeDesktopFeedbackHistory(
      JSON.parse(raw) as DesktopFeedbackRecord[],
    );
  } catch {
    return [] as DesktopFeedbackRecord[];
  }
}

function hasDesktopFeedbackDraftChanges(draft: DesktopFeedbackDraft) {
  return (
    draft.category !== defaultDesktopFeedbackDraft.category ||
    draft.priority !== defaultDesktopFeedbackDraft.priority ||
    draft.title.trim().length > 0 ||
    draft.detail.trim().length > 0 ||
    draft.reproduction.trim().length > 0 ||
    draft.expected.trim().length > 0 ||
    draft.includeSystemSnapshot !== defaultDesktopFeedbackDraft.includeSystemSnapshot
  );
}

function hasDesktopFeedbackStoreData(store: DesktopFeedbackStore) {
  return hasDesktopFeedbackDraftChanges(store.draft) || store.history.length > 0;
}

function getLatestDesktopFeedbackHistoryTimestamp(history: DesktopFeedbackRecord[]) {
  return history.reduce((latest, item) => {
    const submittedAt = Date.parse(item.submittedAt);
    return Number.isFinite(submittedAt) && submittedAt > latest
      ? submittedAt
      : latest;
  }, 0);
}

function readLocalDesktopFeedbackStore(): DesktopFeedbackStore {
  const storage = getStorage();
  if (!storage) {
    return {
      draft: { ...defaultDesktopFeedbackDraft },
      history: [] as DesktopFeedbackRecord[],
    };
  }

  const draftRaw = storage.getItem(DESKTOP_FEEDBACK_DRAFT_KEY);
  const historyRaw = storage.getItem(DESKTOP_FEEDBACK_HISTORY_KEY);

  return {
    draft: parseDesktopFeedbackDraftRaw(draftRaw),
    history: parseDesktopFeedbackHistoryRaw(historyRaw),
  };
}

function writeDesktopFeedbackStoreToLocal(
  store: DesktopFeedbackStore,
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return store;
  }

  if (hasDesktopFeedbackDraftChanges(store.draft)) {
    storage.setItem(DESKTOP_FEEDBACK_DRAFT_KEY, JSON.stringify(store.draft));
  } else {
    storage.removeItem(DESKTOP_FEEDBACK_DRAFT_KEY);
  }

  if (store.history.length) {
    storage.setItem(DESKTOP_FEEDBACK_HISTORY_KEY, JSON.stringify(store.history));
  } else {
    storage.removeItem(DESKTOP_FEEDBACK_HISTORY_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeDesktopFeedbackStoreWrite(store);
  }

  return store;
}

function queueNativeDesktopFeedbackStoreWrite(store: DesktopFeedbackStore) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(store);
  desktopFeedbackNativeWriteQueue = desktopFeedbackNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_feedback_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

export function readDesktopFeedbackDraft() {
  return readLocalDesktopFeedbackStore().draft;
}

export function writeDesktopFeedbackDraft(draft: DesktopFeedbackDraft) {
  const nextStore = {
    ...readLocalDesktopFeedbackStore(),
    draft: normalizeDesktopFeedbackDraft(draft),
  } satisfies DesktopFeedbackStore;
  writeDesktopFeedbackStoreToLocal(nextStore);
  return nextStore.draft;
}

export function clearDesktopFeedbackDraft() {
  const nextStore = {
    ...readLocalDesktopFeedbackStore(),
    draft: { ...defaultDesktopFeedbackDraft },
  } satisfies DesktopFeedbackStore;
  writeDesktopFeedbackStoreToLocal(nextStore);
}

export function readDesktopFeedbackHistory() {
  return readLocalDesktopFeedbackStore().history;
}

export async function hydrateDesktopFeedbackFromNative() {
  const localStore = readLocalDesktopFeedbackStore();
  if (!isDesktopRuntimeAvailable()) {
    return localStore;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_feedback_store");

    if (!result.exists) {
      if (hasDesktopFeedbackStoreData(localStore)) {
        queueNativeDesktopFeedbackStoreWrite(localStore);
      }
      return localStore;
    }

    const nativeStore = parseDesktopFeedbackStore(result.contents ?? null);
    const shouldPreferLocal =
      (!hasDesktopFeedbackStoreData(nativeStore) &&
        hasDesktopFeedbackStoreData(localStore)) ||
      (hasDesktopFeedbackDraftChanges(localStore.draft) &&
        !hasDesktopFeedbackDraftChanges(nativeStore.draft)) ||
      getLatestDesktopFeedbackHistoryTimestamp(localStore.history) >
        getLatestDesktopFeedbackHistoryTimestamp(nativeStore.history);

    if (shouldPreferLocal) {
      if (hasDesktopFeedbackStoreData(localStore)) {
        queueNativeDesktopFeedbackStoreWrite(localStore);
      }
      return localStore;
    }

    writeDesktopFeedbackStoreToLocal(nativeStore, {
      syncNative: false,
    });
    return nativeStore;
  } catch {
    return localStore;
  }
}

export function pushDesktopFeedbackRecord(
  input: Omit<DesktopFeedbackRecord, "id" | "submittedAt">,
) {
  const nextRecord: DesktopFeedbackRecord = {
    ...input,
    id: `desktop-feedback-${Date.now()}`,
    submittedAt: new Date().toISOString(),
  };
  const nextStore = {
    draft: readLocalDesktopFeedbackStore().draft,
    history: [nextRecord, ...readDesktopFeedbackHistory()].slice(
      0,
      MAX_DESKTOP_FEEDBACK_HISTORY,
    ),
  } satisfies DesktopFeedbackStore;

  writeDesktopFeedbackStoreToLocal(nextStore);
  return nextStore.history;
}

function isFeedbackCategory(value: unknown): value is DesktopFeedbackCategory {
  return (
    value === "bug" ||
    value === "interaction" ||
    value === "performance" ||
    value === "content" ||
    value === "feature"
  );
}

function isFeedbackPriority(value: unknown): value is DesktopFeedbackPriority {
  return value === "low" || value === "medium" || value === "high";
}
