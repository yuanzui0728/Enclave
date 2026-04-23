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

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue || !nextValue.startsWith("/")) {
    return undefined;
  }

  if (nextValue === "/channels" || nextValue === "/discover/channels") {
    return "/tabs/channels";
  }

  return nextValue;
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
