import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileFriendRequestsRouteState = {
  returnPath?: string;
  returnHash?: string;
};

// 走查 R1：跟 mobile-add-friend-route-state / mobile-group-route-state 同款补
// "//" 协议无关 URL 校验。/friend-requests 是 + → 添加朋友 → "新的朋友" 二跳
// 子页，路径同样收 returnPath；原版只挡 startsWith("/")，"//evil.com" 也满足，
// 用户点"返回"会被 navigate 带去第三方站。
function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
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

export function parseMobileFriendRequestsRouteState(
  hash: string,
): MobileFriendRequestsRouteState {
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

export function buildMobileFriendRequestsRouteHash(
  state: MobileFriendRequestsRouteState,
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
