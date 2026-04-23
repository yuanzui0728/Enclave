import { useEffect, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { RouteRedirectState } from "../../components/route-redirect-state";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../contacts/contacts-route-state";
import { buildDesktopOfficialArticleWindowRouteHash } from "./official-article-window-route-state";

export type OfficialArticleRouteShellProps = {
  articleId: string;
};

export function OfficialArticleRouteShell({
  articleId,
}: OfficialArticleRouteShellProps) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const desktopPaneState = useMemo(() => {
    const routeState = parseDesktopContactsRouteState(hash);
    return routeState.pane === "official-accounts" ? routeState : null;
  }, [hash]);
  const contactsHash = useMemo(
    () =>
      buildDesktopContactsRouteHash({
        pane: "official-accounts",
        accountId:
          desktopPaneState?.articleId === articleId
            ? desktopPaneState.accountId
            : undefined,
        articleId,
        officialMode: "accounts",
      }),
    [articleId, desktopPaneState?.accountId, desktopPaneState?.articleId],
  );

  useEffect(() => {
    void navigate({
      to: "/desktop/official-article-window",
      hash: buildDesktopOfficialArticleWindowRouteHash({
        articleId,
        returnTo: `/tabs/contacts${contactsHash ? `#${contactsHash}` : ""}`,
      }),
      replace: true,
    });
  }, [articleId, contactsHash, navigate]);

  return (
    <RouteRedirectState
      title="正在打开桌面公众号文章"
      description="正在同步桌面文章窗口的路由状态，马上显示当前内容。"
      loadingLabel="切换桌面公众号文章..."
    />
  );
}
