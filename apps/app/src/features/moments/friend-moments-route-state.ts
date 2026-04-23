import { buildDesktopContactsRouteHash } from "../contacts/contacts-route-state";

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
  returnPath?: string;
  returnHash?: string;
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

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue || !nextValue.startsWith("/")) {
    return undefined;
  }

  if (nextValue === "/moments" || nextValue === "/discover/moments") {
    return "/tabs/moments";
  }

  if (nextValue === "/contacts/starred" || nextValue === "/contacts/tags") {
    return "/tabs/contacts";
  }

  return nextValue;
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

export function parseDesktopFriendMomentsRouteState(
  hash: string,
): DesktopFriendMomentsRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const momentId = params.get("moment")?.trim();
  const source = params.get("source")?.trim();
  const rawReturnPath = params.get("returnPath");
  const returnPath = normalizeReturnPath(rawReturnPath);
  const explicitReturnHash = normalizeHash(params.get("returnHash"));
  const defaultLegacyContactsReturnHash =
    rawReturnPath === "/contacts/starred"
      ? buildDesktopContactsRouteHash({
          pane: "starred-friends",
          showWorldCharacters: false,
        })
      : rawReturnPath === "/contacts/tags"
        ? buildDesktopContactsRouteHash({
            pane: "tags",
            showWorldCharacters: false,
          })
        : undefined;
  const returnHash =
    returnPath && (explicitReturnHash ?? defaultLegacyContactsReturnHash)
      ? explicitReturnHash ?? defaultLegacyContactsReturnHash
      : undefined;

  return {
    ...(momentId ? { momentId } : {}),
    ...(source && desktopFriendMomentsRouteSources.has(source as DesktopFriendMomentsRouteSource)
      ? { source: source as DesktopFriendMomentsRouteSource }
      : {}),
    ...(returnPath ? { returnPath } : {}),
    ...(returnHash ? { returnHash } : {}),
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

  const returnPath = normalizeReturnPath(state.returnPath);
  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  const returnHash = normalizeHash(state.returnHash);
  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
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
