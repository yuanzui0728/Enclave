import { isDesktopOnlyPath } from "../../lib/history-back";
import { parseDesktopFriendMomentsRouteState } from "./friend-moments-route-state";

export type MobileFriendMomentsRouteState = {
  returnPath?: string;
  returnHash?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
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

export function parseMobileFriendMomentsRouteState(
  hash: string,
): MobileFriendMomentsRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildMobileFriendMomentsRouteHash(
  state: MobileFriendMomentsRouteState,
) {
  const params = new URLSearchParams();
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

export function coerceToMobileFriendMomentsRouteHash(hash: string) {
  const mobileRouteHash = buildMobileFriendMomentsRouteHash(
    parseMobileFriendMomentsRouteState(hash),
  );
  if (mobileRouteHash) {
    return mobileRouteHash;
  }

  const desktopRouteState = parseDesktopFriendMomentsRouteState(hash);
  return buildMobileFriendMomentsRouteHash({
    returnPath: desktopRouteState.returnPath,
    returnHash: desktopRouteState.returnHash,
  });
}
