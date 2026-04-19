import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RouteRedirectState } from "../../components/route-redirect-state";
import {
  buildDesktopChatRouteHash,
  type DesktopChatDetailsAction,
  type DesktopChatRoutePanel,
} from "../desktop/chat/desktop-chat-route-state";

export type ChatRouteRedirectShellProps = {
  conversationId: string;
  panel?: DesktopChatRoutePanel;
  detailsAction?: DesktopChatDetailsAction;
  title: string;
  description: string;
  loadingLabel: string;
};

export function ChatRouteRedirectShell({
  conversationId,
  panel,
  detailsAction,
  title,
  description,
  loadingLabel,
}: ChatRouteRedirectShellProps) {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/tabs/chat",
      hash: buildDesktopChatRouteHash({
        conversationId,
        panel,
        detailsAction,
      }),
      replace: true,
    });
  }, [conversationId, detailsAction, navigate, panel]);

  return (
    <RouteRedirectState
      title={title}
      description={description}
      loadingLabel={loadingLabel}
    />
  );
}

export {
  ChatRouteRedirectShell as DesktopChatRouteRedirectShell,
  type ChatRouteRedirectShellProps as DesktopChatRouteRedirectShellProps,
};
