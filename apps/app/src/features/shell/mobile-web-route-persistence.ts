const MOBILE_WEB_LAST_ROUTE_STORAGE_KEY = "yinjie-mobile-web-last-route";
const MAX_ROUTE_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const EXCLUDED_PATHNAMES = new Set([
  "/",
  "/welcome",
  "/setup",
  "/onboarding",
  "/group/new",
]);
const TRANSIENT_SEARCH_KEYS = new Set(["callReturn", "composeShortcut"]);

const RESTORABLE_STATIC_PATHNAMES = new Set([
  "/tabs/chat",
  "/tabs/contacts",
  "/tabs/discover",
  "/tabs/profile",
  "/tabs/search",
  "/chat/subscription-inbox",
  "/friend-requests",
  "/contacts/starred",
  "/contacts/world-characters",
  "/contacts/groups",
  "/contacts/tags",
  "/contacts/official-accounts",
  "/discover/moments",
  "/discover/encounter",
  "/discover/scene",
  "/discover/feed",
  "/discover/channels",
  "/discover/games",
  "/discover/mini-programs",
  "/profile/settings",
]);
const RESTORABLE_PATH_PATTERNS = [
  /^\/chat\/[^/]+$/,
  /^\/group\/[^/]+$/,
  /^\/character\/[^/]+$/,
  /^\/friend-moments\/[^/]+$/,
  /^\/official-accounts\/[^/]+$/,
  /^\/official-accounts\/articles\/[^/]+$/,
  /^\/official-accounts\/service\/[^/]+$/,
  /^\/channels\/authors\/[^/]+$/,
];
const CHAT_TOOL_ROUTE_PATTERN =
  /^\/chat\/([^/]+)\/(details|background|search)$/;
const DIRECT_CALL_ROUTE_PATTERN = /^\/chat\/([^/]+)\/(voice-call|video-call)$/;
const GROUP_TOOL_ROUTE_PATTERN =
  /^\/group\/([^/]+)\/(details|background|announcement|qr|search)$/;
const GROUP_EDIT_ROUTE_PATTERN = /^\/group\/([^/]+)\/edit\/(name|nickname)$/;
const GROUP_MEMBER_ROUTE_PATTERN =
  /^\/group\/([^/]+)\/members\/(add|remove)$/;
const GROUP_CALL_ROUTE_PATTERN = /^\/group\/([^/]+)\/(voice-call|video-call)$/;
const DISCOVER_MOMENTS_PUBLISH_ROUTE_PATTERN = /^\/discover\/moments\/publish$/;

type PersistedMobileWebRoute = {
  path: string;
  updatedAt: number;
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolvePathname(path: string) {
  const [pathname] = path.split(/[?#]/, 1);
  return pathname || "/";
}

function normalizePersistablePath(path: string) {
  if (!path.startsWith("/")) {
    return null;
  }

  const normalizedUrl = new URL(path, "https://yinjie.app");
  const normalizedPathname = normalizePersistablePathname(
    normalizedUrl.pathname,
  );

  if (!normalizedPathname) {
    return null;
  }

  for (const key of TRANSIENT_SEARCH_KEYS) {
    normalizedUrl.searchParams.delete(key);
  }

  const nextSearch = normalizedUrl.searchParams.toString();
  const nextHash =
    normalizedPathname === normalizedUrl.pathname ? normalizedUrl.hash : "";

  return `${normalizedPathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`;
}

function normalizePersistablePathname(pathname: string) {
  if (EXCLUDED_PATHNAMES.has(pathname)) {
    return null;
  }

  const chatToolRouteMatch = pathname.match(CHAT_TOOL_ROUTE_PATTERN);
  if (chatToolRouteMatch) {
    return normalizeRestorablePathname(`/chat/${chatToolRouteMatch[1]}`);
  }

  const directCallMatch = pathname.match(DIRECT_CALL_ROUTE_PATTERN);
  if (directCallMatch) {
    return normalizeRestorablePathname(`/chat/${directCallMatch[1]}`);
  }

  const groupToolRouteMatch = pathname.match(GROUP_TOOL_ROUTE_PATTERN);
  if (groupToolRouteMatch) {
    return normalizeRestorablePathname(`/group/${groupToolRouteMatch[1]}`);
  }

  const groupEditRouteMatch = pathname.match(GROUP_EDIT_ROUTE_PATTERN);
  if (groupEditRouteMatch) {
    return normalizeRestorablePathname(`/group/${groupEditRouteMatch[1]}`);
  }

  const groupMemberRouteMatch = pathname.match(GROUP_MEMBER_ROUTE_PATTERN);
  if (groupMemberRouteMatch) {
    return normalizeRestorablePathname(`/group/${groupMemberRouteMatch[1]}`);
  }

  const groupCallMatch = pathname.match(GROUP_CALL_ROUTE_PATTERN);
  if (groupCallMatch) {
    return normalizeRestorablePathname(`/group/${groupCallMatch[1]}`);
  }

  if (DISCOVER_MOMENTS_PUBLISH_ROUTE_PATTERN.test(pathname)) {
    return normalizeRestorablePathname("/discover/moments");
  }

  return normalizeRestorablePathname(pathname);
}

function normalizeRestorablePathname(pathname: string) {
  if (RESTORABLE_STATIC_PATHNAMES.has(pathname)) {
    return pathname;
  }

  for (const pattern of RESTORABLE_PATH_PATTERNS) {
    if (pattern.test(pathname)) {
      return pathname;
    }
  }

  return null;
}

export function persistMobileWebRoute(path: string) {
  const normalizedPath = normalizePersistablePath(path);
  if (!normalizedPath) {
    return;
  }

  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: PersistedMobileWebRoute = {
    path: normalizedPath,
    updatedAt: Date.now(),
  };
  storage.setItem(MOBILE_WEB_LAST_ROUTE_STORAGE_KEY, JSON.stringify(payload));
}

export function readPersistedMobileWebRoute() {
  const storage = getStorage();
  const rawValue = storage?.getItem(MOBILE_WEB_LAST_ROUTE_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const payload = JSON.parse(rawValue) as Partial<PersistedMobileWebRoute>;
    const normalizedPath =
      typeof payload.path === "string"
        ? normalizePersistablePath(payload.path)
        : null;
    if (
      !normalizedPath ||
      typeof payload.updatedAt !== "number" ||
      !Number.isFinite(payload.updatedAt)
    ) {
      storage?.removeItem(MOBILE_WEB_LAST_ROUTE_STORAGE_KEY);
      return null;
    }

    if (Date.now() - payload.updatedAt > MAX_ROUTE_AGE_MS) {
      storage?.removeItem(MOBILE_WEB_LAST_ROUTE_STORAGE_KEY);
      return null;
    }

    if (normalizedPath !== payload.path) {
      storage?.setItem(
        MOBILE_WEB_LAST_ROUTE_STORAGE_KEY,
        JSON.stringify({
          path: normalizedPath,
          updatedAt: payload.updatedAt,
        } satisfies PersistedMobileWebRoute),
      );
    }

    return normalizedPath;
  } catch {
    storage?.removeItem(MOBILE_WEB_LAST_ROUTE_STORAGE_KEY);
    return null;
  }
}
