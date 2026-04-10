import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { getConversationMessages, getConversations } from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { formatMessageTimestamp, parseTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ChatMessageSearchPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/search",
  });
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");

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
  const trimmedKeyword = keyword.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmedKeyword) {
      return [];
    }

    return [...(messagesQuery.data ?? [])]
      .filter((item) => item.text.toLowerCase().includes(trimmedKeyword))
      .sort(
        (left, right) =>
          (parseTimestamp(right.createdAt) ?? 0) -
          (parseTimestamp(left.createdAt) ?? 0),
      );
  }, [messagesQuery.data, trimmedKeyword]);

  return (
    <ChatDetailsShell
      title="查找聊天记录"
      subtitle={conversationTitle}
      onBack={() => {
        void navigate({
          to: "/chat/$conversationId/details",
          params: { conversationId },
        });
      }}
    >
      <ChatDetailsSection title="搜索">
        <label className="flex items-center gap-2 px-3 py-3">
          <Search size={16} className="shrink-0 text-[color:var(--text-dim)]" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
        </label>
      </ChatDetailsSection>

      {messagesQuery.isLoading ? (
        <LoadingBlock label="正在读取聊天记录..." />
      ) : null}
      {messagesQuery.isError && messagesQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={messagesQuery.error.message} />
        </div>
      ) : null}

      {!messagesQuery.isLoading && !messagesQuery.isError && !trimmedKeyword ? (
        <div className="px-3">
          <EmptyState
            title="输入关键词开始搜索"
            description="支持按聊天文本搜索，表情和附件会按兜底文案参与匹配。"
          />
        </div>
      ) : null}

      {!messagesQuery.isLoading &&
      !messagesQuery.isError &&
      trimmedKeyword &&
      !results.length ? (
        <div className="px-3">
          <EmptyState
            title="没有找到相关聊天记录"
            description="换个关键词试试，或者返回聊天详情页。"
          />
        </div>
      ) : null}

      {results.length ? (
        <ChatDetailsSection title={`搜索结果 · ${results.length} 条`}>
          <div className="divide-y divide-black/5">
            {results.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId",
                    params: { conversationId },
                    hash: `chat-message-${message.id}`,
                  });
                }}
                className="block w-full px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                    {message.senderName}
                  </div>
                  <div className="shrink-0 text-[12px] text-[color:var(--text-muted)]">
                    {formatMessageTimestamp(message.createdAt)}
                  </div>
                </div>
                <div className="mt-1 text-[14px] leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(
                    buildSearchPreview(message.text, trimmedKeyword),
                    trimmedKeyword,
                  )}
                </div>
              </button>
            ))}
          </div>
        </ChatDetailsSection>
      ) : null}
    </ChatDetailsShell>
  );
}

function renderHighlightedText(text: string, keyword: string) {
  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword);
  if (start === -1) {
    return text;
  }

  const end = start + keyword.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-[rgba(255,214,102,0.5)] px-0.5 text-current">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function buildSearchPreview(text: string, keyword: string) {
  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword);
  if (start === -1) {
    return text;
  }

  const contextRadius = 18;
  const previewStart = Math.max(0, start - contextRadius);
  const previewEnd = Math.min(
    text.length,
    start + keyword.length + contextRadius,
  );
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd)}${suffix}`;
}
