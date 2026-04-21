const DESKTOP_OFFICIAL_ARTICLE_WINDOW_PATH = "/desktop/official-article-window";
const DESKTOP_OFFICIAL_ARTICLE_WINDOW_BINDINGS_STORAGE_KEY =
  "yinjie-desktop-official-article-window-bindings-v1";

export type DesktopOfficialArticleWindowRouteState = {
  articleId: string;
  accountId?: string;
  title?: string;
  returnTo?: string;
  windowId?: string;
};

export function buildDesktopOfficialArticleWindowRouteHash(
  input: DesktopOfficialArticleWindowRouteState,
) {
  const params = new URLSearchParams();
  params.set("articleId", input.articleId);

  if (input.accountId?.trim()) {
    params.set("accountId", input.accountId.trim());
  }

  if (input.title?.trim()) {
    params.set("title", input.title.trim());
  }

  if (input.returnTo?.trim()) {
    params.set("returnTo", input.returnTo.trim());
  }

  if (input.windowId?.trim()) {
    params.set("window", input.windowId.trim());
  }

  return params.toString();
}

export function buildDesktopOfficialArticleWindowPath(
  input: DesktopOfficialArticleWindowRouteState,
) {
  const hash = buildDesktopOfficialArticleWindowRouteHash(input);
  return hash
    ? `${DESKTOP_OFFICIAL_ARTICLE_WINDOW_PATH}#${hash}`
    : DESKTOP_OFFICIAL_ARTICLE_WINDOW_PATH;
}

export function parseDesktopOfficialArticleWindowRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  const articleId = params.get("articleId")?.trim();
  if (!articleId) {
    return null;
  }

  const accountId = params.get("accountId")?.trim();
  const title = params.get("title")?.trim();
  const returnTo = params.get("returnTo")?.trim();
  const windowId = params.get("window")?.trim();

  return {
    articleId,
    accountId: accountId || undefined,
    title: title || undefined,
    returnTo: returnTo || undefined,
    windowId: windowId || undefined,
  } satisfies DesktopOfficialArticleWindowRouteState;
}

type DesktopOfficialArticleWindowBinding = {
  windowId: string;
  articleId: string;
};

export function createDesktopOfficialArticleWindowId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `official-article-window-${Date.now()}`;
}

export function bindDesktopOfficialArticleWindow(input: {
  windowId: string;
  articleId: string;
}) {
  const windowId = input.windowId.trim();
  const articleId = input.articleId.trim();
  if (!windowId || !articleId) {
    return readDesktopOfficialArticleWindowBindings();
  }

  const nextBindings = [
    { windowId, articleId },
    ...readDesktopOfficialArticleWindowBindings().filter(
      (binding) =>
        binding.windowId !== windowId && binding.articleId !== articleId,
    ),
  ];
  return writeDesktopOfficialArticleWindowBindings(nextBindings);
}

export function clearDesktopOfficialArticleWindowBinding(windowId: string) {
  const normalizedWindowId = windowId.trim();
  if (!normalizedWindowId) {
    return readDesktopOfficialArticleWindowBindings();
  }

  return writeDesktopOfficialArticleWindowBindings(
    readDesktopOfficialArticleWindowBindings().filter(
      (binding) => binding.windowId !== normalizedWindowId,
    ),
  );
}

export function readDesktopOfficialArticleWindowId(articleId: string) {
  const normalizedArticleId = articleId.trim();
  if (!normalizedArticleId) {
    return undefined;
  }

  return readDesktopOfficialArticleWindowBindings().find(
    (binding) => binding.articleId === normalizedArticleId,
  )?.windowId;
}

function readDesktopOfficialArticleWindowBindings() {
  if (typeof window === "undefined") {
    return [] as DesktopOfficialArticleWindowBinding[];
  }

  try {
    const raw = window.localStorage.getItem(
      DESKTOP_OFFICIAL_ARTICLE_WINDOW_BINDINGS_STORAGE_KEY,
    );
    if (!raw) {
      return [] as DesktopOfficialArticleWindowBinding[];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as DesktopOfficialArticleWindowBinding[];
    }

    return parsed.filter(
      (binding): binding is DesktopOfficialArticleWindowBinding =>
        typeof binding === "object" &&
        binding !== null &&
        typeof binding.windowId === "string" &&
        Boolean(binding.windowId.trim()) &&
        typeof binding.articleId === "string" &&
        Boolean(binding.articleId.trim()),
    );
  } catch {
    return [] as DesktopOfficialArticleWindowBinding[];
  }
}

function writeDesktopOfficialArticleWindowBindings(
  bindings: DesktopOfficialArticleWindowBinding[],
) {
  if (typeof window === "undefined") {
    return bindings;
  }

  if (bindings.length) {
    window.localStorage.setItem(
      DESKTOP_OFFICIAL_ARTICLE_WINDOW_BINDINGS_STORAGE_KEY,
      JSON.stringify(bindings),
    );
  } else {
    window.localStorage.removeItem(
      DESKTOP_OFFICIAL_ARTICLE_WINDOW_BINDINGS_STORAGE_KEY,
    );
  }

  return bindings;
}
