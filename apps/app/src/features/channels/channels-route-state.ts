import { normalizePathname } from "../../lib/normalize-pathname";

export type ChannelsSectionKey =
  | "recommended"
  | "friends"
  | "following"
  | "live";

export type DesktopChannelsRouteState = {
  authorId: string | null;
  postId: string | null;
  returnHash?: string;
  returnPath?: string;
  section?: ChannelsSectionKey;
};

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

// 走查 2026-05-17 R4：和 character-detail-route-state / mobile-group-route-state /
// mobile-group-call-route-state 同款修法。channels-page 移动端"返回上一页"按钮
// 会 navigate({ to: safeReturnPath })，浏览器 history.replaceState 接受 "//host"
// 形式 → 浏览器拼成 "https://evil.com"，攻击者只需诱导用户点
// /discover/channels#returnPath=//evil.com&section=recommended 的链接，进入视频号
// 后按"返回上一页"就跳第三方站。同时也用于 channel-author 页的 safeReturnPath、
// MobileChannelMediaSurface 卡片转发回链 chain，本轮一并把这条 normalize 加上。
function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    nextValue.startsWith("//")
  ) {
    return undefined;
  }

  const normalizedPath = normalizePathname(nextValue);

  if (normalizedPath === "/channels" || normalizedPath === "/discover/channels") {
    return "/tabs/channels";
  }

  return normalizedPath;
}

function normalizeSection(value?: string | null) {
  switch (value?.trim()) {
    case "friends":
      return "friends";
    case "following":
      return "following";
    case "live":
      return "live";
    case "recommended":
      return "recommended";
    default:
      return undefined;
  }
}

export function parseDesktopChannelsRouteHash(
  hash: string,
): DesktopChannelsRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {
      authorId: null,
      postId: null,
    };
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));
  return {
    authorId: params.get("author")?.trim() || null,
    postId: params.get("post")?.trim() || null,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
    returnPath,
    section: normalizeSection(params.get("section")),
  };
}

export function buildDesktopChannelsRouteHash(input?: {
  authorId?: string | null;
  postId?: string | null;
  returnHash?: string;
  returnPath?: string;
  section?: ChannelsSectionKey | null;
}) {
  const params = new URLSearchParams();
  const authorId = input?.authorId?.trim() ?? "";
  const postId = input?.postId?.trim() ?? "";
  const returnPath = normalizeReturnPath(input?.returnPath);
  const returnHash = normalizeHash(input?.returnHash);
  const section = normalizeSection(input?.section);

  if (postId) {
    params.set("post", postId);
  }

  if (authorId) {
    params.set("author", authorId);
  }

  if (section) {
    params.set("section", section);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  const hash = params.toString();
  return hash || undefined;
}
