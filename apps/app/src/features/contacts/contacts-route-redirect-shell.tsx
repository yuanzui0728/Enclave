import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RouteRedirectState } from "../../components/route-redirect-state";
import {
  buildDesktopContactsRouteHash,
  type DesktopContactsPane,
} from "./contacts-route-state";

export type ContactsRouteRedirectShellProps = {
  pane: DesktopContactsPane;
  characterId?: string;
  accountId?: string;
  articleId?: string;
  officialMode?: "feed" | "accounts";
  showWorldCharacters?: boolean;
};

export function ContactsRouteRedirectShell({
  pane,
  characterId,
  accountId,
  articleId,
  officialMode,
  showWorldCharacters = false,
}: ContactsRouteRedirectShellProps) {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({
        pane,
        characterId,
        accountId,
        articleId,
        officialMode,
        showWorldCharacters,
      }),
      replace: true,
    });
  }, [
    accountId,
    articleId,
    characterId,
    navigate,
    officialMode,
    pane,
    showWorldCharacters,
  ]);

  return (
    <RouteRedirectState
      title="正在切换到桌面通讯录"
      description="正在同步路由并切换到桌面通讯录工作区。"
      loadingLabel="切换桌面通讯录..."
    />
  );
}
