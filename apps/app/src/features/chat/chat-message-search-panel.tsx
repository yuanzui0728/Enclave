import { useMemo, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Link2,
  MessageSquareText,
  Search,
} from "lucide-react";
import type { GroupMessage, Message } from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../../components/empty-state";
import { ChatDetailsSection } from "../chat-details/chat-details-section";
import { ChatDetailsShell } from "../chat-details/chat-details-shell";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "./local-chat-message-actions";
import { useMessageReminders } from "./use-message-reminders";
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import {
  formatDetailedMessageTimestamp,
  formatMessageTimestamp,
  parseTimestamp,
} from "../../lib/format";

type SearchableChatMessage = Message | GroupMessage;
type SearchCategoryId = "all" | "media" | "files" | "links";
type SearchDateFilter = "all" | "today" | "7d" | "30d";
type SearchMessageTypeFilter =
  | "all"
  | "text"
  | "system"
  | "sticker"
  | "image"
  | "file"
  | "voice"
  | "contact_card"
  | "location_card";

type IndexedSearchMessage = {
  message: SearchableChatMessage;
  categories: SearchCategoryId[];
  messageType: Exclude<SearchMessageTypeFilter, "all">;
  searchableText: string;
  previewText: string;
  supportText: string;
  linkText: string;
  typeLabel: string;
  reminderAt?: string;
};

type SearchResultSection = {
  key: string;
  label: string;
  items: IndexedSearchMessage[];
};

const MAX_VISIBLE_RESULTS = 80;

const SEARCH_DATE_FILTERS: Array<{
  id: SearchDateFilter;
  label: string;
}> = [
  { id: "all", label: "全部时间" },
  { id: "today", label: "今天" },
  { id: "7d", label: "7天内" },
  { id: "30d", label: "30天内" },
];

const SEARCH_MESSAGE_TYPE_FILTERS: Array<{
  id: SearchMessageTypeFilter;
  label: string;
}> = [
  { id: "all", label: "全部类型" },
  { id: "text", label: "文本" },
  { id: "image", label: "图片" },
  { id: "file", label: "文件" },
  { id: "voice", label: "语音" },
  { id: "sticker", label: "表情" },
  { id: "contact_card", label: "名片" },
  { id: "location_card", label: "位置" },
  { id: "system", label: "系统" },
];

type ChatMessageSearchPanelProps = {
  subtitle: string;
  messages: SearchableChatMessage[] | undefined;
  enableSenderFilter?: boolean;
  isLoading: boolean;
  error?: Error | null;
  loadingLabel: string;
  emptyResultTitle: string;
  emptyResultDescription: string;
  onBack: () => void;
  onOpenMessage: (messageId: string) => void;
};

const urlPattern = /https?:\/\/[^\s]+/giu;

const SEARCH_CATEGORIES = [
  {
    id: "all",
    label: "全部消息",
    shortLabel: "全部",
    description: "搜文本、附件和系统提示",
    icon: MessageSquareText,
  },
  {
    id: "media",
    label: "图片与视频",
    shortLabel: "图片与视频",
    description: "先按图片消息聚合浏览",
    icon: ImageIcon,
  },
  {
    id: "files",
    label: "文件",
    shortLabel: "文件",
    description: "按文件名和文件消息筛选",
    icon: FileText,
  },
  {
    id: "links",
    label: "链接",
    shortLabel: "链接",
    description: "把聊天里的 URL 单独拎出来",
    icon: Link2,
  },
] as const satisfies ReadonlyArray<{
  id: SearchCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof MessageSquareText;
}>;

export function ChatMessageSearchPanel({
  subtitle,
  messages,
  enableSenderFilter = false,
  isLoading,
  error,
  loadingLabel,
  emptyResultTitle,
  emptyResultDescription,
  onBack,
  onOpenMessage,
}: ChatMessageSearchPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategoryId>("all");
  const [senderFilter, setSenderFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<SearchDateFilter>("all");
  const [messageTypeFilter, setMessageTypeFilter] =
    useState<SearchMessageTypeFilter>("all");
  const [specificDate, setSpecificDate] = useState("");
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders } = useMessageReminders();
  const reminderMap = useMemo(
    () => new Map(reminders.map((item) => [item.messageId, item])),
    [reminders],
  );

  const trimmedKeyword = keyword.trim().toLowerCase();
  const indexedMessages = useMemo(
    () =>
      [...filterSearchableChatMessages(messages ?? [], localMessageActionState)]
        .sort(
          (left, right) =>
            (parseTimestamp(right.createdAt) ?? 0) -
            (parseTimestamp(left.createdAt) ?? 0),
        )
        .map((message) =>
          buildIndexedSearchMessage(message, reminderMap.get(message.id)),
        ),
    [localMessageActionState, messages, reminderMap],
  );

  const matchedMessages = useMemo(() => {
    return indexedMessages.filter((item) => {
      if (
        enableSenderFilter &&
        senderFilter !== "all" &&
        (item.message.senderName || "消息") !== senderFilter
      ) {
        return false;
      }

      if (
        messageTypeFilter !== "all" &&
        item.messageType !== messageTypeFilter
      ) {
        return false;
      }

      if (!matchesSearchDateFilter(item.message.createdAt, dateFilter)) {
        return false;
      }

      if (
        specificDate &&
        !matchesSpecificSearchDate(item.message.createdAt, specificDate)
      ) {
        return false;
      }

      if (!trimmedKeyword) {
        return true;
      }

      return item.searchableText.includes(trimmedKeyword);
    });
  }, [
    dateFilter,
    enableSenderFilter,
    indexedMessages,
    messageTypeFilter,
    senderFilter,
    specificDate,
    trimmedKeyword,
  ]);
  const senderOptions = useMemo(() => {
    if (!enableSenderFilter) {
      return [];
    }

    return Array.from(
      new Set(indexedMessages.map((item) => item.message.senderName || "消息")),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [enableSenderFilter, indexedMessages]);
  const availableMessageTypeFilters = useMemo(() => {
    const counts = indexedMessages.reduce<
      Record<Exclude<SearchMessageTypeFilter, "all">, number>
    >(
      (result, item) => {
        result[item.messageType] += 1;
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

    return SEARCH_MESSAGE_TYPE_FILTERS.filter(
      (item) => item.id === "all" || counts[item.id as keyof typeof counts] > 0,
    );
  }, [indexedMessages]);

  const categoryCounts = useMemo(() => {
    return SEARCH_CATEGORIES.reduce<Record<SearchCategoryId, number>>(
      (result, category) => {
        result[category.id] = matchedMessages.filter((item) =>
          item.categories.includes(category.id),
        ).length;
        return result;
      },
      {
        all: 0,
        media: 0,
        files: 0,
        links: 0,
      },
    );
  }, [matchedMessages]);

  const results = useMemo(() => {
    return matchedMessages.filter((item) =>
      item.categories.includes(activeCategory),
    );
  }, [activeCategory, matchedMessages]);
  const visibleResults = useMemo(
    () => results.slice(0, MAX_VISIBLE_RESULTS),
    [results],
  );
  const resultSections = useMemo(
    () => buildSearchResultSections(visibleResults),
    [visibleResults],
  );
  const reminderCount = indexedMessages.filter((item) =>
    Boolean(item.reminderAt),
  ).length;
  const isKeywordSearch = Boolean(trimmedKeyword);
  const isPartialResult = results.length > visibleResults.length;
  const activeFilterCount =
    (trimmedKeyword ? 1 : 0) +
    (senderFilter !== "all" ? 1 : 0) +
    (messageTypeFilter !== "all" ? 1 : 0) +
    (dateFilter !== "all" ? 1 : 0) +
    (specificDate ? 1 : 0);

  const activeCategoryMeta =
    SEARCH_CATEGORIES.find((item) => item.id === activeCategory) ??
    SEARCH_CATEGORIES[0];

  return (
    <ChatDetailsShell title="查找聊天记录" subtitle={subtitle} onBack={onBack}>
      <ChatDetailsSection title="搜索">
        <div className="px-3 py-3">
          <label className="flex items-center gap-2 rounded-[10px] border border-black/8 bg-white px-3 py-2.5">
            <Search
              size={16}
              className="shrink-0 text-[color:var(--text-dim)]"
            />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <SearchStatPill label={`当前范围 ${indexedMessages.length} 条`} />
            <SearchStatPill
              label={
                isKeywordSearch
                  ? `搜索命中 ${results.length} 条`
                  : `当前分类 ${results.length} 条`
              }
              tone="brand"
            />
            {reminderCount ? (
              <SearchStatPill label={`提醒 ${reminderCount} 条`} tone="blue" />
            ) : null}
            {senderFilter !== "all" ? (
              <SearchStatPill label={`成员 ${senderFilter}`} />
            ) : null}
            {messageTypeFilter !== "all" ? (
              <SearchStatPill
                label={`类型 ${
                  SEARCH_MESSAGE_TYPE_FILTERS.find(
                    (item) => item.id === messageTypeFilter,
                  )?.label ?? "消息"
                }`}
              />
            ) : null}
            {specificDate ? (
              <SearchStatPill label={`日期 ${specificDate}`} />
            ) : dateFilter !== "all" ? (
              <SearchStatPill
                label={
                  SEARCH_DATE_FILTERS.find((item) => item.id === dateFilter)
                    ?.label ?? "时间筛选"
                }
              />
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SEARCH_DATE_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDateFilter(item.id);
                  setSpecificDate("");
                }}
                className={cn(
                  "rounded-[8px] border px-3 py-1.5 text-[12px] transition",
                  dateFilter === item.id && !specificDate
                    ? "border-[#d6d6d6] bg-white text-[color:var(--text-primary)]"
                    : "border-transparent bg-[#ececec] text-[color:var(--text-muted)] hover:border-black/6 hover:bg-[#e6e6e6]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableMessageTypeFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMessageTypeFilter(item.id)}
                className={cn(
                  "rounded-[8px] border px-3 py-1.5 text-[12px] transition",
                  messageTypeFilter === item.id
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
              className="min-w-0 flex-1 rounded-[10px] border border-black/8 bg-white px-3 py-2 text-[14px] text-[color:var(--text-primary)] outline-none transition focus:border-black/12"
            />
            {enableSenderFilter ? (
              <select
                value={senderFilter}
                onChange={(event) => setSenderFilter(event.target.value)}
                className="min-w-0 flex-1 rounded-[10px] border border-black/8 bg-white px-3 py-2 text-[14px] text-[color:var(--text-primary)] outline-none transition focus:border-black/12"
              >
                <option value="all">全部成员</option>
                {senderOptions.map((senderName) => (
                  <option key={senderName} value={senderName}>
                    {senderName}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {activeFilterCount ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setKeyword("");
                  setSenderFilter("all");
                  setMessageTypeFilter("all");
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
      </ChatDetailsSection>

      {isLoading ? <LoadingBlock label={loadingLabel} /> : null}
      {error ? (
        <div className="px-3">
          <ErrorBlock message={error.message} />
        </div>
      ) : null}

      {!isLoading && !error ? (
        <>
          {!indexedMessages.length ? (
            <div className="px-3">
              <EmptyState
                title="当前会话还没有聊天记录"
                description="等有消息后，这里会按关键词、图片、文件和链接帮你集中查找。"
              />
            </div>
          ) : null}

          <ChatDetailsSection title="分类浏览">
            <div className="grid grid-cols-2 gap-2 p-3">
              {SEARCH_CATEGORIES.map((category) => {
                const Icon = category.icon;
                const active = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "rounded-[12px] border px-3 py-3 text-left transition-colors",
                      active
                        ? "border-black/8 bg-white"
                        : "border-black/6 bg-[#f6f6f6] hover:bg-[#efefef]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-[10px]",
                            active
                              ? "bg-[#07c160] text-white"
                              : "bg-white text-[color:var(--text-secondary)]",
                          )}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                            {category.label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                            {category.description}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[18px] font-semibold leading-none text-[color:var(--text-primary)]">
                          {categoryCounts[category.id]}
                        </div>
                        <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                          条
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ChatDetailsSection>

          {!trimmedKeyword &&
          indexedMessages.length > 0 &&
          senderFilter === "all" &&
          messageTypeFilter === "all" &&
          activeCategory !== "all" &&
          categoryCounts[activeCategory] === 0 ? (
            <div className="px-3">
              <EmptyState
                title={`还没有${activeCategoryMeta.shortLabel}`}
                description={`当前会话里暂时没有可浏览的${activeCategoryMeta.shortLabel}消息。`}
              />
            </div>
          ) : null}

          {trimmedKeyword && !results.length ? (
            <div className="px-3">
              <EmptyState
                title={emptyResultTitle}
                description={emptyResultDescription}
              />
            </div>
          ) : null}

          {!trimmedKeyword &&
          !specificDate &&
          dateFilter === "all" &&
          senderFilter !== "all" &&
          !results.length ? (
            <div className="px-3">
              <EmptyState
                title={`没有来自 ${senderFilter} 的${activeCategoryMeta.shortLabel}`}
                description="换个成员试试，或者切回全部成员继续浏览。"
              />
            </div>
          ) : null}

          {!trimmedKeyword &&
          !specificDate &&
          dateFilter === "all" &&
          senderFilter === "all" &&
          messageTypeFilter !== "all" &&
          !results.length ? (
            <div className="px-3">
              <EmptyState
                title={`没有匹配的${
                  SEARCH_MESSAGE_TYPE_FILTERS.find(
                    (item) => item.id === messageTypeFilter,
                  )?.label ?? "消息"
                }`}
                description="换个消息类型试试，或者切回全部类型继续浏览。"
              />
            </div>
          ) : null}

          {!trimmedKeyword &&
          (dateFilter !== "all" || specificDate) &&
          !results.length ? (
            <div className="px-3">
              <EmptyState
                title="这个时间范围内没有匹配消息"
                description="换个时间试试，或者清空时间筛选继续浏览。"
              />
            </div>
          ) : null}

          {resultSections.length ? (
            <ChatDetailsSection
              title={buildResultSectionTitle(
                activeCategoryMeta.shortLabel,
                trimmedKeyword,
                results.length,
              )}
            >
              <div>
                {resultSections.map((section) => (
                  <section key={section.key}>
                    <div className="sticky top-0 z-[1] border-y border-black/5 bg-[#f6f6f6] px-4 py-2 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                      {section.label}
                    </div>
                    <div className="divide-y divide-black/5">
                      {section.items.map((item) => (
                        <button
                          key={item.message.id}
                          type="button"
                          onClick={() => onOpenMessage(item.message.id)}
                          className="block w-full px-4 py-3 text-left transition hover:bg-[#f8f8f8]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                              {trimmedKeyword
                                ? renderHighlightedText(
                                    item.message.senderName || "消息",
                                    trimmedKeyword,
                                  )
                                : item.message.senderName || "消息"}
                            </div>
                            <div className="shrink-0 text-[12px] text-[color:var(--text-muted)]">
                              {formatDetailedMessageTimestamp(
                                item.message.createdAt,
                              )}
                            </div>
                          </div>
                          <div className="mt-1 text-[14px] leading-6 text-[color:var(--text-secondary)]">
                            {trimmedKeyword
                              ? renderHighlightedText(
                                  buildSearchPreview(
                                    resolvePreviewSource(item, trimmedKeyword),
                                    trimmedKeyword,
                                  ),
                                  trimmedKeyword,
                                )
                              : item.previewText}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                            <span className="rounded-[7px] bg-[#f1f3f5] px-2 py-0.5 text-[11px] text-[color:var(--text-secondary)]">
                              {item.typeLabel}
                            </span>
                            {item.reminderAt ? (
                              <span className="rounded-[7px] bg-[rgba(59,130,246,0.10)] px-2 py-0.5 text-[11px] text-[#2563eb]">
                                提醒 · {formatMessageTimestamp(item.reminderAt)}
                              </span>
                            ) : null}
                            {item.supportText &&
                            item.supportText !== item.previewText &&
                            item.supportText !== item.typeLabel ? (
                              <span className="truncate">
                                {trimmedKeyword
                                  ? renderHighlightedText(
                                      item.supportText,
                                      trimmedKeyword,
                                    )
                                  : item.supportText}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                {isPartialResult ? (
                  <div className="border-t border-black/5 bg-[#f6f6f6] px-4 py-3 text-[12px] text-[color:var(--text-muted)]">
                    当前仅展示前 {MAX_VISIBLE_RESULTS}{" "}
                    条结果，请继续缩小范围查找。
                  </div>
                ) : null}
              </div>
            </ChatDetailsSection>
          ) : null}
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

function buildIndexedSearchMessage(
  message: SearchableChatMessage,
  reminder?: { remindAt: string },
): IndexedSearchMessage {
  const normalizedText = sanitizeDisplayedChatText(message.text).trim();
  const supportText = resolveSupportText(message);
  const linkText = extractFirstLink(normalizedText);
  const typeLabel = resolveMessageTypeLabel(message);
  const messageType = resolveMessageTypeFilter(message);
  const categories: SearchCategoryId[] = ["all"];

  if (message.type === "image") {
    categories.push("media");
  }

  if (message.type === "file") {
    categories.push("files");
  }

  if (linkText) {
    categories.push("links");
  }

  const previewText =
    normalizedText ||
    supportText ||
    `${typeLabel}消息`.replace("文本消息", "文本");
  const searchableText = [
    message.senderName,
    normalizedText,
    supportText,
    linkText,
    typeLabel,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return {
    message,
    categories,
    messageType,
    searchableText,
    previewText,
    supportText,
    linkText,
    typeLabel,
    reminderAt: reminder?.remindAt,
  };
}

function resolveMessageTypeFilter(
  message: SearchableChatMessage,
): Exclude<SearchMessageTypeFilter, "all"> {
  if (message.type === "proactive") {
    return "text";
  }

  if (message.type === "system") {
    return "system";
  }

  if (message.type === "sticker") {
    return "sticker";
  }

  if (message.type === "image") {
    return "image";
  }

  if (message.type === "file") {
    return "file";
  }

  if (message.type === "voice") {
    return "voice";
  }

  if (message.type === "contact_card") {
    return "contact_card";
  }

  if (message.type === "location_card") {
    return "location_card";
  }

  return "text";
}

function resolveSupportText(message: SearchableChatMessage) {
  if (message.attachment?.kind === "image") {
    return message.attachment.fileName
      ? `图片 · ${message.attachment.fileName}`
      : "图片";
  }

  if (message.attachment?.kind === "file") {
    return message.attachment.fileName
      ? `文件 · ${message.attachment.fileName}`
      : "文件";
  }

  if (message.attachment?.kind === "voice") {
    return "语音";
  }

  if (message.attachment?.kind === "contact_card") {
    return message.attachment.name
      ? `名片 · ${message.attachment.name}`
      : "名片";
  }

  if (message.attachment?.kind === "location_card") {
    return message.attachment.title
      ? `位置 · ${message.attachment.title}`
      : "位置";
  }

  if (message.attachment?.kind === "sticker") {
    return message.attachment.label
      ? `表情 · ${message.attachment.label}`
      : "表情";
  }

  return "";
}

function resolveMessageTypeLabel(message: SearchableChatMessage) {
  if (message.type === "image") {
    return "图片";
  }

  if (message.type === "file") {
    return "文件";
  }

  if (message.type === "voice") {
    return "语音";
  }

  if (message.type === "contact_card") {
    return "名片";
  }

  if (message.type === "location_card") {
    return "位置";
  }

  if (message.type === "sticker") {
    return "表情";
  }

  if (message.type === "system") {
    return "系统";
  }

  return "文本";
}

function extractFirstLink(text: string) {
  const match = text.match(urlPattern);
  return match?.[0] ?? "";
}

function resolvePreviewSource(item: IndexedSearchMessage, keyword: string) {
  const candidates = [
    item.previewText,
    item.supportText,
    item.linkText,
    item.message.senderName,
  ].filter(Boolean);

  return (
    candidates.find((candidate) => candidate.toLowerCase().includes(keyword)) ??
    item.previewText
  );
}

function buildResultSectionTitle(
  categoryLabel: string,
  keyword: string,
  count: number,
) {
  if (categoryLabel === "全部") {
    return keyword ? `搜索结果 · ${count} 条` : `最近消息 · ${count} 条`;
  }

  return keyword
    ? `${categoryLabel} · ${count} 条`
    : `最近${categoryLabel} · ${count} 条`;
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
      <mark className="rounded-[4px] bg-[rgba(250,204,21,0.28)] px-0.5 text-current">
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

function matchesSearchDateFilter(createdAt: string, filter: SearchDateFilter) {
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

function matchesSpecificSearchDate(createdAt: string, specificDate: string) {
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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function buildSearchResultSections(
  items: IndexedSearchMessage[],
): SearchResultSection[] {
  const sections: SearchResultSection[] = [];

  items.forEach((item) => {
    const key = resolveSearchSectionKey(item.message.createdAt);
    const lastSection = sections.at(-1);

    if (lastSection?.key === key) {
      lastSection.items.push(item);
      return;
    }

    sections.push({
      key,
      label: resolveSearchSectionLabel(item.message.createdAt),
      items: [item],
    });
  });

  return sections;
}

function resolveSearchSectionKey(createdAt: string) {
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

function resolveSearchSectionLabel(createdAt: string) {
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

function SearchStatPill({
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
