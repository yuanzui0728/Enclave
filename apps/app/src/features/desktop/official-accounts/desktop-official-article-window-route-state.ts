import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  buildDesktopStandaloneWindowLabel,
  openDesktopStandaloneWindow,
} from "../../../runtime/desktop-windowing";

const DESKTOP_OFFICIAL_ARTICLE_WINDOW_PATH = "/desktop/official-article-window";

export type DesktopOfficialArticleWindowRouteState = {
  articleId: string;
  accountId?: string;
  title?: string;
  returnTo?: string;
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

  return {
    articleId,
    accountId: accountId || undefined,
    title: title || undefined,
    returnTo: returnTo || undefined,
  } satisfies DesktopOfficialArticleWindowRouteState;
}

function buildDesktopOfficialArticleWindowLabel(articleId: string) {
  return buildDesktopStandaloneWindowLabel(
    "desktop-official-article-window",
    articleId,
  );
}

export async function openDesktopOfficialArticleWindow(
  input: DesktopOfficialArticleWindowRouteState,
) {
  if (typeof window === "undefined") {
    return false;
  }

  const routePath = buildDesktopOfficialArticleWindowPath(input);
  const width = Math.max(980, Math.min(window.screen.availWidth - 120, 1140));
  const height = Math.max(780, Math.min(window.screen.availHeight - 96, 920));
  const left = Math.max(24, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(
    24,
    Math.round((window.screen.availHeight - height) / 2),
  );
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");

  if (!isDesktopRuntimeAvailable()) {
    return Boolean(window.open(routePath, "_blank", features));
  }

  if (
    await openDesktopStandaloneWindow({
      label: buildDesktopOfficialArticleWindowLabel(input.articleId),
      url: routePath,
      title: input.title?.trim() || "公众号文章",
      width,
      height,
      minWidth: 980,
      minHeight: 780,
    })
  ) {
    return true;
  }

  return Boolean(window.open(routePath, "_blank", features));
}
