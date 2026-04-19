const APP_NAVIGATION_STATE_STORAGE_KEY = "yinjie-app-navigation-state";

type AppNavigationState = {
  currentPath: string;
  previousPath?: string;
};

let currentDocumentNavigationInitialized = false;

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeAppPath(path: string) {
  if (!path.startsWith("/")) {
    return null;
  }

  const normalizedUrl = new URL(path, "https://yinjie.app");
  return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
}

function readAppNavigationState(storage = getStorage()) {
  const rawValue = storage?.getItem(APP_NAVIGATION_STATE_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AppNavigationState>;
    const currentPath =
      typeof parsed.currentPath === "string"
        ? normalizeAppPath(parsed.currentPath)
        : null;
    const previousPath =
      typeof parsed.previousPath === "string"
        ? normalizeAppPath(parsed.previousPath)
        : null;

    if (!currentPath) {
      storage?.removeItem(APP_NAVIGATION_STATE_STORAGE_KEY);
      return null;
    }

    const nextState: AppNavigationState = previousPath
      ? { currentPath, previousPath }
      : { currentPath };

    if (
      nextState.currentPath !== parsed.currentPath ||
      nextState.previousPath !== parsed.previousPath
    ) {
      storage?.setItem(
        APP_NAVIGATION_STATE_STORAGE_KEY,
        JSON.stringify(nextState),
      );
    }

    return nextState;
  } catch {
    storage?.removeItem(APP_NAVIGATION_STATE_STORAGE_KEY);
    return null;
  }
}

function writeAppNavigationState(
  nextState: AppNavigationState,
  storage = getStorage(),
) {
  storage?.setItem(APP_NAVIGATION_STATE_STORAGE_KEY, JSON.stringify(nextState));
}

function getCurrentBrowserPath() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeAppPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

function hasSameOriginReferrer() {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !document.referrer
  ) {
    return false;
  }

  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

function getNavigationEntryType() {
  if (typeof performance === "undefined") {
    return null;
  }

  const navigationEntry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  return navigationEntry?.type ?? null;
}

function shouldResetNavigationStateForCurrentDocument() {
  return (
    getNavigationEntryType() === "navigate" && !hasSameOriginReferrer()
  );
}

export function recordAppNavigation(path: string) {
  const normalizedPath = normalizeAppPath(path);
  if (!normalizedPath) {
    return;
  }

  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (!currentDocumentNavigationInitialized) {
    currentDocumentNavigationInitialized = true;

    if (shouldResetNavigationStateForCurrentDocument()) {
      writeAppNavigationState({ currentPath: normalizedPath }, storage);
      return;
    }
  }

  const currentState = readAppNavigationState(storage);
  if (!currentState) {
    writeAppNavigationState({ currentPath: normalizedPath }, storage);
    return;
  }

  if (currentState.currentPath === normalizedPath) {
    return;
  }

  writeAppNavigationState(
    {
      currentPath: normalizedPath,
      previousPath: currentState.currentPath,
    },
    storage,
  );
}

export function canSafelyNavigateBack() {
  if (typeof window === "undefined" || window.history.length <= 1) {
    return false;
  }

  const currentPath = getCurrentBrowserPath();
  const currentState = readAppNavigationState();

  if (
    currentPath &&
    currentState?.currentPath === currentPath &&
    currentState.previousPath
  ) {
    return true;
  }

  return !currentState && hasSameOriginReferrer();
}

export function navigateBackOrFallback(onFallback: () => void) {
  if (canSafelyNavigateBack()) {
    window.history.back();
    return;
  }

  onFallback();
}
