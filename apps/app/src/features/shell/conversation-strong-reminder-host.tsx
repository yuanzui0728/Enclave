import { useEffect, useMemo, useRef } from "react";
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

  // 走查 R3：原版 directConversations 每次 conversationsQuery refetch（30s 定时 +
  // window-focus + socket 推 invalidate）都返回新数组 → forEach 把所有 direct
  // 会话的 joinConversationRoom 全 emit 一遍。服务端 socket.io rooms 是 Set，
  // 重复 join 幂等不出错，但用户有 60+ direct 会话时每 30s 在 socket 上吐 60
  // 条 join_conversation。改成 ref 记已 join 过的 conversation id，只对新增的
  // 会话 emit。退出会话 / 删除会话不主动 leave（用户回来时 conversationsQuery
  // 再次出现会重 join；服务端 disconnect 时整 socket 房间被清理）。
  const joinedConversationIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    directConversations.forEach((conversation) => {
      if (joinedConversationIdsRef.current.has(conversation.id)) {
        return;
      }
      joinedConversationIdsRef.current.add(conversation.id);
      joinConversationRoom({ conversationId: conversation.id });
    });
  }, [directConversations]);

  // 走查 R3：原版 onChatMessage 监听 deps 里有 conversationMap —— refetch 每 30s
  // 换 Map 引用 → offMessage + 重新 onChatMessage，每分钟拆装两次 socket listener。
  // 用 ref 镜像所有"读 React state"的值，effect 只挂一次，handler 内部走 ref
  // 拿最新值。
  const strongReminderStateRef = useRef({
    conversationMap,
    isDesktopLayout,
    normalizedPathname,
    pathname,
    desktopRouteConversationId: desktopRouteState.conversationId,
  });
  strongReminderStateRef.current = {
    conversationMap,
    isDesktopLayout,
    normalizedPathname,
    pathname,
    desktopRouteConversationId: desktopRouteState.conversationId,
  };

  useEffect(() => {
    const offMessage = onChatMessage((payload) => {
      if (!("conversationId" in payload)) {
        return;
      }

      const {
        conversationMap: latestMap,
        isDesktopLayout: latestIsDesktop,
        normalizedPathname: latestNormalizedPathname,
        pathname: latestPathname,
        desktopRouteConversationId: latestDesktopRouteConversationId,
      } = strongReminderStateRef.current;

      const conversation = latestMap.get(payload.conversationId);
      if (
        !conversation ||
        payload.senderType !== "character" ||
        !isConversationStrongReminderActive(conversation.strongReminderUntil)
      ) {
        return;
      }

      const inActiveConversation = latestIsDesktop
        ? latestNormalizedPathname === "/tabs/chat" &&
          latestDesktopRouteConversationId === conversation.id
        : latestPathname === `/chat/${conversation.id}`;
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
        route: latestIsDesktop
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
  }, []);

  return null;
}
