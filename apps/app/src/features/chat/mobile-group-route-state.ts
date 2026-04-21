import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileGroupRouteState = {
  highlightedMessageId?: string;
  returnPath?: string;
  returnHash?: string;
};

const HIGHLIGHT_HASH_PREFIX = "chat-message-";

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
