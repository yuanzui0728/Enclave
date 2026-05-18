import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileAddFriendRouteState = {
  returnPath?: string;
  returnHash?: string;
  keyword?: string;
};

// 走查 R1：跟 mobile-group-route-state aec190f5 / create-group-route-state 同款
// 补 "//" 协议无关 URL 校验。原版只校验 startsWith("/")，"//evil.com" 也满足
// 这条；用户被诱导打开 /add-friend#returnPath=//evil.com → 顶部"返回"按钮调
// navigate({to:"//evil.com"}) → 浏览器 history.pushState 接受 "//host" 后拼出
// "https://evil.com" 把用户带到第三方站。同理 sendSheet 关闭走 navigate 的链
// 路也会被牵走。
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

export function parseMobileAddFriendRouteState(
  hash: string,
): MobileAddFriendRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));
  const keyword = params.get("q")?.trim() || undefined;

  return {
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
    keyword,
  };
}

export function buildMobileAddFriendRouteHash(
  state: MobileAddFriendRouteState,
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

  const keyword = state.keyword?.trim();
  if (keyword) {
    params.set("q", keyword);
  }

  return params.toString() || undefined;
}
