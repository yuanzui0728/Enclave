import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileContactDirectoryRouteState = {
  keyword: string;
  returnPath?: string;
  returnHash?: string;
};

const DEFAULT_MOBILE_CONTACT_DIRECTORY_ROUTE_STATE: MobileContactDirectoryRouteState =
  {
    keyword: "",
  };

// 走查新一轮 R1：跟姊妹 mobile-add-friend-route-state / mobile-friend-requests-
// route-state / character-detail-route-state 同口径补 "//" 协议无关 URL 校验。
// /contacts/starred 和 /contacts/tags 两个子页都吃这条路由状态当 returnPath；
// 原版只挡 startsWith("/")，攻击者构造 hash="returnPath=//evil.com/path" → 用户
// 在子页点"返回上一页"会被 TanStack Router 当成 //evil.com/path 跳到第三方站。
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

export function parseMobileContactDirectoryRouteState(
  hash: string,
): MobileContactDirectoryRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return DEFAULT_MOBILE_CONTACT_DIRECTORY_ROUTE_STATE;
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    keyword: params.get("q")?.trim() ?? "",
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildMobileContactDirectoryRouteHash(
  state: MobileContactDirectoryRouteState,
) {
  const params = new URLSearchParams();
  const keyword = state.keyword.trim();
  const returnPath = normalizeReturnPath(state.returnPath);

  if (keyword) {
    params.set("q", keyword);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  const returnHash = normalizeHash(state.returnHash);
  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString() || undefined;
}
