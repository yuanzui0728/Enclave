import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileGroupRouteState = {
  highlightedMessageId?: string;
  returnPath?: string;
  returnHash?: string;
};

const HIGHLIGHT_HASH_PREFIX = "chat-message-";

// 走查 R2：原版只校验 "startsWith('/')"，协议无关 URL "//evil.com" 也满足这条；
// TanStack navigate({to:"//..."}) 虽然多数情况下匹不到任何已注册路由会落空，
// 但浏览器 history.replaceState/pushState 直接接受"//host"会让地址栏拼出
// "https://evil.com"——一次"返回上一页"把用户带到第三方站。同 favorites 的
// note-window-route-state R-sanitizeReturnTo 校验补 "!startsWith('//')"。
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

export function parseMobileGroupRouteState(hash: string): MobileGroupRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  if (
    !normalizedHash.includes("=") &&
    normalizedHash.startsWith(HIGHLIGHT_HASH_PREFIX)
  ) {
    return {
      highlightedMessageId: normalizedHash.slice(HIGHLIGHT_HASH_PREFIX.length),
    };
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    highlightedMessageId: params.get("message")?.trim() || undefined,
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildMobileGroupRouteHash(state: MobileGroupRouteState) {
  const highlightedMessageId = state.highlightedMessageId?.trim();
  const returnPath = normalizeReturnPath(state.returnPath);
  const returnHash = normalizeHash(state.returnHash);

  if (highlightedMessageId && !returnPath && !returnHash) {
    return `${HIGHLIGHT_HASH_PREFIX}${highlightedMessageId}`;
  }

  const params = new URLSearchParams();

  if (highlightedMessageId) {
    params.set("message", highlightedMessageId);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString() || undefined;
}
