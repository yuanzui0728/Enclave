const DESKTOP_NOTE_WINDOW_PATH = "/desktop/note-window";

export type DesktopNoteWindowRouteState = {
  draftId: string;
  noteId?: string;
  returnTo?: string;
};

// returnTo 直接喂给 navigate({ to }) / history.back()。攻击 URL
// /tabs/favorites#draftId=x&returnTo=javascript:alert(1) 用户点"返回"时
// 走 fallback 分支会触发 JS。严格只放过应用内的绝对路径——必须以"/"打头，
// 且不能是协议无关 URL "//evil.com"。
function sanitizeReturnTo(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return undefined;
  }
  return normalized;
}

export function buildDesktopNoteWindowRouteHash(
  input: DesktopNoteWindowRouteState,
) {
  const params = new URLSearchParams();
  params.set("draftId", input.draftId.trim());

  if (input.noteId?.trim()) {
    params.set("noteId", input.noteId.trim());
  }

  const returnTo = sanitizeReturnTo(input.returnTo);
  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  return params.toString();
}

export function parseDesktopNoteWindowRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  const draftId = params.get("draftId")?.trim();
  if (!draftId) {
    return null;
  }

  const noteId = params.get("noteId")?.trim() || undefined;
  const returnTo = sanitizeReturnTo(params.get("returnTo"));

  return {
    draftId,
    noteId,
    returnTo,
  } satisfies DesktopNoteWindowRouteState;
}

// 跟 favorites-route-state.ts 的 parseLegacyDesktopNoteEditorRouteState 保持一致：
// 老链是 #<UUIDv4>。之前任何不含 "=" 的 hash 都当 noteId，结果 #foo 也会跑去拉
// "foo" 笔记。严格匹配 UUID 才走 legacy。
const LEGACY_DESKTOP_NOTE_HASH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseDesktopNoteEditorRouteHash(hash: string) {
  const routeState = parseDesktopNoteWindowRouteHash(hash);
  if (routeState) {
    return routeState;
  }

  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (
    !normalizedHash ||
    normalizedHash.includes("=") ||
    !LEGACY_DESKTOP_NOTE_HASH_PATTERN.test(normalizedHash)
  ) {
    return null;
  }

  return {
    draftId: normalizedHash,
    noteId: normalizedHash,
    returnTo: undefined,
  } satisfies DesktopNoteWindowRouteState;
}

export function buildDesktopNoteWindowPath(input: DesktopNoteWindowRouteState) {
  const hash = buildDesktopNoteWindowRouteHash(input);
  return hash
    ? `${DESKTOP_NOTE_WINDOW_PATH}#${hash}`
    : DESKTOP_NOTE_WINDOW_PATH;
}
