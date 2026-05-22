import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useNavigate } from "@tanstack/react-router";
import { RouteRedirectState } from "../../components/route-redirect-state";

const t = translateRuntimeMessage;
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
      title={t(msg`正在切换到桌面通讯录`)}
      description={t(msg`正在同步路由并切换到桌面通讯录。`)}
      loadingLabel={t(msg`切换桌面通讯录...`)}
    />
  );
}
