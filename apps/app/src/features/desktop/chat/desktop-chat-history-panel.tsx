import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getConversationMessages,
  getGroupMessages,
  type ConversationListItem,
  type GroupMessage,
  type Message,
} from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "../../chat/local-chat-message-actions";
import { useMessageReminders } from "../../chat/use-message-reminders";
import { sanitizeDisplayedChatText } from "../../../lib/chat-text";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import {
  formatDetailedMessageTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopChatHistoryPanelProps = {
  conversation: ConversationListItem;
};

type HistoryRow = {
  id: string;
  senderName: string;
  createdAt: string;
  preview: string;
  reminderAt?: string;
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
  | "voice"
  | "contact_card"
  | "location_card";

type HistoryDateFilter = "all" | "today" | "7d" | "30d";

type HistoryDateSection = {
  key: string;
  label: string;
  rows: HistoryRow[];
};

const MAX_VISIBLE_ROWS = 60;
const INITIAL_HISTORY_LIMIT = 80;
const HISTORY_LIMIT_STEP = 80;

const historyFilterLabels: Array<{
  id: HistoryFilterType;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "image", label: "图片" },
  { id: "file", label: "文件" },
  { id: "voice", label: "语音" },
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
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders } = useMessageReminders();
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<HistoryFilterType>("all");
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>("all");
  const [specificDate, setSpecificDate] = useState("");
  const [senderFilter, setSenderFilter] = useState("all");
  const [historyLimit, setHistoryLimit] = useState(INITIAL_HISTORY_LIMIT);

  useEffect(() => {
    setKeyword("");
    setTypeFilter("all");
    setDateFilter("all");
    setHistoryLimit(INITIAL_HISTORY_LIMIT);
    setSpecificDate("");
    setSenderFilter("all");
  }, [conversation.id]);

  const messagesQuery = useQuery({
    queryKey: [
      "desktop-chat-side-history",
      baseUrl,
      conversation.id,
      conversation.type,
      historyLimit,
    ],
    queryFn: async () => {
      if (isPersistedGroupConversation(conversation)) {
        return getGroupMessages(conversation.id, baseUrl, {
          limit: historyLimit,
        });
      }

      return getConversationMessages(conversation.id, baseUrl, {
        limit: historyLimit,
      });
    },
    placeholderData: (previousData) => previousData ?? [],
  });

  const trimmedKeyword = keyword.trim().toLowerCase();
  const historyRows = useMemo(
    () =>
      normalizeHistoryRows(
        filterSearchableChatMessages(
          (messagesQuery.data ?? []) as Array<Message | GroupMessage>,
          localMessageActionState,
        ),
        reminders,
      ).sort(
        (left, right) =>
          (parseTimestamp(right.createdAt) ?? 0) -
          (parseTimestamp(left.createdAt) ?? 0),
      ),
    [localMessageActionState, messagesQuery.data, reminders],
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
    const counts = historyRows.reduce<
      Record<Exclude<HistoryFilterType, "all">, number>
    >(
      (result, row) => {
        result[row.type] += 1;
        return result;
      },
      {
        text: 0,
        image: 0,
        file: 0,
        voice: 0,
        sticker: 0,
        contact_card: 0,
        location_card: 0,
        system: 0,
      },
    );

    return historyFilterLabels.filter(
      (item) => item.id === "all" || counts[item.id as keyof typeof counts] > 0,
    );
  }, [historyRows]);

  const filteredRows = useMemo(() => {
    return historyRows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) {
        return false;
      }

      if (senderFilter !== "all" && row.senderName !== senderFilter) {
        return false;
      }

      if (!matchesHistoryDateFilter(row.createdAt, dateFilter)) {
        return false;
      }

      if (
        specificDate &&
        !matchesSpecificHistoryDate(row.createdAt, specificDate)
      ) {
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
  }, [
    dateFilter,
    historyRows,
    senderFilter,
    specificDate,
    trimmedKeyword,
    typeFilter,
  ]);
  const visibleRows = useMemo(
    () => filteredRows.slice(0, MAX_VISIBLE_ROWS),
    [filteredRows],
  );
  const visibleSections = useMemo(
    () => buildHistoryDateSections(visibleRows),
    [visibleRows],
  );
  const activeFilterCount =
    (trimmedKeyword ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (dateFilter !== "all" ? 1 : 0) +
    (specificDate ? 1 : 0) +
    (senderFilter !== "all" ? 1 : 0);
  const reminderCount = historyRows.filter((row) =>
    Boolean(row.reminderAt),
  ).length;
  const hasActiveFilters = activeFilterCount > 0;
  const isPartialResult = filteredRows.length > visibleRows.length;
  const mayHaveEarlierMessages =
    historyRows.length > 0 && historyRows.length >= historyLimit;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/6 bg-[#f7f7f7] px-4 py-3">
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索聊天记录"
          className="h-9 w-full rounded-[10px] border border-black/8 bg-white px-3 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            <HistoryStatPill label={`当前范围 ${historyRows.length} 条`} />
            <HistoryStatPill
              label={
                trimmedKeyword || hasActiveFilters
                  ? `命中 ${filteredRows.length} 条`
                  : `可浏览 ${filteredRows.length} 条`
              }
              tone="brand"
            />
            {reminderCount ? (
              <HistoryStatPill label={`提醒 ${reminderCount} 条`} tone="blue" />
            ) : null}
            {hasActiveFilters ? (
              <HistoryStatPill label={`筛选 ${activeFilterCount} 项`} />
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (isPersistedGroupConversation(conversation)) {
                void navigate({
                  to: "/group/$groupId/search",
                  params: { groupId: conversation.id },
                });
                return;
              }

              void navigate({
                to: "/chat/$conversationId/search",
                params: { conversationId: conversation.id },
              });
            }}
            className="h-8 shrink-0 rounded-[8px] border-black/8 bg-white px-3 text-[12px] shadow-none hover:bg-[#efefef]"
          >
            完整搜索
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
        <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
          {trimmedKeyword
            ? `已在当前加载的 ${historyRows.length} 条里命中 ${filteredRows.length} 条`
            : `已加载最近 ${historyRows.length} 条聊天记录`}
        </div>
        {mayHaveEarlierMessages ? (
          <div className="mt-1 text-[12px] text-[color:var(--text-dim)]">
            继续扩大检索范围可查看更早消息；需要全量历史时可直接进入完整搜索。
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {availableTypeFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTypeFilter(item.id)}
              className={cn(
                "rounded-[8px] border px-3 py-1.5 text-[12px] transition",
                typeFilter === item.id
                  ? "border-[#d6d6d6] bg-white text-[color:var(--text-primary)]"
                  : "border-transparent bg-[#ececec] text-[color:var(--text-muted)] hover:border-black/6 hover:bg-[#e6e6e6]",
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
              onClick={() => {
                setDateFilter(item.id);
                setSpecificDate("");
              }}
              className={cn(
                "rounded-[8px] border px-3 py-1.5 text-[12px] transition",
                dateFilter === item.id
                  ? "border-[#d6d6d6] bg-white text-[color:var(--text-primary)]"
                  : "border-transparent bg-[#ececec] text-[color:var(--text-muted)] hover:border-black/6 hover:bg-[#e6e6e6]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="date"
            value={specificDate}
            onChange={(event) => {
              setSpecificDate(event.target.value);
              if (event.target.value) {
                setDateFilter("all");
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-[10px] border border-black/8 bg-white px-3 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-black/12"
          />
          {specificDate ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSpecificDate("")}
              className="h-8 shrink-0 rounded-[8px] border-black/8 bg-white px-3 text-[12px] shadow-none hover:bg-[#efefef]"
            >
              清除日期
            </Button>
          ) : null}
        </div>
        {specificDate ? (
          <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
            当前按 {specificDate} 精确筛选聊天记录。
          </div>
        ) : null}

        {isGroupConversation ? (
          <div className="mt-3 flex items-center gap-2">
            <select
              value={senderFilter}
              onChange={(event) => setSenderFilter(event.target.value)}
              className="min-w-0 flex-1 rounded-[10px] border border-black/8 bg-white px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-black/12"
            >
              <option value="all">全部成员</option>
              {senderOptions.map((senderName) => (
                <option key={senderName} value={senderName}>
                  {senderName}
                </option>
              ))}
            </select>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setKeyword("");
                  setTypeFilter("all");
                  setDateFilter("all");
                  setSpecificDate("");
                  setSenderFilter("all");
                }}
                className="h-8 shrink-0 rounded-[8px] border-black/8 bg-white px-3 text-[12px] shadow-none hover:bg-[#efefef]"
              >
                清空筛选
              </Button>
            ) : null}
          </div>
        ) : null}
        {!isGroupConversation && hasActiveFilters ? (
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setKeyword("");
                setTypeFilter("all");
                setDateFilter("all");
                setSpecificDate("");
              }}
              className="h-8 rounded-[8px] border-black/8 bg-white px-3 text-[12px] shadow-none hover:bg-[#efefef]"
            >
              清空筛选
            </Button>
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
        !visibleRows.length ? (
          <div className="px-6 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
            当前筛选范围内没有匹配消息。可扩大检索范围，或进入完整搜索继续查找。
          </div>
        ) : null}

        {visibleSections.length ? (
          <div className="bg-white">
            {visibleSections.map((section) => (
              <section key={section.key}>
                <div className="sticky top-0 z-[1] border-y border-black/6 bg-[#f6f6f6] px-4 py-2 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                  {section.label}
                </div>
                <div className="divide-y divide-black/6">
                  {section.rows.map((row) => (
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
                      className="block w-full px-4 py-3 text-left transition hover:bg-[#f8f8f8]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                          {row.senderName}
                        </div>
                        <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                          {formatDetailedMessageTimestamp(row.createdAt)}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="shrink-0 rounded-[7px] bg-[#f1f3f5] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                          {row.typeLabel}
                        </span>
                        {row.reminderAt ? (
                          <span className="shrink-0 rounded-[7px] bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-[10px] text-[#2563eb]">
                            提醒 · {formatMessageTimestamp(row.reminderAt)}
                          </span>
                        ) : null}
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
              </section>
            ))}
            {isPartialResult ? (
              <div className="border-t border-black/6 bg-[#f6f6f6] px-4 py-3 text-[12px] text-[color:var(--text-muted)]">
                当前仅展示前 {MAX_VISIBLE_ROWS}{" "}
                条命中结果，可继续扩大检索范围或进入完整搜索。
              </div>
            ) : null}
          </div>
        ) : null}

        {!messagesQuery.isLoading && historyRows.length > 0 ? (
          <div className="border-t border-black/6 bg-[#f3f3f3] px-4 py-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setHistoryLimit((current) => current + HISTORY_LIMIT_STEP)
              }
              disabled={messagesQuery.isFetching || !mayHaveEarlierMessages}
              className="h-8 w-full rounded-[8px] border-black/8 bg-white text-[12px] shadow-none hover:bg-[#efefef]"
            >
              {messagesQuery.isFetching
                ? "正在加载更早消息..."
                : mayHaveEarlierMessages
                  ? hasActiveFilters
                    ? `扩大检索范围（当前 ${historyRows.length} 条）`
                    : `加载更早消息（当前 ${historyRows.length} 条）`
                  : "已全部加载"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeHistoryRows(
  messages: Array<Message | GroupMessage>,
  reminders: Array<{ messageId: string; remindAt: string }>,
): HistoryRow[] {
  const reminderMap = new Map(
    reminders.map((item) => [item.messageId, item.remindAt]),
  );

  return messages.map((message) => ({
    id: message.id,
    senderName: message.senderName || "消息",
    createdAt: message.createdAt,
    preview: resolveMessagePreview(message),
    reminderAt: reminderMap.get(message.id),
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

  if (message.attachment?.kind === "voice") {
    return message.text.trim() || "语音";
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

  if (type === "voice") {
    return "语音";
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
      <mark className="rounded-[4px] bg-[rgba(250,204,21,0.28)] px-0.5 text-current">
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

function matchesSpecificHistoryDate(createdAt: string, specificDate: string) {
  if (!specificDate) {
    return true;
  }

  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return false;
  }

  const date = new Date(`${specificDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const dayStart = date.getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return timestamp >= dayStart && timestamp < dayEnd;
}

function buildHistoryDateSections(rows: HistoryRow[]): HistoryDateSection[] {
  const sections: HistoryDateSection[] = [];

  rows.forEach((row) => {
    const key = resolveHistoryDateSectionKey(row.createdAt);
    const lastSection = sections.at(-1);

    if (lastSection?.key === key) {
      lastSection.rows.push(row);
      return;
    }

    sections.push({
      key,
      label: resolveHistoryDateSectionLabel(row.createdAt),
      rows: [row],
    });
  });

  return sections;
}

function resolveHistoryDateSectionKey(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "unknown";
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveHistoryDateSectionLabel(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "未知时间";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) {
    return "今天";
  }

  if (isSameDay(date, yesterday)) {
    return "昨天";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function HistoryStatPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "brand" | "blue";
}) {
  return (
    <span
      className={cn(
        "rounded-[7px] px-2.5 py-1 text-[11px]",
        tone === "brand" && "bg-[#ededed] text-[color:var(--text-primary)]",
        tone === "blue" && "bg-[rgba(59,130,246,0.10)] text-[#2563eb]",
        tone === "neutral" && "bg-[#ededed] text-[color:var(--text-muted)]",
      )}
    >
      {label}
    </span>
  );
}
