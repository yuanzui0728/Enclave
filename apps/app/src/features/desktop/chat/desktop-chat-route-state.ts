export type DesktopChatOfficialView =
  | "subscription-inbox"
  | "service-account"
  | "official-accounts";

export type DesktopChatRoutePanel = "history" | "details";
export type DesktopChatCallAction = "voice" | "video";
export type DesktopChatDetailsAction =
  | "announcement"
  | "member-search"
  | "member-add"
  | "member-remove"
  | "group-name"
  | "group-nickname";

export type DesktopChatRouteState = {
  conversationId?: string;
  messageId?: string;
  panel?: DesktopChatRoutePanel;
  callAction?: DesktopChatCallAction;
  detailsAction?: DesktopChatDetailsAction;
  officialView?: DesktopChatOfficialView;
  officialMode?: "feed" | "accounts";
  accountId?: string;
  articleId?: string;
};

export function parseDesktopChatRouteHash(hash: string): DesktopChatRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const conversationId = params.get("conversationId")?.trim() || undefined;
  const messageId = params.get("messageId")?.trim() || undefined;
  const panel = params.get("panel")?.trim();
  const callAction = params.get("callAction")?.trim();
  const detailsAction = params.get("detailsAction")?.trim();
  const officialView = params.get("officialView")?.trim();
  const officialMode = params.get("officialMode")?.trim();
  const accountId = params.get("accountId")?.trim() || undefined;
  const articleId = params.get("articleId")?.trim() || undefined;
  const normalizedPanel =
    panel === "history" || panel === "details" ? panel : undefined;
  const normalizedCallAction =
    callAction === "voice" || callAction === "video" ? callAction : undefined;
  const normalizedDetailsAction =
    detailsAction === "announcement" ||
    detailsAction === "member-search" ||
    detailsAction === "member-add" ||
    detailsAction === "member-remove" ||
    detailsAction === "group-name" ||
    detailsAction === "group-nickname"
      ? detailsAction
      : undefined;
  const normalizedOfficialView =
    officialView === "subscription-inbox" ||
    officialView === "service-account" ||
    officialView === "official-accounts"
      ? officialView
      : undefined;

  return {
    conversationId,
    messageId,
    panel: normalizedOfficialView ? undefined : normalizedPanel,
    callAction: normalizedOfficialView ? undefined : normalizedCallAction,
    detailsAction:
      normalizedOfficialView || normalizedPanel !== "details"
        ? undefined
        : normalizedDetailsAction,
    officialView: normalizedOfficialView,
    officialMode:
      normalizedOfficialView &&
      (officialMode === "feed" || officialMode === "accounts")
        ? officialMode
        : undefined,
    accountId: normalizedOfficialView ? accountId : undefined,
    articleId: normalizedOfficialView ? articleId : undefined,
  };
}

export function buildDesktopChatRouteHash(state: DesktopChatRouteState) {
  const params = new URLSearchParams();

  if (state.conversationId?.trim()) {
    params.set("conversationId", state.conversationId.trim());
  }

  if (state.messageId?.trim()) {
    params.set("messageId", state.messageId.trim());
  }

  if (state.panel) {
    params.set("panel", state.panel);
  }

  if (state.callAction) {
    params.set("callAction", state.callAction);
  }

  if (state.panel === "details" && state.detailsAction) {
    params.set("detailsAction", state.detailsAction);
  }

  if (state.officialView) {
    params.set("officialView", state.officialView);
  }

  if (
    state.officialView &&
    (state.officialMode === "feed" || state.officialMode === "accounts")
  ) {
    params.set("officialMode", state.officialMode);
  }

  if (state.officialView && state.accountId?.trim()) {
    params.set("accountId", state.accountId.trim());
  }

  if (state.officialView && state.articleId?.trim()) {
    params.set("articleId", state.articleId.trim());
  }

  return params.toString() || undefined;
}

export function buildDesktopChatThreadHash(input: {
  conversationId: string;
  messageId?: string;
}) {
  return buildDesktopChatRouteHash({
    conversationId: input.conversationId,
    messageId: input.messageId,
  });
}

export function buildDesktopChatThreadPath(input: {
  conversationId: string;
  messageId?: string;
}) {
  const hash = buildDesktopChatThreadHash(input);

  return hash ? `/tabs/chat#${hash}` : "/tabs/chat";
}

export function buildDesktopChatThreadPathFromConversationPath(path: string) {
  const conversationId = path.match(/^\/(?:chat|group)\/([^/?#]+)/)?.[1]?.trim();

  if (!conversationId) {
    return null;
  }

  return buildDesktopChatThreadPath({
    conversationId,
  });
}

export function buildDesktopOfficialServiceThreadPath(input: {
  accountId: string;
  articleId?: string;
}) {
  const hash = buildDesktopChatRouteHash({
    officialView: "service-account",
    accountId: input.accountId,
    articleId: input.articleId,
  });

  return hash ? `/tabs/chat#${hash}` : "/tabs/chat";
}

export function buildDesktopSubscriptionInboxPath(input?: {
  articleId?: string;
}) {
  const hash = buildDesktopChatRouteHash({
    officialView: "subscription-inbox",
    articleId: input?.articleId,
  });

  return hash ? `/tabs/chat#${hash}` : "/tabs/chat";
}
