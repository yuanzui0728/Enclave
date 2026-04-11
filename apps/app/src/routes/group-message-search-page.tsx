import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getGroup, getGroupMessages } from "@yinjie/contracts";
import { ChatMessageSearchPanel } from "../features/chat/chat-message-search-panel";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupMessageSearchPage() {
  const { groupId } = useParams({ from: "/group/$groupId/search" });
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId],
    queryFn: () => getGroupMessages(groupId, baseUrl),
  });

  useEffect(() => {
    if (groupQuery.isLoading || !isMissingGroupError(groupQuery.error, groupId)) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [groupId, groupQuery.error, groupQuery.isLoading, navigate]);

  return (
    <ChatMessageSearchPanel
      subtitle={groupQuery.data?.name ?? "群聊"}
      messages={messagesQuery.data}
      enableSenderFilter
      isLoading={messagesQuery.isLoading}
      error={
        messagesQuery.isError && messagesQuery.error instanceof Error
          ? messagesQuery.error
          : null
      }
      loadingLabel="正在读取群聊记录..."
      emptyResultTitle="没有找到相关群聊记录"
      emptyResultDescription="换个关键词试试，或者切到图片、文件、链接分类继续找。"
      onBack={() => {
        void navigate({ to: "/group/$groupId/details", params: { groupId } });
      }}
      onOpenMessage={(messageId) => {
        void navigate({
          to: "/group/$groupId",
          params: { groupId },
          hash: `chat-message-${messageId}`,
        });
      }}
    />
  );
}
