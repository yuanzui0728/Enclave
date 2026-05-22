import { isDesktopOnlyPath } from "../../lib/history-back";
import { normalizePathname } from "../../lib/normalize-pathname";

export type FeedRouteState = {
  postId: string | null;
  returnHash?: string;
  returnPath?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  // 走查移动端发现-广场动态走查/Round 1：和 channels-route-state R4 (b169dd7a) /
  // moments-route-state R1 / mobile-moments-publish-route-state R1 同款 open-redirect
  // 修法。`/tabs/feed#post=X&returnPath=//evil.com` 这类 hash 落到本页时，
  // 上层「返回上一页」/ handleStatusBack / navigateToRouteStateReturn 走的是
  // navigate({ to: safeReturnPath })，TanStack Router 把 "//evil.com" 当成
  // protocol-relative URL，浏览器自动补当前协议拼成 "https://evil.com" 跳走。
  // 同时桌面 hash-sync effect 把 returnPath 原样写回 URL，分享链接 / 收藏 / 浏览
  // 历史里的 returnPath 一旦带上 "//"，重新进来后又一次落进这条 navigate 调用。
  // !nextValue.startsWith("/") 已经拦掉 https:// 这种绝对 URL，但 "//host" 同样
  // 以 "/" 起头能命中现有检查；显式追加 startsWith("//") 二次拦截。
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    nextValue.startsWith("//") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
  }

  const normalizedPath = normalizePathname(nextValue);

  if (normalizedPath === "/feed" || normalizedPath === "/discover/feed") {
    return "/tabs/feed";
  }

  return normalizedPath;
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
