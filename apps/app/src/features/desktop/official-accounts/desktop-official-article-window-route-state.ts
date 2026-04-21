import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  buildDesktopStandaloneWindowLabel,
  openBrowserStandaloneWindow,
  openDesktopStandaloneWindow,
} from "../../../runtime/desktop-windowing";
import {
  bindDesktopOfficialArticleWindow,
  buildDesktopOfficialArticleWindowPath,
  buildDesktopOfficialArticleWindowRouteHash,
  clearDesktopOfficialArticleWindowBinding,
  createDesktopOfficialArticleWindowId,
  parseDesktopOfficialArticleWindowRouteHash,
  readDesktopOfficialArticleWindowId,
  type DesktopOfficialArticleWindowRouteState,
} from "../../official-accounts/official-article-window-route-state";

export {
  bindDesktopOfficialArticleWindow,
  buildDesktopOfficialArticleWindowPath,
  buildDesktopOfficialArticleWindowRouteHash,
  clearDesktopOfficialArticleWindowBinding,
  createDesktopOfficialArticleWindowId,
  parseDesktopOfficialArticleWindowRouteHash,
  readDesktopOfficialArticleWindowId,
  type DesktopOfficialArticleWindowRouteState,
};

function buildDesktopOfficialArticleWindowLabel(windowId: string) {
  return buildDesktopStandaloneWindowLabel(
    "desktop-official-article-window",
    windowId,
  );
}

export async function openDesktopOfficialArticleWindow(
  input: DesktopOfficialArticleWindowRouteState,
) {
  if (typeof window === "undefined") {
    return false;
  }

  const resolvedWindowId =
    input.windowId?.trim() ||
    readDesktopOfficialArticleWindowId(input.articleId) ||
    createDesktopOfficialArticleWindowId();
  const windowLabel = buildDesktopOfficialArticleWindowLabel(resolvedWindowId);
  const routePath = buildDesktopOfficialArticleWindowPath({
    ...input,
    windowId: resolvedWindowId,
  });
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
    return openBrowserStandaloneWindow({
      label: windowLabel,
      url: routePath,
      features,
    });
  }

  bindDesktopOfficialArticleWindow({
    windowId: resolvedWindowId,
    articleId: input.articleId,
  });

  if (
    await openDesktopStandaloneWindow({
      label: windowLabel,
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

  return openBrowserStandaloneWindow({
    label: windowLabel,
    url: routePath,
    features,
  });
}
