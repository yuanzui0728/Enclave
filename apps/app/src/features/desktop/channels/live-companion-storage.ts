export type LiveDraft = {
  title: string;
  topic: string;
  coverHook: string;
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

const LIVE_DRAFT_STORAGE_KEY = "yinjie-desktop-live-companion-draft";
const LIVE_HISTORY_STORAGE_KEY = "yinjie-desktop-live-companion-history";
const MAX_LIVE_HISTORY = 12;

export const defaultLiveDraft: LiveDraft = {
  title: "",
  topic: "",
  coverHook: "",
  quality: "hd",
  mode: "solo",
  syncComments: true,
  autoClip: true,
};

export function readLiveDraft() {
  if (typeof window === "undefined") {
    return { ...defaultLiveDraft };
  }

  const raw = window.localStorage.getItem(LIVE_DRAFT_STORAGE_KEY);
  if (!raw) {
    return { ...defaultLiveDraft };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LiveDraft>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      topic: typeof parsed.topic === "string" ? parsed.topic : "",
      coverHook: typeof parsed.coverHook === "string" ? parsed.coverHook : "",
      quality: isLiveQuality(parsed.quality) ? parsed.quality : "hd",
      mode: isLiveMode(parsed.mode) ? parsed.mode : "solo",
      syncComments:
        typeof parsed.syncComments === "boolean"
          ? parsed.syncComments
          : defaultLiveDraft.syncComments,
      autoClip:
        typeof parsed.autoClip === "boolean"
          ? parsed.autoClip
          : defaultLiveDraft.autoClip,
    };
  } catch {
    return { ...defaultLiveDraft };
  }
}

export function writeLiveDraft(draft: LiveDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LIVE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function readLiveHistory() {
  if (typeof window === "undefined") {
    return [] as LiveSessionRecord[];
  }

  const raw = window.localStorage.getItem(LIVE_HISTORY_STORAGE_KEY);
  if (!raw) {
    return [] as LiveSessionRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as LiveSessionRecord[];
    if (!Array.isArray(parsed)) {
      return [] as LiveSessionRecord[];
    }

    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item.title === "string" &&
        typeof item.topic === "string" &&
        isLiveQuality(item.quality) &&
        isLiveMode(item.mode) &&
        typeof item.startedAt === "string" &&
        (item.endedAt === undefined || typeof item.endedAt === "string") &&
        (item.status === "live" || item.status === "ended"),
    );
  } catch {
    return [] as LiveSessionRecord[];
  }
}

export function writeLiveHistory(history: LiveSessionRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    LIVE_HISTORY_STORAGE_KEY,
    JSON.stringify(history),
  );
}

export function startLocalLiveSession(input: {
  draft: LiveDraft;
  previous: LiveSessionRecord[];
}) {
  const nextSession: LiveSessionRecord = {
    id: `live-session-${Date.now()}`,
    title: input.draft.title.trim(),
    topic: input.draft.topic.trim(),
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
