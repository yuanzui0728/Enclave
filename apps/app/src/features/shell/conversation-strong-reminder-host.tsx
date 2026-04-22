import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { getConversations, type Message } from "@yinjie/contracts";
import { joinConversationRoom, onChatMessage } from "../../lib/socket";
import { showLocalNotification } from "../../runtime/mobile-bridge";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  buildDesktopChatThreadPath,
  parseDesktopChatRouteHash,
} from "../desktop/chat/desktop-chat-route-state";
import {
  describeStrongReminderMessage,
  isConversationStrongReminderActive,
} from "../chat/conversation-strong-reminder";
import { useDesktopLayout } from "./use-desktop-layout";

export function ConversationStrongReminderHost() {
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const desktopRouteState = useMemo(
    () => parseDesktopChatRouteHash(hash),
    [hash],
  );

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(baseUrl),
    refetchInterval: 10_000,
  });

  const directConversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter(
        (conversation) => conversation.type === "direct",
      ),
    [conversationsQuery.data],
  );
  const conversationMap = useMemo(
    () => new Map(directConversations.map((conversation) => [conversation.id, conversation])),
    [directConversations],
  );

  useEffect(() => {
    directConversations.forEach((conversation) => {
      joinConversationRoom({ conversationId: conversation.id });
    });
  }, [directConversations]);

  useEffect(() => {
    const offMessage = onChatMessage((payload) => {
      if (!("conversationId" in payload)) {
        return;
      }

      const conversation = conversationMap.get(payload.conversationId);
      if (
        !conversation ||
        payload.senderType !== "character" ||
        !isConversationStrongReminderActive(conversation.strongReminderUntil)
      ) {
        return;
      }

      const inActiveConversation = isDesktopLayout
        ? pathname === "/tabs/chat" &&
          desktopRouteState.conversationId === conversation.id
        : pathname === `/chat/${conversation.id}`;
      if (
        inActiveConversation &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        return;
      }

      const message = payload as Message;
      void showLocalNotification({
        id: `strong-reminder-${conversation.id}-${message.id}`,
        title: `强提醒 · ${conversation.title}`,
        body: describeStrongReminderMessage(message),
        route: isDesktopLayout
          ? buildDesktopChatThreadPath({
              conversationId: conversation.id,
              messageId: message.id,
            })
          : `/chat/${conversation.id}#chat-message-${message.id}`,
        conversationId: conversation.id,
        source: "conversation_strong_reminder",
      });
    });

    return () => {
      offMessage();
    };
  }, [conversationMap, desktopRouteState.conversationId, isDesktopLayout, pathname]);

  return null;
}
