export type DesktopChannelsRouteState = {
  authorId: string | null;
  postId: string | null;
};

export function parseDesktopChannelsRouteHash(
  hash: string,
): DesktopChannelsRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {
      authorId: null,
      postId: null,
    };
  }

  const params = new URLSearchParams(normalizedHash);
  return {
    authorId: params.get("author")?.trim() || null,
    postId: params.get("post")?.trim() || null,
  };
}

export function buildDesktopChannelsRouteHash(input?: {
  authorId?: string | null;
  postId?: string | null;
}) {
  const params = new URLSearchParams();
  const authorId = input?.authorId?.trim() ?? "";
  const postId = input?.postId?.trim() ?? "";

  if (postId) {
    params.set("post", postId);
  }

  if (authorId) {
    params.set("author", authorId);
  }

  const hash = params.toString();
  return hash || undefined;
}
