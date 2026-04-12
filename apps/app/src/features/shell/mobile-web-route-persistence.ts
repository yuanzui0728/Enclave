const MOBILE_WEB_LAST_ROUTE_STORAGE_KEY = "yinjie-mobile-web-last-route";
const MAX_ROUTE_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const EXCLUDED_PATHNAMES = new Set(["/", "/welcome", "/setup", "/onboarding"]);
const TRANSIENT_SEARCH_KEYS = new Set(["callReturn", "composeShortcut"]);

const DIRECT_CALL_ROUTE_PATTERN = /^\/chat\/([^/]+)\/(voice-call|video-call)$/;
const GROUP_CALL_ROUTE_PATTERN = /^\/group\/([^/]+)\/(voice-call|video-call)$/;

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

  const directCallMatch = pathname.match(DIRECT_CALL_ROUTE_PATTERN);
  if (directCallMatch) {
    return `/chat/${directCallMatch[1]}`;
  }

  const groupCallMatch = pathname.match(GROUP_CALL_ROUTE_PATTERN);
  if (groupCallMatch) {
    return `/group/${groupCallMatch[1]}`;
  }

  return pathname;
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
