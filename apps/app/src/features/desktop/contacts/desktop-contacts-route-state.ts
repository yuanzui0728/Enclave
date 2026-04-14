export type DesktopContactsPane =
  | "friend"
  | "world-character"
  | "new-friends"
  | "starred-friends"
  | "groups"
  | "tags"
  | "official-accounts";

export type DesktopContactsRouteState = {
  pane: DesktopContactsPane;
  characterId?: string;
  accountId?: string;
  articleId?: string;
  showWorldCharacters: boolean;
};

const DEFAULT_DESKTOP_CONTACTS_ROUTE_STATE: DesktopContactsRouteState = {
  pane: "friend",
  characterId: undefined,
  showWorldCharacters: false,
};

const desktopContactsPanes = new Set<DesktopContactsPane>([
  "friend",
  "world-character",
  "new-friends",
  "starred-friends",
  "groups",
  "tags",
  "official-accounts",
]);

export function parseDesktopContactsRouteState(
  hash: string,
): DesktopContactsRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return DEFAULT_DESKTOP_CONTACTS_ROUTE_STATE;
  }

  const params = new URLSearchParams(normalizedHash);
  const pane = params.get("pane")?.trim();
  const characterId = params.get("characterId")?.trim() || undefined;
  const accountId = params.get("accountId")?.trim() || undefined;
  const articleId = params.get("articleId")?.trim() || undefined;

  return {
    pane:
      pane && desktopContactsPanes.has(pane as DesktopContactsPane)
        ? (pane as DesktopContactsPane)
        : DEFAULT_DESKTOP_CONTACTS_ROUTE_STATE.pane,
    characterId,
    accountId,
    articleId,
    showWorldCharacters: params.get("world") === "1",
  };
}

export function buildDesktopContactsRouteHash(
  state: Partial<DesktopContactsRouteState>,
) {
  const params = new URLSearchParams();
  const pane =
    state.pane && desktopContactsPanes.has(state.pane)
      ? state.pane
      : DEFAULT_DESKTOP_CONTACTS_ROUTE_STATE.pane;

  if (pane !== DEFAULT_DESKTOP_CONTACTS_ROUTE_STATE.pane) {
    params.set("pane", pane);
  }

  if (state.characterId?.trim()) {
    params.set("characterId", state.characterId.trim());
  }

  if (state.accountId?.trim()) {
    params.set("accountId", state.accountId.trim());
  }

  if (state.articleId?.trim()) {
    params.set("articleId", state.articleId.trim());
  }

  if (state.showWorldCharacters) {
    params.set("world", "1");
  }

  return params.toString() || undefined;
}
