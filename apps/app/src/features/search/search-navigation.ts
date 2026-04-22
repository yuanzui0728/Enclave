import { buildDesktopContactsRouteHash } from "../contacts/contacts-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopOfficialServiceThreadPath,
  buildDesktopSubscriptionInboxPath,
} from "../desktop/chat/desktop-chat-route-state";
import { parseDesktopOfficialMessageRouteHash } from "../official-accounts/official-message-route-state";

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
        articleId: routeState.articleId,
      }),
    );
  }

  return null;
}

function resolveDesktopOfficialNavigationTarget(
  target: SearchNavigationTarget,
) {
  if (target.to === "/contacts/official-accounts") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        officialMode: "feed",
        showWorldCharacters: false,
      }),
    } satisfies SearchNavigationTarget;
  }

  const serviceMatch = target.to.match(
    /^\/official-accounts\/service\/([^/?#]+)$/,
  );
  if (serviceMatch?.[1]?.trim()) {
    const routeState = parseDesktopOfficialMessageRouteHash(target.hash ?? "");

    return buildNormalizedTargetFromPath(
      buildDesktopOfficialServiceThreadPath({
        accountId: serviceMatch[1].trim(),
        articleId: routeState.articleId,
      }),
    );
  }

  const articleMatch = target.to.match(
    /^\/official-accounts\/articles\/([^/?#]+)$/,
  );
  if (articleMatch?.[1]?.trim()) {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        articleId: articleMatch[1].trim(),
        officialMode: "accounts",
        showWorldCharacters: false,
      }),
    } satisfies SearchNavigationTarget;
  }

  const accountMatch = target.to.match(/^\/official-accounts\/([^/?#]+)$/);
  if (accountMatch?.[1]?.trim()) {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "official-accounts",
        accountId: accountMatch[1].trim(),
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
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/tags") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "tags",
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/groups") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "groups",
      }),
    } satisfies SearchNavigationTarget;
  }

  if (target.to === "/contacts/world-characters") {
    return {
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane: "world-character",
        showWorldCharacters: true,
      }),
    } satisfies SearchNavigationTarget;
  }

  return null;
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
