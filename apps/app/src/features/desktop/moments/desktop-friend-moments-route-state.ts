const DESKTOP_FRIEND_MOMENTS_BASE_PATH = "/desktop/friend-moments";

export type DesktopFriendMomentsRouteSource =
  | "contacts"
  | "character-detail"
  | "chat-details"
  | "avatar-popover"
  | "starred-friends"
  | "tags"
  | "moments";

export type DesktopFriendMomentsRouteState = {
  momentId?: string;
  source?: DesktopFriendMomentsRouteSource;
};

const desktopFriendMomentsRouteSources = new Set<DesktopFriendMomentsRouteSource>(
  [
    "contacts",
    "character-detail",
    "chat-details",
    "avatar-popover",
    "starred-friends",
    "tags",
    "moments",
  ],
);

export function parseDesktopFriendMomentsRouteState(
  hash: string,
): DesktopFriendMomentsRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const momentId = params.get("moment")?.trim();
  const source = params.get("source")?.trim();

  return {
    ...(momentId ? { momentId } : {}),
    ...(source && desktopFriendMomentsRouteSources.has(source as DesktopFriendMomentsRouteSource)
      ? { source: source as DesktopFriendMomentsRouteSource }
      : {}),
  };
}

export function buildDesktopFriendMomentsRouteHash(
  state: DesktopFriendMomentsRouteState,
) {
  const params = new URLSearchParams();

  if (state.momentId?.trim()) {
    params.set("moment", state.momentId.trim());
  }

  if (state.source?.trim()) {
    params.set("source", state.source.trim());
  }

  return params.toString() || undefined;
}

export function buildDesktopFriendMomentsPath(
  characterId: string,
  state: DesktopFriendMomentsRouteState = {},
) {
  const normalizedCharacterId = characterId.trim();
  const hash = buildDesktopFriendMomentsRouteHash(state);
  const pathname = normalizedCharacterId
    ? `${DESKTOP_FRIEND_MOMENTS_BASE_PATH}/${encodeURIComponent(
        normalizedCharacterId,
      )}`
    : DESKTOP_FRIEND_MOMENTS_BASE_PATH;

  return hash ? `${pathname}#${hash}` : pathname;
}
