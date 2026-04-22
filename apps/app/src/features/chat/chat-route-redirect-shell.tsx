import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { RouteRedirectState } from "../../components/route-redirect-state";
import {
  buildDesktopChatRouteHash,
  type DesktopChatCallAction,
  type DesktopChatDetailsAction,
  type DesktopChatRoutePanel,
} from "./chat-route-state";

const LEGACY_HIGHLIGHT_HASH_PREFIX = "chat-message-";

function parseLegacyHighlightedMessageId(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash.trim();

  if (!normalizedHash) {
    return undefined;
  }

  if (
    !normalizedHash.includes("=") &&
    normalizedHash.startsWith(LEGACY_HIGHLIGHT_HASH_PREFIX)
  ) {
    return normalizedHash.slice(LEGACY_HIGHLIGHT_HASH_PREFIX.length) || undefined;
  }

  return new URLSearchParams(normalizedHash).get("message")?.trim() || undefined;
}

export type ChatRouteRedirectShellProps = {
  conversationId: string;
  panel?: DesktopChatRoutePanel;
  callAction?: DesktopChatCallAction;
  detailsAction?: DesktopChatDetailsAction;
  title: string;
  description: string;
  loadingLabel: string;
};

export function ChatRouteRedirectShell({
  conversationId,
  panel,
  callAction,
  detailsAction,
  title,
  description,
  loadingLabel,
}: ChatRouteRedirectShellProps) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const highlightedMessageId = parseLegacyHighlightedMessageId(hash);

  useEffect(() => {
    void navigate({
      to: "/tabs/chat",
      hash: buildDesktopChatRouteHash({
        conversationId,
        messageId: highlightedMessageId,
        panel,
        callAction,
        detailsAction,
      }),
      replace: true,
    });
  }, [
    callAction,
    conversationId,
    detailsAction,
    highlightedMessageId,
    navigate,
    panel,
  ]);

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
