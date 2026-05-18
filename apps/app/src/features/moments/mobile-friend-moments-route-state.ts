import { isDesktopOnlyPath } from "../../lib/history-back";
import { parseDesktopFriendMomentsRouteState } from "./friend-moments-route-state";

export type MobileFriendMomentsRouteState = {
  returnPath?: string;
  returnHash?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  // 走查 R1：和 channels-route-state R4 (b169dd7a) / character-detail-route-state /
  // mobile-group-route-state 同款 open-redirect 修法。/friend-moments/:characterId
  // 的 handleBack / status 按钮 navigate({ to: safeReturnPath })，浏览器 history
  // replaceState 接受 "//host" 拼出 "https://evil.com" 跳走。攻击者诱导用户点
  // /friend-moments/X#returnPath=//evil.com 进入角色朋友圈后按返回跳第三方站。
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    nextValue.startsWith("//") ||
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
