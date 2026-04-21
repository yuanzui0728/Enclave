import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { getConversationMessages, getConversations } from "@yinjie/contracts";
import { ChatMessageSearchPanel } from "../features/chat/chat-message-search-panel";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "../features/chat/mobile-chat-route-state";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ChatMessageSearchPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/search",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        panel="history"
        title="正在打开桌面聊天记录"
        description="正在切换到桌面聊天工作区中的聊天记录搜索侧栏。"
        loadingLabel="打开桌面聊天记录..."
      />
    );
  }

  return <MobileChatMessageSearchPage conversationId={conversationId} />;
}

function MobileChatMessageSearchPage({
  conversationId,
}: {
  conversationId: string;
}) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = parseMobileChatRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const searchRouteHash =
    buildMobileChatRouteHash({
      highlightedMessageId: routeState.highlightedMessageId,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    }) || undefined;

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId],
    queryFn: () => getConversationMessages(conversationId, baseUrl),
  });

  const conversation =
    conversationsQuery.data?.find((item) => item.id === conversationId) ?? null;
  const conversationTitle = conversation?.title ?? "聊天记录";

  useEffect(() => {
    if (
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      conversation
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  return (
    <ChatMessageSearchPanel
      subtitle={conversationTitle}
      messages={messagesQuery.data}
      isLoading={messagesQuery.isLoading}
      error={
        messagesQuery.isError && messagesQuery.error instanceof Error
          ? messagesQuery.error
          : null
      }
      loadingLabel="正在读取聊天记录..."
      emptyResultTitle="没有找到相关聊天记录"
      emptyResultDescription="换个关键词试试，或者切到图片、文件、链接分类继续找。"
      onRetry={() => {
        void messagesQuery.refetch();
      }}
      onBack={() => {
        void navigate({
          to: "/chat/$conversationId/details",
          params: { conversationId },
          ...(searchRouteHash ? { hash: searchRouteHash } : {}),
        });
      }}
      onOpenMessage={(messageId) => {
        void navigate({
          to: "/chat/$conversationId",
          params: { conversationId },
          hash: buildMobileChatRouteHash({
            highlightedMessageId: messageId,
            returnPath: safeReturnPath,
            returnHash: safeReturnHash,
          }),
          replace: true,
        });
      }}
    />
  );
}
