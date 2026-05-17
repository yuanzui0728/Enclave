import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileChatRouteState = {
  highlightedMessageId?: string;
  returnPath?: string;
  returnHash?: string;
};

const HIGHLIGHT_HASH_PREFIX = "chat-message-";

// 走查新一轮 R6：和姊妹文件 mobile-group-route-state / mobile-group-call-route-state
// （commit aec190f52 / f1f03ae0d）同款补 "//evil.com" 协议无关 URL 拦截——本
// 文件对单聊路由 (/chat/$conversationId#returnPath=...) 起同样作用：returnPath
// 会被 chat-room-page 的 navigateToRouteStateReturn / onBack 当作 navigate
// target 直接 navigate({ to })，浏览器 history.replaceState 接受 "//host" 会拼成
// "https://evil.com"。compile-time 没有 cross-file 强制，单聊这条同款漏拦
// 跟群聊一样要单独补一遍。
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

export function parseMobileChatRouteState(hash: string): MobileChatRouteState {
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

export function buildMobileChatRouteHash(state: MobileChatRouteState) {
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
