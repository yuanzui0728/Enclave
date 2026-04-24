import { msg } from "@lingui/macro";
import { useMemo, useState, type ReactNode } from "react";
import {
  FileText,
  Image as ImageIcon,
  Link2,
  MessageSquareText,
  Search,
} from "lucide-react";
import type { GroupMessage, Message } from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import {
  compareByLocale,
  formatDateTime,
  getYesterdayLabel,
  translateRuntimeMessage,
  useAppLocale,
} from "@yinjie/i18n";
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
  | "location_card"
  | "note_card";

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
  onRetry?: () => void;
};

const urlPattern = /https?:\/\/[^\s]+/giu;
const UNKNOWN_SENDER_FILTER = "__unknown__";
const t = translateRuntimeMessage;

function getSearchDateFilters() {
  return [
    { id: "all" as const, label: t(msg`全部时间`) },
    { id: "today" as const, label: t(msg`今天`) },
    { id: "7d" as const, label: t(msg`7天内`) },
    { id: "30d" as const, label: t(msg`30天内`) },
  ];
}

function getSearchMessageTypeFilters() {
  return [
    { id: "all" as const, label: t(msg`全部类型`) },
    { id: "text" as const, label: t(msg`文本`) },
    { id: "image" as const, label: t(msg`图片`) },
    { id: "file" as const, label: t(msg`文件`) },
    { id: "voice" as const, label: t(msg`语音`) },
    { id: "sticker" as const, label: t(msg`表情`) },
    { id: "contact_card" as const, label: t(msg`名片`) },
    { id: "location_card" as const, label: t(msg`位置`) },
    { id: "note_card" as const, label: t(msg`笔记`) },
    { id: "system" as const, label: t(msg`系统`) },
  ];
}

function getSearchCategories() {
  return [
    {
      id: "all" as const,
      label: t(msg`全部消息`),
      shortLabel: t(msg`全部`),
      description: t(msg`搜文本、附件和系统提示`),
      icon: MessageSquareText,
    },
    {
      id: "media" as const,
      label: t(msg`图片与视频`),
      shortLabel: t(msg`图片与视频`),
      description: t(msg`先按图片消息聚合浏览`),
      icon: ImageIcon,
    },
    {
      id: "files" as const,
      label: t(msg`文件`),
      shortLabel: t(msg`文件`),
      description: t(msg`按文件名和文件消息筛选`),
      icon: FileText,
    },
    {
      id: "links" as const,
      label: t(msg`链接`),
      shortLabel: t(msg`链接`),
      description: t(msg`把聊天里的 URL 单独拎出来`),
      icon: Link2,
    },
  ];
}

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
  onRetry,
}: ChatMessageSearchPanelProps) {
  const { locale } = useAppLocale();
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategoryId>("all");
  const [senderFilter, setSenderFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<SearchDateFilter>("all");
  const [messageTypeFilter, setMessageTypeFilter] =
    useState<SearchMessageTypeFilter>("all");
  const [specificDate, setSpecificDate] = useState("");
  const localMessageActionState = useLocalChatMessageActionState();
  const { reminders } = useMessageReminders();
  const searchDateFilters = useMemo(() => getSearchDateFilters(), [locale]);
  const searchMessageTypeFilters = useMemo(
    () => getSearchMessageTypeFilters(),
    [locale],
  );
  const searchCategories = useMemo(() => getSearchCategories(), [locale]);
  const unknownSenderLabel = t(msg`消息`);
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
    [localMessageActionState, locale, messages, reminderMap],
  );

  const matchedMessages = useMemo(() => {
    return indexedMessages.filter((item) => {
      const senderKey =
        item.message.senderName?.trim() || UNKNOWN_SENDER_FILTER;

      if (
        enableSenderFilter &&
        senderFilter !== "all" &&
        senderKey !== senderFilter
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
      new Set(
        indexedMessages.map(
          (item) => item.message.senderName?.trim() || UNKNOWN_SENDER_FILTER,
        ),
      ),
    ).sort((left, right) => compareByLocale(left, right));
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
        note_card: 0,
        system: 0,
      },
    );

    return searchMessageTypeFilters.filter(
      (item) => item.id === "all" || counts[item.id as keyof typeof counts] > 0,
    );
  }, [indexedMessages, searchMessageTypeFilters]);

  const categoryCounts = useMemo(() => {
    return searchCategories.reduce<Record<SearchCategoryId, number>>(
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
  }, [matchedMessages, searchCategories]);

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
    [locale, visibleResults],
  );
  const reminderCount = indexedMessages.filter((item) =>
    Boolean(item.reminderAt),
  ).length;
  const isKeywordSearch = Boolean(trimmedKeyword);
  const isPartialResult = results.length > visibleResults.length;
  const senderFilterDisplayLabel =
    senderFilter === UNKNOWN_SENDER_FILTER ? unknownSenderLabel : senderFilter;
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (senderFilter !== "all") {
      labels.push(t(msg`成员 · ${senderFilterDisplayLabel}`));
    }

    if (messageTypeFilter !== "all") {
      labels.push(
        t(
          msg`类型 · ${
            searchMessageTypeFilters.find(
              (item) => item.id === messageTypeFilter,
            )?.label ?? unknownSenderLabel
          }`,
        ),
      );
    }

    if (specificDate) {
      labels.push(t(msg`日期 · ${specificDate}`));
    } else if (dateFilter !== "all") {
      labels.push(
        t(
          msg`时间 · ${
            searchDateFilters.find((item) => item.id === dateFilter)?.label ??
            t(msg`时间筛选`)
          }`,
        ),
      );
    }

    return labels;
  }, [
    dateFilter,
    messageTypeFilter,
    searchDateFilters,
    searchMessageTypeFilters,
    senderFilter,
    senderFilterDisplayLabel,
    specificDate,
    unknownSenderLabel,
  ]);

  const activeCategoryMeta =
    searchCategories.find((item) => item.id === activeCategory) ??
    searchCategories[0];
  const emptySenderResultTitle = `${t(
    msg`没有来自 ${senderFilterDisplayLabel} 的`,
  )}${activeCategoryMeta.shortLabel}`;
  const resetFilters = () => {
    setKeyword("");
    setSenderFilter("all");
    setMessageTypeFilter("all");
    setDateFilter("all");
    setSpecificDate("");
  };

  return (
    <ChatDetailsShell
      title={t(msg`查找聊天记录`)}
      subtitle={subtitle}
      onBack={onBack}
    >
      <ChatDetailsSection title={t(msg`搜索`)} variant="wechat">
        <div className="px-4 py-3">
          <label className="flex items-center gap-2 rounded-[11px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 py-2.5">
            <Search
              size={16}
              className="shrink-0 text-[color:var(--text-dim)]"
            />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t(msg`搜索`)}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <SearchStatPill
              label={t(msg`当前范围 ${indexedMessages.length} 条`)}
            />
            <SearchStatPill
              label={
                isKeywordSearch
                  ? t(msg`搜索命中 ${results.length} 条`)
                  : t(msg`当前分类 ${results.length} 条`)
              }
              tone="brand"
            />
            {reminderCount ? (
              <SearchStatPill
                label={t(msg`提醒 ${reminderCount} 条`)}
                tone="blue"
              />
            ) : null}
          </div>
          {activeFilterLabels.length ? (
            <div className="mt-2.5 rounded-[10px] bg-[color:var(--surface-panel)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-medium text-[color:var(--text-primary)]">
                  {t(msg`已筛选 ${activeFilterLabels.length} 项`)}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-6.5 rounded-full px-2 text-[10px] text-[color:var(--text-secondary)]"
                >
                  {t(msg`清空`)}
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {activeFilterLabels.map((label) => (
                  <SearchStatPill key={label} label={label} tone="active" />
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-2.5 space-y-3 rounded-[10px] bg-[color:var(--surface-panel)] px-3 py-3">
            <div>
              <div className="text-[10px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                {t(msg`时间`)}
              </div>
              <div className="-mx-3 mt-1.5 overflow-x-auto px-3">
                <div className="flex min-w-max gap-1.5">
                  {searchDateFilters.map((item) => (
                    <SearchFilterChip
                      key={item.id}
                      active={dateFilter === item.id && !specificDate}
                      onClick={() => {
                        setDateFilter(item.id);
                        setSpecificDate("");
                      }}
                    >
                      {item.label}
                    </SearchFilterChip>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                {t(msg`类型`)}
              </div>
              <div className="-mx-3 mt-1.5 overflow-x-auto px-3">
                <div className="flex min-w-max gap-1.5">
                  {availableMessageTypeFilters.map((item) => (
                    <SearchFilterChip
                      key={item.id}
                      active={messageTypeFilter === item.id}
                      onClick={() => setMessageTypeFilter(item.id)}
                    >
                      {item.label}
                    </SearchFilterChip>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div
            className={`mt-2.5 grid gap-2 ${
              enableSenderFilter ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
            }`}
          >
            <label className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 py-2">
              <span className="text-[10px] font-medium tracking-[0.06em] text-[color:var(--text-muted)]">
                {t(msg`指定日期`)}
              </span>
              <input
                type="date"
                value={specificDate}
                onChange={(event) => {
                  setSpecificDate(event.target.value);
                  if (event.target.value) {
                    setDateFilter("all");
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none"
              />
            </label>
            {enableSenderFilter ? (
              <label className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 py-2">
                <span className="text-[10px] font-medium tracking-[0.06em] text-[color:var(--text-muted)]">
                  {t(msg`成员`)}
                </span>
                <select
                  value={senderFilter}
                  onChange={(event) => setSenderFilter(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none"
                >
                  <option value="all">{t(msg`全部成员`)}</option>
                  {senderOptions.map((senderKey) => (
                    <option key={senderKey} value={senderKey}>
                      {senderKey === UNKNOWN_SENDER_FILTER
                        ? unknownSenderLabel
                        : senderKey}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </ChatDetailsSection>

      {isLoading ? (
        <div className="px-3">
          <MobileSearchStatusCard
            badge={t(msg`读取中`)}
            title={loadingLabel}
            description={t(msg`稍等一下，正在整理这段聊天里的消息索引。`)}
            tone="loading"
          />
        </div>
      ) : null}
      {error ? (
        <div className="px-3">
          <MobileSearchStatusCard
            badge={t(msg`搜索`)}
            title={t(msg`聊天记录暂时不可用`)}
            description={error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {onRetry ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onRetry}
                    className="rounded-full"
                  >
                    {t(msg`重试读取`)}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onBack}
                  className="rounded-full"
                >
                  {t(msg`返回上一页`)}
                </Button>
              </div>
            }
          />
        </div>
      ) : null}

      {!isLoading && !error ? (
        <>
          {!indexedMessages.length ? (
            <div className="px-3">
              <MobileSearchStatusCard
                badge={t(msg`聊天`)}
                title={t(msg`当前会话还没有聊天记录`)}
                description={t(
                  msg`等有消息后，这里会按关键词、图片、文件和链接帮你集中查找。`,
                )}
              />
            </div>
          ) : null}

          <ChatDetailsSection title={t(msg`分类浏览`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              {searchCategories.map((category) => {
                const Icon = category.icon;
                const active = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
                      active
                        ? "bg-[rgba(247,251,248,0.96)]"
                        : "bg-[color:var(--bg-canvas-elevated)] active:bg-[color:var(--surface-card-hover)]",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8.5 w-8.5 items-center justify-center rounded-[9px]",
                          active
                            ? "bg-[rgba(7,193,96,0.12)] text-[#15803d]"
                            : "bg-[color:var(--surface-panel)] text-[color:var(--text-secondary)]",
                        )}
                      >
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                          {category.label}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-[18px] text-[color:var(--text-muted)]">
                          {category.description}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[16px] font-semibold leading-none text-[color:var(--text-primary)]">
                        {categoryCounts[category.id]}
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-[10px]",
                          active
                            ? "text-[#15803d]"
                            : "text-[color:var(--text-muted)]",
                        )}
                      >
                        {active ? t(msg`当前`) : t(msg`条`)}
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
              <MobileSearchStatusCard
                badge={activeCategoryMeta.shortLabel}
                title={t(msg`还没有${activeCategoryMeta.shortLabel}`)}
                description={t(
                  msg`当前会话里暂时没有可浏览的${activeCategoryMeta.shortLabel}消息。`,
                )}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setActiveCategory("all")}
                    className="rounded-full"
                  >
                    {t(msg`查看全部消息`)}
                  </Button>
                }
              />
            </div>
          ) : null}

          {trimmedKeyword && !results.length ? (
            <div className="px-3">
              <MobileSearchStatusCard
                badge={t(msg`搜索`)}
                title={emptyResultTitle}
                description={emptyResultDescription}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setKeyword("")}
                    className="rounded-full"
                  >
                    {t(msg`清空关键词`)}
                  </Button>
                }
              />
            </div>
          ) : null}

          {!trimmedKeyword &&
          !specificDate &&
          dateFilter === "all" &&
          senderFilter !== "all" &&
          !results.length ? (
            <div className="px-3">
              <MobileSearchStatusCard
                badge={t(msg`成员`)}
                title={emptySenderResultTitle}
                description={t(msg`换个成员试试，或者切回全部成员继续浏览。`)}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setSenderFilter("all")}
                    className="rounded-full"
                  >
                    {t(msg`查看全部成员`)}
                  </Button>
                }
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
              <MobileSearchStatusCard
                badge={t(msg`类型`)}
                title={t(
                  msg`没有匹配的${
                    searchMessageTypeFilters.find(
                      (item) => item.id === messageTypeFilter,
                    )?.label ?? unknownSenderLabel
                  }`,
                )}
                description={t(
                  msg`换个消息类型试试，或者切回全部类型继续浏览。`,
                )}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMessageTypeFilter("all")}
                    className="rounded-full"
                  >
                    {t(msg`查看全部类型`)}
                  </Button>
                }
              />
            </div>
          ) : null}

          {!trimmedKeyword &&
          (dateFilter !== "all" || specificDate) &&
          !results.length ? (
            <div className="px-3">
              <MobileSearchStatusCard
                badge={t(msg`时间`)}
                title={t(msg`这个时间范围内没有匹配消息`)}
                description={t(msg`换个时间试试，或者清空时间筛选继续浏览。`)}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDateFilter("all");
                      setSpecificDate("");
                    }}
                    className="rounded-full"
                  >
                    {t(msg`清空时间筛选`)}
                  </Button>
                }
              />
            </div>
          ) : null}

          {resultSections.length ? (
            <ChatDetailsSection
              title={buildResultSectionTitle(
                activeCategoryMeta.id,
                activeCategoryMeta.shortLabel,
                trimmedKeyword,
                results.length,
              )}
              variant="wechat"
            >
              <div>
                {resultSections.map((section) => (
                  <section key={section.key}>
                    <div className="sticky top-0 z-[1] border-y border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 py-1.5 text-[10px] font-medium tracking-[0.08em] text-[color:var(--text-muted)] backdrop-blur-xl">
                      {section.label}
                    </div>
                    <div className="divide-y divide-[color:var(--border-faint)]">
                      {section.items.map((item) => (
                        <button
                          key={item.message.id}
                          type="button"
                          onClick={() => onOpenMessage(item.message.id)}
                          className="block w-full px-4 py-2.5 text-left transition active:bg-[color:var(--surface-card-hover)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                              {trimmedKeyword
                                ? renderHighlightedText(
                                    item.message.senderName ||
                                      unknownSenderLabel,
                                    trimmedKeyword,
                                  )
                                : item.message.senderName || unknownSenderLabel}
                            </div>
                            <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                              {formatDetailedMessageTimestamp(
                                item.message.createdAt,
                              )}
                            </div>
                          </div>
                          <div className="mt-0.5 text-[13px] leading-5 text-[color:var(--text-secondary)]">
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
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
                            <span className="rounded-full bg-[color:var(--surface-panel)] px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)]">
                              {item.typeLabel}
                            </span>
                            {item.reminderAt ? (
                              <span className="rounded-full bg-[rgba(59,130,246,0.08)] px-2 py-0.5 text-[10px] text-[#2563eb]">
                                {t(
                                  msg`提醒 · ${formatMessageTimestamp(item.reminderAt)}`,
                                )}
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
                  <div className="border-t border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 py-2.5 text-[11px] text-[color:var(--text-muted)]">
                    {t(
                      msg`当前仅展示前 ${MAX_VISIBLE_RESULTS} 条结果，请继续缩小范围查找。`,
                    )}
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
    buildDefaultPreviewText(typeLabel, messageType);
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

function buildDefaultPreviewText(
  typeLabel: string,
  messageType: Exclude<SearchMessageTypeFilter, "all">,
) {
  if (messageType === "text") {
    return typeLabel;
  }

  return t(msg`${typeLabel}消息`);
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

  if (message.type === "note_card") {
    return "note_card";
  }

  return "text";
}

function resolveSupportText(message: SearchableChatMessage) {
  if (message.attachment?.kind === "image") {
    return message.attachment.fileName
      ? t(msg`图片 · ${message.attachment.fileName}`)
      : t(msg`图片`);
  }

  if (message.attachment?.kind === "file") {
    return message.attachment.fileName
      ? t(msg`文件 · ${message.attachment.fileName}`)
      : t(msg`文件`);
  }

  if (message.attachment?.kind === "voice") {
    return t(msg`语音`);
  }

  if (message.attachment?.kind === "contact_card") {
    return message.attachment.name
      ? t(msg`名片 · ${message.attachment.name}`)
      : t(msg`名片`);
  }

  if (message.attachment?.kind === "location_card") {
    return message.attachment.title
      ? t(msg`位置 · ${message.attachment.title}`)
      : t(msg`位置`);
  }

  if (message.attachment?.kind === "note_card") {
    return message.attachment.title
      ? t(msg`笔记 · ${message.attachment.title}`)
      : t(msg`笔记`);
  }

  if (message.attachment?.kind === "sticker") {
    return message.attachment.label
      ? t(msg`表情 · ${message.attachment.label}`)
      : t(msg`表情`);
  }

  return "";
}

function resolveMessageTypeLabel(message: SearchableChatMessage) {
  if (message.type === "image") {
    return t(msg`图片`);
  }

  if (message.type === "file") {
    return t(msg`文件`);
  }

  if (message.type === "voice") {
    return t(msg`语音`);
  }

  if (message.type === "contact_card") {
    return t(msg`名片`);
  }

  if (message.type === "location_card") {
    return t(msg`位置`);
  }

  if (message.type === "note_card") {
    return t(msg`笔记`);
  }

  if (message.type === "sticker") {
    return t(msg`表情`);
  }

  if (message.type === "system") {
    return t(msg`系统`);
  }

  return t(msg`文本`);
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
  categoryId: SearchCategoryId,
  categoryLabel: string,
  keyword: string,
  count: number,
) {
  if (categoryId === "all") {
    return keyword
      ? t(msg`搜索结果 · ${count} 条`)
      : t(msg`最近消息 · ${count} 条`);
  }

  return keyword
    ? t(msg`${categoryLabel} · ${count} 条`)
    : t(msg`最近${categoryLabel} · ${count} 条`);
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
    return t(msg`未知时间`);
  }

  const date = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) {
    return t(msg`今天`);
  }

  if (isSameDay(date, yesterday)) {
    return getYesterdayLabel();
  }

  if (date.getFullYear() === now.getFullYear()) {
    return formatDateTime(date, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  }

  return formatDateTime(date, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function MobileSearchStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}

function SearchStatPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "brand" | "blue" | "active";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] leading-none",
        tone === "brand" &&
          "bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]",
        tone === "blue" && "bg-[rgba(59,130,246,0.08)] text-[#2563eb]",
        tone === "active" && "bg-[rgba(7,193,96,0.12)] text-[#15803d]",
        tone === "neutral" &&
          "bg-[color:var(--surface-panel)] text-[color:var(--text-muted)]",
      )}
    >
      {label}
    </span>
  );
}

function SearchFilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[11px] leading-none transition",
        active
          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(247,251,248,0.96)] text-[#15803d]"
          : "border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-secondary)] active:bg-[color:var(--surface-card-hover)]",
      )}
    >
      {children}
    </button>
  );
}
