const DESKTOP_CHAT_IMAGE_VIEWER_PATH = "/desktop/chat-image-viewer";
const STORAGE_KEY = "yinjie-desktop-chat-image-viewer-sessions";
const MAX_SESSION_COUNT = 12;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

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

  return {
    imageUrl,
    title,
    meta: meta || undefined,
    returnTo: returnTo || undefined,
    sessionId: sessionId || undefined,
    activeId: activeId || undefined,
  } satisfies DesktopChatImageViewerRouteState;
}

export function openDesktopChatImageViewerWindow(
  input: DesktopChatImageViewerRouteState & {
    items?: readonly DesktopChatImageViewerSessionItem[];
  },
) {
  if (typeof window === "undefined") {
    return false;
  }

  const sessionId = saveDesktopChatImageViewerSession(input.items);
  const routeHash = buildDesktopChatImageViewerRouteHash({
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
  const top = Math.max(24, Math.round((window.screen.availHeight - height) / 2));
  const features = [
    "noopener",
    "noreferrer",
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");

  return Boolean(
    window.open(
      `${DESKTOP_CHAT_IMAGE_VIEWER_PATH}#${routeHash}`,
      "_blank",
      features,
    ),
  );
}

export function readDesktopChatImageViewerSession(sessionId: string) {
  if (typeof window === "undefined") {
    return [] as DesktopChatImageViewerSessionItem[];
  }

  return readSessionStore()
    .find((session) => session.id === sessionId)
    ?.items.map((item) => ({ ...item })) ?? [];
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

  const sessions = readSessionStore();
  const sessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `session-${Date.now()}`;
  const nextSession: DesktopChatImageViewerStoredSession = {
    id: sessionId,
    updatedAt: new Date().toISOString(),
    items: normalizedItems,
  };
  const nextSessions = [nextSession, ...sessions].slice(0, MAX_SESSION_COUNT);

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSessions));
  return sessionId;
}

function readSessionStore() {
  if (typeof window === "undefined") {
    return [] as DesktopChatImageViewerStoredSession[];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshSessions));
    }

    return freshSessions;
  } catch {
    return [] as DesktopChatImageViewerStoredSession[];
  }
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
