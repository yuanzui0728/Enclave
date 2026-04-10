export type DesktopChatFilesRouteState = {
  conversationId?: string;
};

export function parseDesktopChatFilesRouteState(
  hash: string,
): DesktopChatFilesRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const conversationId = params.get("conversation")?.trim();

  return conversationId ? { conversationId } : {};
}

export function buildDesktopChatFilesRouteHash(
  conversationId?: string | null,
) {
  if (!conversationId) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set("conversation", conversationId);
  return params.toString();
}
