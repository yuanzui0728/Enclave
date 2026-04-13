import type { FavoriteNoteAsset } from "@yinjie/contracts";

export type DesktopNoteDraftRecord = {
  draftId: string;
  noteId?: string;
  contentHtml: string;
  contentText: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  updatedAt: string;
};

const DESKTOP_NOTE_DRAFTS_STORAGE_KEY = "yinjie-desktop-note-drafts-v2";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function buildDraftId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `note-draft-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeFavoriteNoteAsset(
  value: FavoriteNoteAsset,
): FavoriteNoteAsset {
  return {
    id: value.id,
    kind: value.kind,
    fileName: value.fileName,
    url: value.url,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    width: value.width,
    height: value.height,
  };
}

function normalizeDesktopNoteDraftRecord(
  value: Partial<DesktopNoteDraftRecord>,
): DesktopNoteDraftRecord | null {
  if (typeof value.draftId !== "string" || !value.draftId.trim()) {
    return null;
  }

  return {
    draftId: value.draftId.trim(),
    noteId: value.noteId?.trim() || undefined,
    contentHtml: typeof value.contentHtml === "string" ? value.contentHtml : "",
    contentText: typeof value.contentText === "string" ? value.contentText : "",
    tags: Array.isArray(value.tags)
      ? value.tags
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    assets: Array.isArray(value.assets)
      ? value.assets
          .filter(
            (item): item is FavoriteNoteAsset =>
              Boolean(item) &&
              typeof item.id === "string" &&
              (item.kind === "image" || item.kind === "file") &&
              typeof item.fileName === "string" &&
              typeof item.url === "string",
          )
          .map((item) => normalizeFavoriteNoteAsset(item))
      : [],
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

function parseDesktopNoteDraftRecords(raw: string | null | undefined) {
  if (!raw) {
    return [] as DesktopNoteDraftRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DesktopNoteDraftRecord>[];
    if (!Array.isArray(parsed)) {
      return [] as DesktopNoteDraftRecord[];
    }

    return parsed
      .map((item) => normalizeDesktopNoteDraftRecord(item))
      .filter((item): item is DesktopNoteDraftRecord => Boolean(item))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [] as DesktopNoteDraftRecord[];
  }
}

function writeDesktopNoteDraftRecords(records: DesktopNoteDraftRecord[]) {
  const storage = getStorage();
  if (!storage) {
    return records;
  }

  if (records.length) {
    storage.setItem(DESKTOP_NOTE_DRAFTS_STORAGE_KEY, JSON.stringify(records));
  } else {
    storage.removeItem(DESKTOP_NOTE_DRAFTS_STORAGE_KEY);
  }

  return records;
}

export function readDesktopNoteDrafts() {
  const storage = getStorage();
  if (!storage) {
    return [] as DesktopNoteDraftRecord[];
  }

  return parseDesktopNoteDraftRecords(
    storage.getItem(DESKTOP_NOTE_DRAFTS_STORAGE_KEY),
  );
}

export function readDesktopNoteDraft(draftId: string) {
  const normalizedDraftId = draftId.trim();
  if (!normalizedDraftId) {
    return null;
  }

  return (
    readDesktopNoteDrafts().find(
      (item) => item.draftId === normalizedDraftId,
    ) ?? null
  );
}

export function readDesktopNoteDraftByNoteId(noteId: string) {
  const normalizedNoteId = noteId.trim();
  if (!normalizedNoteId) {
    return null;
  }

  return (
    readDesktopNoteDrafts().find((item) => item.noteId === normalizedNoteId) ??
    null
  );
}

export function createDesktopNoteDraft(
  input?: Partial<Omit<DesktopNoteDraftRecord, "draftId" | "updatedAt">> & {
    draftId?: string;
  },
) {
  const existing =
    (input?.noteId ? readDesktopNoteDraftByNoteId(input.noteId) : null) ??
    (input?.draftId ? readDesktopNoteDraft(input.draftId) : null);
  if (existing) {
    return existing;
  }

  const record: DesktopNoteDraftRecord = {
    draftId: input?.draftId?.trim() || buildDraftId(),
    noteId: input?.noteId?.trim() || undefined,
    contentHtml: input?.contentHtml ?? "",
    contentText: input?.contentText ?? "",
    tags:
      input?.tags
        ?.map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8) ?? [],
    assets:
      input?.assets?.map((item) => normalizeFavoriteNoteAsset(item)) ?? [],
    updatedAt: new Date().toISOString(),
  };

  writeDesktopNoteDraftRecords([record, ...readDesktopNoteDrafts()]);
  return record;
}

export function saveDesktopNoteDraft(record: DesktopNoteDraftRecord) {
  const normalizedRecord = normalizeDesktopNoteDraftRecord(record);
  if (!normalizedRecord) {
    return readDesktopNoteDrafts();
  }

  const nextRecords = [
    {
      ...normalizedRecord,
      updatedAt: new Date().toISOString(),
    },
    ...readDesktopNoteDrafts().filter(
      (item) => item.draftId !== normalizedRecord.draftId,
    ),
  ];

  return writeDesktopNoteDraftRecords(nextRecords);
}

export function clearDesktopNoteDraft(draftId: string) {
  const normalizedDraftId = draftId.trim();
  if (!normalizedDraftId) {
    return readDesktopNoteDrafts();
  }

  const nextRecords = readDesktopNoteDrafts().filter(
    (item) => item.draftId !== normalizedDraftId,
  );
  return writeDesktopNoteDraftRecords(nextRecords);
}
