import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileDiscoverToolRouteState = {
  returnPath?: string;
  returnHash?: string;
};

// 走查 R3：跟 mobile-add-friend-route-state / mobile-friend-requests-route-state
// / mobile-group-route-state 等 14 个同款补 "//" 协议无关 URL 校验。
// /discover/scene 与 /discover/encounter 都吃这个 returnPath，没补这一条时
// `#returnPath=//evil.com` 在 startsWith("/") 上是 true，"返回上一页" 按钮会把
// tanstack router 喂一个三方域。原版只挡 startsWith("/")。
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

export function parseMobileDiscoverToolRouteState(
  hash: string,
): MobileDiscoverToolRouteState {
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

export function buildMobileDiscoverToolRouteHash(
  state: MobileDiscoverToolRouteState,
) {
  const params = new URLSearchParams();
  const returnPath = normalizeReturnPath(state.returnPath);
  const returnHash = normalizeHash(state.returnHash);

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString() || undefined;
}
