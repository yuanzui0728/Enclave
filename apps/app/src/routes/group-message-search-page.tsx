import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { getGroup, getGroupMessages } from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { formatMessageTimestamp, parseTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupMessageSearchPage() {
  const { groupId } = useParams({ from: "/group/$groupId/search" });
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId],
    queryFn: () => getGroupMessages(groupId, baseUrl),
  });

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
      subtitle={groupQuery.data?.name ?? "群聊"}
      onBack={() => {
        void navigate({ to: "/group/$groupId/details", params: { groupId } });
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
        <LoadingBlock label="正在读取群聊记录..." />
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
            description="支持按群聊文本搜索，结果按时间倒序展示。"
          />
        </div>
      ) : null}

      {!messagesQuery.isLoading &&
      !messagesQuery.isError &&
      trimmedKeyword &&
      !results.length ? (
        <div className="px-3">
          <EmptyState
            title="没有找到相关群聊记录"
            description="换个关键词试试，或者返回群聊信息页。"
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
                    to: "/group/$groupId",
                    params: { groupId },
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
                  {renderHighlightedText(message.text, trimmedKeyword)}
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
