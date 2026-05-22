import { normalizePathname } from "./normalize-pathname";

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
  const normalizedPathname = normalizePathname(normalizedUrl.pathname);
  return `${normalizedPathname}${normalizedUrl.search}${normalizedUrl.hash}`;
}

export function isDesktopOnlyPath(path?: string | null) {
  const normalizedPath = path?.trim();
  return Boolean(normalizedPath?.startsWith("/desktop/"));
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

// 走查（第三次会话 R1）：用 navigate({replace:true}) 跳转时，浏览器 history
// 把当前条目原地替换，但 mobile-shell useEffect 看到的 pathname 变化跟 push
// 长得一样 → recordAppNavigation 把"被替换掉的"那一页当成 previousPath 写进
// sessionStorage。典型场景：create-group-page 的 onSuccess 用 replace 跳到
// /group/{id} → storage prev 被写成 /group/new（已 replace 出 history） →
// 用户从新群点返回时 canSafelyNavigateBack(/tabs/chat) 因 prev=/group/new
// 比对失败，fallback navigate({to:/tabs/chat}) 又 push 一条新 history。整体
// 表现：浏览器 history 多一条幽灵 /tabs/chat，Android 硬件 Back 从那条幽灵
// 一按又回到 /group/{id} 死循环。
//
// 这个 helper 在 replace 导航前 pre-write 正确的 storage，让 mobile-shell
// 的 recordAppNavigation(currentPath) 因 currentState.currentPath === path
// 早返兜住。从而把"真实浏览器 prev"和"storage prev"对齐。
export function overrideRecordedNavigationPair(
  nextPath: string,
  previousPath: string,
) {
  const normalizedNext = normalizeAppPath(nextPath);
  const normalizedPrev = normalizeAppPath(previousPath);
  if (!normalizedNext || !normalizedPrev) {
    return;
  }

  const storage = getStorage();
  if (!storage) {
    return;
  }

  writeAppNavigationState(
    {
      currentPath: normalizedNext,
      previousPath: normalizedPrev,
    },
    storage,
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

function getPathnameOnly(path: string) {
  if (!path.startsWith("/")) {
    return null;
  }

  try {
    const url = new URL(path, "https://yinjie.app");
    return normalizePathname(url.pathname);
  } catch {
    return null;
  }
}

export function canSafelyNavigateBack(expectedPreviousPath?: string) {
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
    if (expectedPreviousPath) {
      const expectedPathname = getPathnameOnly(expectedPreviousPath);
      const previousPathname = getPathnameOnly(currentState.previousPath);
      if (
        !expectedPathname ||
        !previousPathname ||
        expectedPathname !== previousPathname
      ) {
        return false;
      }
    }
    return true;
  }

  return !currentState && hasSameOriginReferrer();
}

export function navigateBackOrFallback(
  onFallback: () => void,
  expectedPreviousPath?: string,
) {
  if (canSafelyNavigateBack(expectedPreviousPath)) {
    window.history.back();
    return;
  }

  onFallback();
}
