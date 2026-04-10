import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getConversationMessages,
  getGroupMessages,
  type ConversationListItem,
  type GroupMessage,
  type Message,
} from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { sanitizeDisplayedChatText } from "../../../lib/chat-text";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import { formatMessageTimestamp, parseTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopChatHistoryPanelProps = {
  conversation: ConversationListItem;
};

type HistoryRow = {
  id: string;
  senderName: string;
  text: string;
  createdAt: string;
};

const MAX_VISIBLE_ROWS = 60;

export function DesktopChatHistoryPanel({
  conversation,
}: DesktopChatHistoryPanelProps) {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");

  const messagesQuery = useQuery({
    queryKey: [
      "desktop-chat-side-history",
      baseUrl,
      conversation.id,
      conversation.type,
    ],
    queryFn: async () => {
      if (isPersistedGroupConversation(conversation)) {
        return getGroupMessages(conversation.id, baseUrl);
      }

      return getConversationMessages(conversation.id, baseUrl);
    },
  });

  const trimmedKeyword = keyword.trim().toLowerCase();
  const historyRows = useMemo(
    () =>
      normalizeHistoryRows(messagesQuery.data ?? []).sort(
        (left, right) =>
          (parseTimestamp(right.createdAt) ?? 0) -
          (parseTimestamp(left.createdAt) ?? 0),
      ),
    [messagesQuery.data],
  );
  const filteredRows = useMemo(() => {
    const rows = !trimmedKeyword
      ? historyRows
      : historyRows.filter((row) => {
          const senderName = row.senderName.toLowerCase();
          const text = row.text.toLowerCase();
          return (
            senderName.includes(trimmedKeyword) || text.includes(trimmedKeyword)
          );
        });

    return rows.slice(0, MAX_VISIBLE_ROWS);
  }, [historyRows, trimmedKeyword]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/6 bg-white px-4 py-3">
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索聊天记录"
          className="w-full rounded-xl border border-black/8 bg-[#f5f5f5] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12 focus:bg-white"
        />
        <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
          {trimmedKeyword
            ? `共命中 ${filteredRows.length} 条，按时间倒序展示`
            : `最近 ${Math.min(historyRows.length, MAX_VISIBLE_ROWS)} 条聊天记录`}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {messagesQuery.isLoading ? (
          <div className="px-4 py-4">
            <LoadingBlock label="正在读取聊天记录..." />
          </div>
        ) : null}
        {messagesQuery.isError && messagesQuery.error instanceof Error ? (
          <div className="px-4 py-4">
            <ErrorBlock message={messagesQuery.error.message} />
          </div>
        ) : null}

        {!messagesQuery.isLoading &&
        !messagesQuery.isError &&
        !historyRows.length ? (
          <div className="px-6 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
            当前会话还没有聊天记录。
          </div>
        ) : null}

        {!messagesQuery.isLoading &&
        !messagesQuery.isError &&
        historyRows.length > 0 &&
        !filteredRows.length ? (
          <div className="px-6 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
            没有找到匹配的聊天记录。
          </div>
        ) : null}

        {filteredRows.length ? (
          <div className="divide-y divide-black/6 bg-white">
            {filteredRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  if (isPersistedGroupConversation(conversation)) {
                    void navigate({
                      to: "/group/$groupId",
                      params: { groupId: conversation.id },
                      hash: `chat-message-${row.id}`,
                    });
                    return;
                  }

                  void navigate({
                    to: "/chat/$conversationId",
                    params: { conversationId: conversation.id },
                    hash: `chat-message-${row.id}`,
                  });
                }}
                className="block w-full px-4 py-3 text-left transition hover:bg-[#f7f7f7]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                    {row.senderName}
                  </div>
                  <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                    {formatMessageTimestamp(row.createdAt)}
                  </div>
                </div>
                <div className="mt-1 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(
                    buildSearchPreview(row.text, trimmedKeyword),
                    trimmedKeyword,
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeHistoryRows(messages: Array<Message | GroupMessage>): HistoryRow[] {
  return messages.map((message) => ({
    id: message.id,
    senderName: message.senderName,
    text:
      message.senderType === "user"
        ? message.text
        : sanitizeDisplayedChatText(message.text),
    createdAt: message.createdAt,
  }));
}

function renderHighlightedText(text: string, keyword: string) {
  if (!keyword) {
    return text;
  }

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
  if (!keyword) {
    return text;
  }

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
