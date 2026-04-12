import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type DesktopNoteRecord = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const DESKTOP_NOTES_STORAGE_KEY = "yinjie-desktop-notes";
const UNTITLED_NOTE_TITLE = "无标题笔记";
let desktopNotesNativeWriteQueue: Promise<void> = Promise.resolve();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function buildNoteId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `note-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeContent(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function buildNotePresentation(content: string) {
  const normalized = normalizeContent(content);
  const trimmedLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const compactText = normalized.replace(/\s+/g, " ").trim();

  return {
    title: trimmedLines[0]?.slice(0, 28) || UNTITLED_NOTE_TITLE,
    excerpt: compactText
      ? compactText.slice(0, compactText.length > 72 ? 72 : compactText.length)
      : "点击右侧开始记录这条笔记。",
  };
}

function normalizeDesktopNoteRecords(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as DesktopNoteRecord[];
  }

  return value
    .filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.content === "string" &&
        typeof item?.createdAt === "string" &&
        typeof item?.updatedAt === "string",
    )
    .map((item) => {
      const normalizedContent = normalizeContent(item.content);
      const presentation = buildNotePresentation(normalizedContent);
      return {
        id: item.id,
        content: normalizedContent,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        title: presentation.title,
        excerpt: presentation.excerpt,
      } satisfies DesktopNoteRecord;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function parseDesktopNoteRecords(raw: string | null | undefined) {
  if (!raw) {
    return [] as DesktopNoteRecord[];
  }

  try {
    return normalizeDesktopNoteRecords(JSON.parse(raw));
  } catch {
    return [] as DesktopNoteRecord[];
  }
}

function queueNativeDesktopNotesWrite(notes: DesktopNoteRecord[]) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(notes);
  desktopNotesNativeWriteQueue = desktopNotesNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_notes_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeDesktopNotes(
  notes: DesktopNoteRecord[],
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(DESKTOP_NOTES_STORAGE_KEY, JSON.stringify(notes));
  if (options?.syncNative !== false) {
    queueNativeDesktopNotesWrite(notes);
  }
}

function getLatestDesktopNoteUpdateTime(notes: DesktopNoteRecord[]) {
  return notes.reduce((latest, note) => {
    const updatedAt = Date.parse(note.updatedAt);
    return Number.isFinite(updatedAt) && updatedAt > latest ? updatedAt : latest;
  }, 0);
}

export function readDesktopNotes() {
  const storage = getStorage();
  if (!storage) {
    return [] as DesktopNoteRecord[];
  }

  const raw = storage.getItem(DESKTOP_NOTES_STORAGE_KEY);
  return parseDesktopNoteRecords(raw);
}

export async function hydrateDesktopNotesFromNative() {
  const localNotes = readDesktopNotes();
  if (!isDesktopRuntimeAvailable()) {
    return localNotes;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_notes_store");

    if (!result.exists) {
      if (localNotes.length) {
        queueNativeDesktopNotesWrite(localNotes);
      }
      return localNotes;
    }

    const nativeNotes = parseDesktopNoteRecords(result.contents ?? null);
    if (
      getLatestDesktopNoteUpdateTime(localNotes) >
      getLatestDesktopNoteUpdateTime(nativeNotes)
    ) {
      if (localNotes.length) {
        queueNativeDesktopNotesWrite(localNotes);
      }
      return localNotes;
    }

    writeDesktopNotes(nativeNotes, {
      syncNative: false,
    });
    return nativeNotes;
  } catch {
    return localNotes;
  }
}

export function createDesktopNote(initialContent = "") {
  const timestamp = new Date().toISOString();
  const presentation = buildNotePresentation(initialContent);
  const note: DesktopNoteRecord = {
    id: buildNoteId(),
    title: presentation.title,
    excerpt: presentation.excerpt,
    content: normalizeContent(initialContent),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const nextNotes = [note, ...readDesktopNotes()];

  writeDesktopNotes(nextNotes);
  return note;
}

export function updateDesktopNote(id: string, content: string) {
  const normalizedContent = normalizeContent(content);
  const presentation = buildNotePresentation(normalizedContent);
  const nextNotes = readDesktopNotes().map((item) =>
    item.id === id
      ? {
          ...item,
          content: normalizedContent,
          title: presentation.title,
          excerpt: presentation.excerpt,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  writeDesktopNotes(nextNotes);
  return nextNotes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function deleteDesktopNote(id: string) {
  const nextNotes = readDesktopNotes().filter((item) => item.id !== id);
  writeDesktopNotes(nextNotes);
  return nextNotes;
}
