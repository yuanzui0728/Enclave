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
import { ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
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
  createdAt: string;
  preview: string;
  type: Exclude<HistoryFilterType, "all">;
  typeLabel: string;
};

type HistoryFilterType =
  | "all"
  | "text"
  | "system"
  | "sticker"
  | "image"
  | "file"
  | "contact_card"
  | "location_card";

type HistoryDateFilter = "all" | "today" | "7d" | "30d";

const MAX_VISIBLE_ROWS = 60;

const historyFilterLabels: Array<{
  id: HistoryFilterType;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "image", label: "图片" },
  { id: "file", label: "文件" },
  { id: "sticker", label: "表情" },
  { id: "contact_card", label: "名片" },
  { id: "location_card", label: "位置" },
  { id: "system", label: "系统" },
];

const historyDateFilterLabels: Array<{
  id: HistoryDateFilter;
  label: string;
}> = [
  { id: "all", label: "全部时间" },
  { id: "today", label: "今天" },
  { id: "7d", label: "7天内" },
  { id: "30d", label: "30天内" },
];

export function DesktopChatHistoryPanel({
  conversation,
}: DesktopChatHistoryPanelProps) {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isGroupConversation = isPersistedGroupConversation(conversation);
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<HistoryFilterType>("all");
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>("all");
  const [senderFilter, setSenderFilter] = useState("all");

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
  const senderOptions = useMemo(() => {
    if (!isGroupConversation) {
      return [];
    }

    return [...new Set(historyRows.map((row) => row.senderName))]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [historyRows, isGroupConversation]);
  const availableTypeFilters = useMemo(() => {
    const counts = historyRows.reduce<Record<Exclude<HistoryFilterType, "all">, number>>(
      (result, row) => {
        result[row.type] += 1;
        return result;
      },
      {
        text: 0,
        image: 0,
        file: 0,
        sticker: 0,
        contact_card: 0,
        location_card: 0,
        system: 0,
      },
    );

    return historyFilterLabels.filter(
      (item) => item.id === "all" || counts[item.id] > 0,
    );
  }, [historyRows]);

  const filteredRows = useMemo(() => {
    const rows = historyRows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) {
        return false;
      }

      if (senderFilter !== "all" && row.senderName !== senderFilter) {
        return false;
      }

      if (!matchesHistoryDateFilter(row.createdAt, dateFilter)) {
        return false;
      }

      if (!trimmedKeyword) {
        return true;
      }

      const senderName = row.senderName.toLowerCase();
      const preview = row.preview.toLowerCase();
      const typeLabel = row.typeLabel.toLowerCase();
      return (
        senderName.includes(trimmedKeyword) ||
        preview.includes(trimmedKeyword) ||
        typeLabel.includes(trimmedKeyword)
      );
    });

    return rows.slice(0, MAX_VISIBLE_ROWS);
  }, [dateFilter, historyRows, senderFilter, trimmedKeyword, typeFilter]);

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

        <div className="mt-3 flex flex-wrap gap-2">
          {availableTypeFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTypeFilter(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] transition",
                typeFilter === item.id
                  ? "bg-[rgba(255,138,61,0.16)] text-[color:var(--brand-primary)]"
                  : "bg-[#f5f5f5] text-[color:var(--text-muted)] hover:bg-[#eeeeee]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {historyDateFilterLabels.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDateFilter(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] transition",
                dateFilter === item.id
                  ? "bg-[rgba(59,130,246,0.14)] text-[#2563eb]"
                  : "bg-[#f5f5f5] text-[color:var(--text-muted)] hover:bg-[#eeeeee]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isGroupConversation ? (
          <div className="mt-3">
            <select
              value={senderFilter}
              onChange={(event) => setSenderFilter(event.target.value)}
              className="w-full rounded-xl border border-black/8 bg-[#f5f5f5] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-black/12 focus:bg-white"
            >
              <option value="all">全部成员</option>
              {senderOptions.map((senderName) => (
                <option key={senderName} value={senderName}>
                  {senderName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
                <div className="mt-1 flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-[rgba(255,138,61,0.10)] px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)]">
                    {row.typeLabel}
                  </span>
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  {renderHighlightedText(
                    buildSearchPreview(row.preview, trimmedKeyword),
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
    createdAt: message.createdAt,
    preview: resolveMessagePreview(message),
    type: resolveHistoryFilterType(message.type),
    typeLabel: resolveMessageTypeLabel(message.type),
  }));
}

function resolveHistoryFilterType(
  type: Message["type"] | GroupMessage["type"],
): Exclude<HistoryFilterType, "all"> {
  if (type === "proactive") {
    return "text" as const;
  }

  if (type === "system") {
    return "system" as const;
  }

  if (type === "sticker") {
    return "sticker" as const;
  }

  if (type === "image") {
    return "image" as const;
  }

  if (type === "file") {
    return "file" as const;
  }

  if (type === "contact_card") {
    return "contact_card" as const;
  }

  if (type === "location_card") {
    return "location_card" as const;
  }

  return "text" as const;
}

function resolveMessagePreview(message: Message | GroupMessage) {
  if (message.attachment?.kind === "image") {
    return message.text.trim() || `图片 · ${message.attachment.fileName}`;
  }

  if (message.attachment?.kind === "file") {
    return message.text.trim() || `文件 · ${message.attachment.fileName}`;
  }

  if (message.attachment?.kind === "contact_card") {
    return message.text.trim() || `名片 · ${message.attachment.name}`;
  }

  if (message.attachment?.kind === "location_card") {
    return message.text.trim() || `位置 · ${message.attachment.title}`;
  }

  if (message.type === "sticker" && message.attachment?.kind === "sticker") {
    return `表情 · ${message.attachment.label ?? message.attachment.stickerId}`;
  }

  return message.senderType === "user"
    ? message.text
    : sanitizeDisplayedChatText(message.text);
}

function resolveMessageTypeLabel(type: Message["type"] | GroupMessage["type"]) {
  if (type === "image") {
    return "图片";
  }

  if (type === "file") {
    return "文件";
  }

  if (type === "contact_card") {
    return "名片";
  }

  if (type === "location_card") {
    return "位置";
  }

  if (type === "sticker") {
    return "表情";
  }

  if (type === "system") {
    return "系统";
  }

  return "文本";
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

function matchesHistoryDateFilter(
  createdAt: string,
  filter: HistoryDateFilter,
) {
  if (filter === "all") {
    return true;
  }

  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return false;
  }

  const now = Date.now();

  if (filter === "today") {
    return timestamp >= startOfToday();
  }

  if (filter === "7d") {
    return timestamp >= now - 7 * 24 * 60 * 60 * 1000;
  }

  return timestamp >= now - 30 * 24 * 60 * 60 * 1000;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}
