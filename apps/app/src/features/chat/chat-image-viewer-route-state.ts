import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  buildDesktopStandaloneWindowLabel,
  openBrowserStandaloneWindow,
  openDesktopStandaloneWindow,
} from "../../runtime/desktop-windowing";

const DESKTOP_CHAT_IMAGE_VIEWER_PATH = "/desktop/chat-image-viewer";
const STORAGE_KEY = "yinjie-desktop-chat-image-viewer-sessions";
const MAX_SESSION_COUNT = 12;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
let desktopChatImageViewerSessionsNativeWriteQueue: Promise<void> =
  Promise.resolve();

export type DesktopChatImageViewerSessionItem = {
  id: string;
  imageUrl: string;
  title: string;
  meta?: string;
  returnTo?: string;
};

export type DesktopChatImageViewerRouteState = {
  imageUrl: string;
  title: string;
  meta?: string;
  returnTo?: string;
  sessionId?: string;
  activeId?: string;
  printToken?: string;
};

export function buildDesktopChatImageViewerRouteHash(
  input: DesktopChatImageViewerRouteState,
) {
  const params = new URLSearchParams();
  params.set("imageUrl", input.imageUrl);
  params.set("title", input.title.trim() || "图片");

  if (input.meta?.trim()) {
    params.set("meta", input.meta.trim());
  }

  if (input.returnTo?.trim()) {
    params.set("returnTo", input.returnTo.trim());
  }

  if (input.sessionId?.trim()) {
    params.set("session", input.sessionId.trim());
  }

  if (input.activeId?.trim()) {
    params.set("active", input.activeId.trim());
  }

  if (input.printToken?.trim()) {
    params.set("print", input.printToken.trim());
  }

  return params.toString();
}

export function buildDesktopChatImageViewerPath(
  input: DesktopChatImageViewerRouteState,
) {
  const hash = buildDesktopChatImageViewerRouteHash(input);
  return hash
    ? `${DESKTOP_CHAT_IMAGE_VIEWER_PATH}#${hash}`
    : DESKTOP_CHAT_IMAGE_VIEWER_PATH;
}

export function parseDesktopChatImageViewerRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  const imageUrl = params.get("imageUrl")?.trim();
  const title = params.get("title")?.trim();
  if (!imageUrl || !title) {
    return null;
  }

  const meta = params.get("meta")?.trim();
  const returnTo = params.get("returnTo")?.trim();
  const sessionId = params.get("session")?.trim();
  const activeId = params.get("active")?.trim();
  const printToken = params.get("print")?.trim();

  return {
    imageUrl,
    title,
    meta: meta || undefined,
    returnTo: returnTo || undefined,
    sessionId: sessionId || undefined,
    activeId: activeId || undefined,
    printToken: printToken || undefined,
  } satisfies DesktopChatImageViewerRouteState;
}

function hashDesktopWindowLabel(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function buildDesktopChatImageViewerWindowLabel(
  input: DesktopChatImageViewerRouteState,
) {
  const identifier =
    input.sessionId?.trim() ||
    input.activeId?.trim() ||
    hashDesktopWindowLabel(input.imageUrl);

  return buildDesktopStandaloneWindowLabel(
    "desktop-chat-image-viewer",
    identifier,
  );
}

export async function openDesktopChatImageViewerWindow(
  input: DesktopChatImageViewerRouteState & {
    items?: readonly DesktopChatImageViewerSessionItem[];
    autoPrint?: boolean;
  },
) {
  if (typeof window === "undefined") {
    return false;
  }

  const sessionId = saveDesktopChatImageViewerSession(input.items);
  const printToken = input.autoPrint
    ? typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}`
    : undefined;
  const routeHash = buildDesktopChatImageViewerRouteHash({
    imageUrl: input.imageUrl,
    title: input.title,
    meta: input.meta,
    returnTo: input.returnTo,
    sessionId: sessionId ?? undefined,
    activeId: sessionId ? input.activeId?.trim() || undefined : undefined,
    printToken,
  });
  const routePath = `${DESKTOP_CHAT_IMAGE_VIEWER_PATH}#${routeHash}`;
  const windowLabel = buildDesktopChatImageViewerWindowLabel({
    imageUrl: input.imageUrl,
    title: input.title,
    meta: input.meta,
    returnTo: input.returnTo,
    sessionId: sessionId ?? undefined,
    activeId: sessionId ? input.activeId?.trim() || undefined : undefined,
  });

  const width = Math.max(
    1120,
    Math.min(window.screen.availWidth - 96, 1320),
  );
  const height = Math.max(
    760,
    Math.min(window.screen.availHeight - 96, 920),
  );
  const left = Math.max(24, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(
    24,
    Math.round((window.screen.availHeight - height) / 2),
  );
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");

  if (!isDesktopRuntimeAvailable()) {
    return openBrowserStandaloneWindow({
      label: windowLabel,
      url: routePath,
      features,
    });
  }

  if (sessionId) {
    await desktopChatImageViewerSessionsNativeWriteQueue.catch(
      () => undefined,
    );
  }

  if (
    await openDesktopStandaloneWindow({
      label: windowLabel,
      url: routePath,
      title: input.title.trim() || "图片",
      width,
      height,
      minWidth: 1120,
      minHeight: 760,
    })
  ) {
    return true;
  }

  return openBrowserStandaloneWindow({
    label: windowLabel,
    url: routePath,
    features,
  });
}

export function readDesktopChatImageViewerSession(sessionId: string) {
  if (typeof window === "undefined") {
    return [] as DesktopChatImageViewerSessionItem[];
  }

  return readLocalSessionStore()
    .find((session) => session.id === sessionId)
    ?.items.map((item) => ({ ...item })) ?? [];
}

export async function hydrateDesktopChatImageViewerSessionsFromNative() {
  const localSessions = readLocalSessionStore();
  if (!isDesktopRuntimeAvailable()) {
    return localSessions;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_chat_image_viewer_sessions_store");

    if (!result.exists) {
      if (localSessions.length) {
        queueNativeDesktopChatImageViewerSessionsWrite(localSessions);
      }
      return localSessions;
    }

    const nativeSessions = parseStoredSessions(result.contents ?? null);
    if (
      getLatestSessionUpdateTime(localSessions) >
      getLatestSessionUpdateTime(nativeSessions)
    ) {
      if (localSessions.length) {
        queueNativeDesktopChatImageViewerSessionsWrite(localSessions);
      }
      return localSessions;
    }

    writeLocalSessionStore(nativeSessions, {
      syncNative: false,
    });
    return nativeSessions;
  } catch {
    return localSessions;
  }
}

type DesktopChatImageViewerStoredSession = {
  id: string;
  updatedAt: string;
  items: DesktopChatImageViewerSessionItem[];
};

function saveDesktopChatImageViewerSession(
  items?: readonly DesktopChatImageViewerSessionItem[],
) {
  if (typeof window === "undefined") {
    return null;
  }

  const normalizedItems = normalizeSessionItems(items);
  if (normalizedItems.length <= 1) {
    return null;
  }

  const sessions = readLocalSessionStore();
  const existingSession = sessions.find((session) =>
    hasSameDesktopChatImageViewerSessionShape(session.items, normalizedItems),
  );
  const nextSession: DesktopChatImageViewerStoredSession = {
    id:
      existingSession?.id ??
      (typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `session-${Date.now()}`),
    updatedAt: new Date().toISOString(),
    items: normalizedItems,
  };
  const nextSessions = [
    nextSession,
    ...sessions.filter((session) => session.id !== nextSession.id),
  ].slice(0, MAX_SESSION_COUNT);

  writeLocalSessionStore(nextSessions);
  return nextSession.id;
}

function readLocalSessionStore() {
  if (typeof window === "undefined") {
    return [] as DesktopChatImageViewerStoredSession[];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  return parseStoredSessions(raw);
}

function writeLocalSessionStore(
  sessions: DesktopChatImageViewerStoredSession[],
  options?: {
    syncNative?: boolean;
  },
) {
  if (typeof window === "undefined") {
    return sessions;
  }

  if (sessions.length) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeDesktopChatImageViewerSessionsWrite(sessions);
  }

  return sessions;
}

function queueNativeDesktopChatImageViewerSessionsWrite(
  sessions: DesktopChatImageViewerStoredSession[],
) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(sessions);
  desktopChatImageViewerSessionsNativeWriteQueue =
    desktopChatImageViewerSessionsNativeWriteQueue
      .catch(() => undefined)
      .then(async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_write_chat_image_viewer_sessions_store", {
          contents,
        });
      })
      .catch(() => undefined);
}

function parseStoredSessions(raw: string | null | undefined) {
  if (!raw) {
    return [] as DesktopChatImageViewerStoredSession[];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const sessions = normalizeStoredSessions(parsed);
    const now = Date.now();
    const freshSessions = sessions.filter((session) => {
      const updatedAt = Date.parse(session.updatedAt);
      return Number.isFinite(updatedAt) && now - updatedAt <= SESSION_TTL_MS;
    });

    if (freshSessions.length !== sessions.length) {
      writeLocalSessionStore(freshSessions, {
        syncNative: false,
      });
    }

    return freshSessions;
  } catch {
    return [] as DesktopChatImageViewerStoredSession[];
  }
}

function getLatestSessionUpdateTime(
  sessions: DesktopChatImageViewerStoredSession[],
) {
  return sessions.reduce((latest, session) => {
    const updatedAt = Date.parse(session.updatedAt);
    return Number.isFinite(updatedAt) && updatedAt > latest ? updatedAt : latest;
  }, 0);
}

function normalizeStoredSessions(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as DesktopChatImageViewerStoredSession[];
  }

  return input
    .filter(
      (item): item is DesktopChatImageViewerStoredSession =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.updatedAt === "string" &&
        Array.isArray(item.items),
    )
    .map((session) => ({
      id: session.id,
      updatedAt: session.updatedAt,
      items: normalizeSessionItems(session.items),
    }))
    .filter((session) => session.items.length > 0);
}

function normalizeSessionItems(input: unknown) {
  if (!Array.isArray(input)) {
    return [] as DesktopChatImageViewerSessionItem[];
  }

  const seenIds = new Set<string>();
  return input
    .filter(
      (item): item is DesktopChatImageViewerSessionItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.imageUrl === "string" &&
        typeof item.title === "string",
    )
    .filter((item) => {
      if (!item.id.trim() || !item.imageUrl.trim() || !item.title.trim()) {
        return false;
      }

      if (seenIds.has(item.id)) {
        return false;
      }

      seenIds.add(item.id);
      return true;
    })
    .map((item) => ({
      id: item.id.trim(),
      imageUrl: item.imageUrl.trim(),
      title: item.title.trim(),
      meta: item.meta?.trim() || undefined,
      returnTo: item.returnTo?.trim() || undefined,
    }));
}

function hasSameDesktopChatImageViewerSessionShape(
  left: readonly DesktopChatImageViewerSessionItem[],
  right: readonly DesktopChatImageViewerSessionItem[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const other = right[index];
    return (
      other &&
      item.id === other.id &&
      item.imageUrl === other.imageUrl
    );
  });
}
