import { useEffect, useMemo } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { getConversations, type Message } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { getConversationDisplayTitle } from "../../lib/conversation-preview";
import { normalizePathname } from "../../lib/normalize-pathname";
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

const t = translateRuntimeMessage;

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
  const normalizedPathname = normalizePathname(pathname);
  const desktopRouteState = useMemo(
    () => parseDesktopChatRouteHash(hash),
    [hash],
  );

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(baseUrl),
    // 强提醒只是壳层装饰性的提示气泡，没必要每 10s 拉，30s + window focus
    // 已经够用；公网隧道下减少冗余请求。chat-list / desktop-chat-workspace
    // 的 socket 监听本来就会 invalidate 同一个 query。
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
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
        ? normalizedPathname === "/tabs/chat" &&
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
        // R6：OS-level local notification title 也得翻 sentinel——和姊妹
        // chat-list-page / use-conversation-thread 同款；非中文 locale 用户在
        // 通知中心 / Mac 任务栏看到 raw「未知联系人」字面量。
        title: t(msg`强提醒 · ${getConversationDisplayTitle(conversation.title)}`),
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
  }, [
    conversationMap,
    desktopRouteState.conversationId,
    isDesktopLayout,
    normalizedPathname,
    pathname,
  ]);

  return null;
}
