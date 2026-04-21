import type { DesktopFavoriteCategory } from "./favorites-storage";
import {
  parseDesktopNoteWindowRouteHash,
  type DesktopNoteWindowRouteState,
} from "./note-window-route-state";

export type DesktopFavoritesCategory = "all" | DesktopFavoriteCategory;

export type DesktopFavoritesWorkspaceRouteState = {
  category: DesktopFavoritesCategory;
  sourceId?: string;
};

export type DesktopFavoritesRouteState = {
  noteEditor: DesktopNoteWindowRouteState | null;
  workspace: DesktopFavoritesWorkspaceRouteState;
};

const DEFAULT_DESKTOP_FAVORITES_WORKSPACE_ROUTE_STATE: DesktopFavoritesWorkspaceRouteState =
  {
    category: "all",
  };

const desktopFavoritesCategories = new Set<DesktopFavoritesCategory>([
  "all",
  "messages",
  "notes",
  "contacts",
  "officialAccounts",
  "moments",
  "feed",
  "channels",
]);

function normalizeHash(hash: string) {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

function normalizeCategory(value?: string | null): DesktopFavoritesCategory {
  const nextValue = value?.trim();
  if (!nextValue || !desktopFavoritesCategories.has(nextValue as DesktopFavoritesCategory)) {
    return DEFAULT_DESKTOP_FAVORITES_WORKSPACE_ROUTE_STATE.category;
  }

  return nextValue as DesktopFavoritesCategory;
}

function parseLegacyDesktopNoteEditorRouteState(hash: string) {
  const normalizedHash = normalizeHash(hash).trim();
  if (!normalizedHash || normalizedHash.includes("=")) {
    return null;
  }

  return {
    draftId: normalizedHash,
    noteId: normalizedHash,
  } satisfies DesktopNoteWindowRouteState;
}

export function parseDesktopFavoritesRouteState(
  hash: string,
): DesktopFavoritesRouteState {
  const noteEditor =
    parseDesktopNoteWindowRouteHash(hash) ??
    parseLegacyDesktopNoteEditorRouteState(hash);
  if (noteEditor) {
    return {
      noteEditor,
      workspace: DEFAULT_DESKTOP_FAVORITES_WORKSPACE_ROUTE_STATE,
    };
  }

  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {
      noteEditor: null,
      workspace: DEFAULT_DESKTOP_FAVORITES_WORKSPACE_ROUTE_STATE,
    };
  }

  const params = new URLSearchParams(normalizedHash);
  const sourceId = params.get("sourceId")?.trim() || undefined;

  return {
    noteEditor: null,
    workspace: {
      category: normalizeCategory(params.get("category")),
      sourceId,
    },
  };
}

export function buildDesktopFavoritesWorkspaceRouteHash(
  state: DesktopFavoritesWorkspaceRouteState,
) {
  const params = new URLSearchParams();
  const category = normalizeCategory(state.category);
  const sourceId = state.sourceId?.trim() || undefined;

  if (category !== DEFAULT_DESKTOP_FAVORITES_WORKSPACE_ROUTE_STATE.category) {
    params.set("category", category);
  }

  if (sourceId) {
    params.set("sourceId", sourceId);
  }

  return params.toString() || undefined;
}
