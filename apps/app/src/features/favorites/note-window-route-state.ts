const DESKTOP_NOTE_WINDOW_PATH = "/desktop/note-window";

export type DesktopNoteWindowRouteState = {
  draftId: string;
  noteId?: string;
  returnTo?: string;
};

export function buildDesktopNoteWindowRouteHash(
  input: DesktopNoteWindowRouteState,
) {
  const params = new URLSearchParams();
  params.set("draftId", input.draftId.trim());

  if (input.noteId?.trim()) {
    params.set("noteId", input.noteId.trim());
  }

  if (input.returnTo?.trim()) {
    params.set("returnTo", input.returnTo.trim());
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
  const returnTo = params.get("returnTo")?.trim() || undefined;

  return {
    draftId,
    noteId,
    returnTo,
  } satisfies DesktopNoteWindowRouteState;
}

export function parseDesktopNoteEditorRouteHash(hash: string) {
  const routeState = parseDesktopNoteWindowRouteHash(hash);
  if (routeState) {
    return routeState;
  }

  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash || normalizedHash.includes("=")) {
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
