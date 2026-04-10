import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getConversationMessages, getConversations } from "@yinjie/contracts";
import { ChatMessageSearchPanel } from "../features/chat/chat-message-search-panel";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ChatMessageSearchPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/search",
  });
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId],
    queryFn: () => getConversationMessages(conversationId, baseUrl),
  });

  const conversationTitle =
    conversationsQuery.data?.find((item) => item.id === conversationId)
      ?.title ?? "聊天记录";

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
      onBack={() => {
        void navigate({
          to: "/chat/$conversationId/details",
          params: { conversationId },
        });
      }}
      onOpenMessage={(messageId) => {
        void navigate({
          to: "/chat/$conversationId",
          params: { conversationId },
          hash: `chat-message-${messageId}`,
        });
      }}
    />
  );
}
