import { isDesktopOnlyPath } from "../../lib/history-back";

export type FeedRouteState = {
  postId: string | null;
  returnHash?: string;
  returnPath?: string;
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

  if (nextValue === "/discover/feed") {
    return "/tabs/feed";
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

export function parseFeedRouteHash(hash: string): FeedRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {
      postId: null,
    };
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    postId: params.get("post")?.trim() || null,
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildFeedRouteHash(input?: {
  postId?: string | null;
  returnHash?: string | null;
  returnPath?: string | null;
}) {
  const params = new URLSearchParams();
  const postId = input?.postId?.trim() ?? "";
  const returnPath = normalizeReturnPath(input?.returnPath);
  const returnHash = normalizeHash(input?.returnHash);

  if (postId) {
    params.set("post", postId);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString() || undefined;
}
