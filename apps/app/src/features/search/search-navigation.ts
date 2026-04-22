import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../contacts/contacts-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopOfficialServiceThreadPath,
  buildDesktopSubscriptionInboxPath,
} from "../desktop/chat/desktop-chat-route-state";
import {
  parseDesktopOfficialMessageRouteHash,
  resolveDesktopServiceMessageArticleId,
  resolveDesktopSubscriptionMessageArticleId,
} from "../official-accounts/official-message-route-state";
import {
  buildDesktopFriendMomentsPath,
  parseDesktopFriendMomentsRouteState,
} from "../moments/friend-moments-route-state";
import {
  buildFeedRouteHash,
  parseFeedRouteHash,
} from "../feed/feed-route-state";
import {
  buildMobileGamesRouteSearch,
  parseMobileGamesRouteSearch,
} from "../games/mobile-games-route-state";
import {
  buildMobileMiniProgramsRouteSearch,
  parseMobileMiniProgramsRouteSearch,
} from "../mini-programs/mobile-mini-programs-route-state";

type SearchNavigationTargetInput = {
  to: string;
  search?: string;
  hash?: string;
};

type SearchNavigationTarget = {
  to: string;
  search?: string;
  hash?: string;
};

type SearchNavigationOptions = {
  desktopLayout?: boolean;
};

const SEARCH_NAVIGATION_BASE_URL = "https://yinjie.local";
const LEGACY_CHAT_MESSAGE_HASH_PREFIX = "chat-message-";

export function resolveSearchNavigationTarget(
  input: SearchNavigationTargetInput,
  options?: SearchNavigationOptions,
): SearchNavigationTarget {
  const normalizedTo = input.to.trim() || "/";
  const embeddedTarget = parseEmbeddedNavigationTarget(normalizedTo);
  const normalizedTarget = {
    to: embeddedTarget?.to ?? normalizedTo,
    search:
      normalizeSearchString(input.search) ??
      normalizeSearchString(embeddedTarget?.search),
    hash:
      normalizeHashString(input.hash) ??
      normalizeHashString(embeddedTarget?.hash),
  };

  if (!options?.desktopLayout) {
    return normalizedTarget;
  }

  return (
    resolveDesktopConversationNavigationTarget(normalizedTarget) ??
    resolveDesktopContactsNavigationTarget(normalizedTarget) ??
    resolveDesktopFeedNavigationTarget(normalizedTarget) ??
    resolveDesktopGamesNavigationTarget(normalizedTarget) ??
    resolveDesktopMiniProgramsNavigationTarget(normalizedTarget) ??
    resolveDesktopMomentsNavigationTarget(normalizedTarget) ??
    resolveDesktopOfficialNavigationTarget(normalizedTarget) ??
    normalizedTarget
  );
}

function parseEmbeddedNavigationTarget(path: string) {
  try {
    const url = new URL(path, SEARCH_NAVIGATION_BASE_URL);
    if (url.origin !== SEARCH_NAVIGATION_BASE_URL) {
      return null;
    }

    return {
      to: url.pathname || "/",
      search: url.search || undefined,
      hash: url.hash || undefined,
    };
  } catch {
    return null;
  }
}

function normalizeSearchString(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === "?") {
    return undefined;
  }

  return normalized.startsWith("?") ? normalized : `?${normalized}`;
}

function normalizeHashString(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === "#") {
    return undefined;
  }

  return normalized.startsWith("#") ? normalized.slice(1) || undefined : normalized;
}

function resolveDesktopConversationNavigationTarget(
  target: SearchNavigationTarget,
) {
  const conversationMatch = target.to.match(/^\/(?:chat|group)\/([^/?#]+)$/);
  if (conversationMatch) {
    const conversationId = conversationMatch[1]?.trim();
    if (!conversationId) {
      return null;
    }

    return {
      to: "/tabs/chat",
      hash: buildDesktopChatRouteHash({
        conversationId,
        messageId: parseLegacyHighlightedMessageId(target.hash),
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/chat/subscription-inbox") {
    const routeState = parseDesktopOfficialMessageRouteHash(target.hash ?? "");

    return buildNormalizedTargetFromPath(
      buildDesktopSubscriptionInboxPath({
        articleId: resolveDesktopSubscriptionMessageArticleId(routeState),
      }),
    );
  }

  return null;
}

function resolveDesktopOfficialNavigationTarget(
  target: SearchNavigationTarget,
) {
  if (target.to === "/contacts/official-accounts") {
    const routeState = parseDesktopContactsRouteState(target.hash ?? "");
    const hasAccountSelection = Boolean(
      routeState.accountId || routeState.articleId,
    );

    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        officialMode:
          routeState.pane === "official-accounts"
            ? (routeState.officialMode ??
                (hasAccountSelection ? "accounts" : "feed"))
            : "feed",
        accountId:
          routeState.pane === "official-accounts"
            ? routeState.accountId
            : undefined,
        articleId:
          routeState.pane === "official-accounts"
            ? routeState.articleId
            : undefined,
        showWorldCharacters: false,
      }),
    } satisfies SearchNavigationTarget;
  }

  const serviceMatch = target.to.match(
    /^\/official-accounts\/service\/([^/?#]+)$/,
  );
  if (serviceMatch?.[1]?.trim()) {
    const accountId = serviceMatch[1].trim();
    const routeState = parseDesktopOfficialMessageRouteHash(target.hash ?? "");

    return buildNormalizedTargetFromPath(
      buildDesktopOfficialServiceThreadPath({
        accountId,
        articleId: resolveDesktopServiceMessageArticleId(
          routeState,
          accountId,
        ),
      }),
    );
  }

  const articleMatch = target.to.match(
    /^\/official-accounts\/articles\/([^/?#]+)$/,
  );
  if (articleMatch?.[1]?.trim()) {
    const articleId = articleMatch[1].trim();
    const routeState = parseDesktopContactsRouteState(target.hash ?? "");

    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        accountId:
          routeState.pane === "official-accounts" &&
          routeState.articleId === articleId
            ? routeState.accountId
            : undefined,
        articleId,
        officialMode: "accounts",
        showWorldCharacters: false,
      }),
    } satisfies SearchNavigationTarget;
  }

  const accountMatch = target.to.match(/^\/official-accounts\/([^/?#]+)$/);
  if (accountMatch?.[1]?.trim()) {
    const accountId = accountMatch[1].trim();
    const routeState = parseDesktopContactsRouteState(target.hash ?? "");

    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        accountId,
        articleId:
          routeState.pane === "official-accounts" &&
          routeState.accountId === accountId
            ? routeState.articleId
            : undefined,
        officialMode: "accounts",
        showWorldCharacters: false,
      }),
    } satisfies SearchNavigationTarget;
  }

  return null;
}

function resolveDesktopContactsNavigationTarget(
  target: SearchNavigationTarget,
) {
  const routeState = parseDesktopContactsRouteState(target.hash ?? "");

  if (target.to === "/friend-requests") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "new-friends",
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/starred") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "starred-friends",
        characterId:
          routeState.pane === "starred-friends"
            ? routeState.characterId
            : undefined,
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/tags") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "tags",
        tag: routeState.pane === "tags" ? routeState.tag : undefined,
        characterId:
          routeState.pane === "tags" ? routeState.characterId : undefined,
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/groups") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "groups",
        characterId:
          routeState.pane === "groups" ? routeState.characterId : undefined,
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/world-characters") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "world-character",
        characterId:
          routeState.pane === "world-character"
            ? routeState.characterId
            : undefined,
        showWorldCharacters: true,
      }),
    } satisfies SearchNavigationTarget;
  }

  return null;
}

function resolveDesktopMomentsNavigationTarget(target: SearchNavigationTarget) {
  const friendMomentsMatch = target.to.match(/^\/friend-moments\/([^/?#]+)$/);
  if (!friendMomentsMatch?.[1]?.trim()) {
    return null;
  }

  const characterId = friendMomentsMatch[1].trim();
  const routeState = parseDesktopFriendMomentsRouteState(target.hash ?? "");

  return buildNormalizedTargetFromPath(
    buildDesktopFriendMomentsPath(characterId, routeState),
  );
}

function resolveDesktopFeedNavigationTarget(target: SearchNavigationTarget) {
  if (target.to !== "/discover/feed" && target.to !== "/tabs/feed") {
    return null;
  }

  const routeState = parseFeedRouteHash(target.hash ?? "");
  return {
    to: "/tabs/feed",
    hash: buildFeedRouteHash({
      postId: routeState.postId,
      returnPath: routeState.returnPath,
      returnHash: routeState.returnHash,
    }),
  } satisfies SearchNavigationTarget;
}

function resolveDesktopGamesNavigationTarget(target: SearchNavigationTarget) {
  if (
    target.to !== "/games" &&
    target.to !== "/discover/games" &&
    target.to !== "/tabs/games"
  ) {
    return null;
  }

  const routeState = parseMobileGamesRouteSearch(target.search ?? "");
  return {
    to: "/tabs/games",
    search: buildMobileGamesRouteSearch({
      gameId: routeState.gameId,
      inviteId: routeState.inviteId,
      returnPath: routeState.returnPath,
      returnHash: routeState.returnHash,
    }),
  } satisfies SearchNavigationTarget;
}

function resolveDesktopMiniProgramsNavigationTarget(
  target: SearchNavigationTarget,
) {
  if (
    target.to !== "/discover/mini-programs" &&
    target.to !== "/tabs/mini-programs"
  ) {
    return null;
  }

  const routeState = parseMobileMiniProgramsRouteSearch(target.search ?? "");
  return {
    to: "/tabs/mini-programs",
    search: buildMobileMiniProgramsRouteSearch({
      miniProgramId: routeState.miniProgramId,
      sourceGroupId: routeState.sourceGroupId,
      sourceGroupName: routeState.sourceGroupName,
      returnPath: routeState.returnPath,
      returnHash: routeState.returnHash,
    }),
  } satisfies SearchNavigationTarget;
}

function parseLegacyHighlightedMessageId(hash: string | undefined) {
  const normalizedHash = normalizeHashString(hash);
  if (!normalizedHash?.startsWith(LEGACY_CHAT_MESSAGE_HASH_PREFIX)) {
    return undefined;
  }

  const messageId = normalizedHash
    .slice(LEGACY_CHAT_MESSAGE_HASH_PREFIX.length)
    .trim();
  return messageId || undefined;
}

function buildNormalizedTargetFromPath(path: string): SearchNavigationTarget {
  const embeddedTarget = parseEmbeddedNavigationTarget(path);

  return {
    to: embeddedTarget?.to ?? path,
    search: normalizeSearchString(embeddedTarget?.search),
    hash: normalizeHashString(embeddedTarget?.hash),
  };
}
