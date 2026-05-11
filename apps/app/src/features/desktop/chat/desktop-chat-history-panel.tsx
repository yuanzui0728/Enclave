import { useEffect, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getGroupMembers,
  searchConversationMessages,
  searchGroupMessages,
  type ChatMessageSearchCategory,
  type ChatMessageSearchItem,
  type ConversationListItem,
  type GroupMember,
} from "@yinjie/contracts";
import {
  AlertCircle,
  ChevronDown,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { cn } from "@yinjie/ui";
import { isPersistedGroupConversation } from "../../../lib/conversation-route";
import {
  formatMessageTimestamp,
  parseTimestamp,
} from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { formatDateTime, translateRuntimeMessage } from "@yinjie/i18n";

type DesktopChatHistoryPanelProps = {
  conversation: ConversationListItem;
  focusRequestKey?: number;
  variant?: "panel" | "dialog";
  onBackToDetails?: () => void;
  onClose: () => void;
  onOpenMessage: (messageId: string) => void;
};

type SelectorView = "date" | "sender" | null;
type QuickDateFilter = "all" | "today" | "7d" | "30d" | "custom";
type SenderOption = {
  id: string;
  label: string;
  role: string;
};
type ResultSection = {
  key: string;
  label: string;
  items: ChatMessageSearchItem[];
};

const SEARCH_PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 280;
const t = translateRuntimeMessage;

export function DesktopChatHistoryPanel({
  conversation,
  focusRequestKey = 0,
  variant = "panel",
  onBackToDetails,
  onClose,
  onOpenMessage,
}: DesktopChatHistoryPanelProps) {
  const isDialog = variant === "dialog";
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isGroupConversation = isPersistedGroupConversation(conversation);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customDateInputRef = useRef<HTMLInputElement | null>(null);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<ChatMessageSearchCategory>("all");
  const [selectorView, setSelectorView] = useState<SelectorView>(null);
  const [quickDateFilter, setQuickDateFilter] =
    useState<QuickDateFilter>("all");
  const [customDate, setCustomDate] = useState("");
  const [senderId, setSenderId] = useState("");
  const [memberKeyword, setMemberKeyword] = useState("");

  useEffect(() => {
    setKeyword("");
    setDebouncedKeyword("");
    setActiveCategory("all");
    setSelectorView(null);
    setQuickDateFilter("all");
    setCustomDate("");
    setSenderId("");
    setMemberKeyword("");
  }, [conversation.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversation.id, focusRequestKey]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (selectorView) {
        event.preventDefault();
        event.stopPropagation();
        setSelectorView(null);
        return;
      }

      if (
        activeCategory !== "all" ||
        Boolean(senderId) ||
        quickDateFilter !== "all" ||
        Boolean(customDate)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setActiveCategory("all");
        setQuickDateFilter("all");
        setCustomDate("");
        setSenderId("");
        setMemberKeyword("");
        return;
      }

      if (onBackToDetails) {
        event.preventDefault();
        event.stopPropagation();
        onBackToDetails();
        return;
      }

      if (isDialog) {
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeCategory,
    customDate,
    isDialog,
    onBackToDetails,
    onClose,
    quickDateFilter,
    selectorView,
    senderId,
  ]);

  const membersQuery = useQuery({
    queryKey: ["desktop-chat-search-members", baseUrl, conversation.id],
    queryFn: () => getGroupMembers(conversation.id, baseUrl),
    enabled: isGroupConversation,
    staleTime: 30_000,
  });

  const senderOptions = buildSenderOptions(membersQuery.data ?? []);
  const selectedSender =
    senderOptions.find((option) => option.id === senderId) ?? null;
  const visibleSenderOptions = senderOptions.filter((option) =>
    option.label.toLowerCase().includes(memberKeyword.trim().toLowerCase()),
  );
  const dateRange = resolveDateRange(quickDateFilter, customDate);
  const hasDateFilter = Boolean(dateRange.dateFrom) || Boolean(dateRange.dateTo);
  const hasSearchRequest =
    Boolean(debouncedKeyword) ||
    activeCategory !== "all" ||
    Boolean(senderId) ||
    Boolean(dateRange.dateFrom) ||
    Boolean(dateRange.dateTo);
  const searchQueryEnabled = true;

  const resultsQuery = useInfiniteQuery({
    queryKey: [
      "desktop-chat-message-search",
      baseUrl,
      conversation.id,
      debouncedKeyword,
      activeCategory,
      senderId,
      dateRange.dateFrom,
      dateRange.dateTo,
    ],
    initialPageParam: undefined as string | undefined,
    enabled: searchQueryEnabled,
    queryFn: ({ pageParam }) => {
      const payload = {
        keyword: debouncedKeyword || undefined,
        category: activeCategory,
        senderId: senderId || undefined,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        cursor: pageParam,
        limit: SEARCH_PAGE_SIZE,
      };

      if (isGroupConversation) {
        return searchGroupMessages(conversation.id, payload, baseUrl);
      }

      return searchConversationMessages(conversation.id, payload, baseUrl);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const resultItems =
    resultsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const resultSections = buildResultSections(resultItems);
  const totalResults = resultsQuery.data?.pages[0]?.total ?? resultItems.length;

  const showResultsView = true;
  const openedFromDetails = Boolean(onBackToDetails);
  const emptyStateCopy = buildEmptyStateCopy({
    keyword: debouncedKeyword,
    activeCategory,
    selectedSenderLabel: selectedSender?.label,
    quickDateFilter,
    customDate,
  });

  function focusSearchInput(moveCaretToEnd = false) {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();

      if (moveCaretToEnd && searchInputRef.current) {
        const length = searchInputRef.current.value.length;
        searchInputRef.current.setSelectionRange(length, length);
      }
    });
  }

  function clearKeywordFilter(refocus = true) {
    setKeyword("");
    setDebouncedKeyword("");
    if (refocus) {
      focusSearchInput();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f7]">
      <div
        className={cn(
          "bg-white",
          isDialog ? "px-6 pb-1.5 pt-2" : "border-b border-[rgba(0,0,0,0.06)] px-4 py-3",
        )}
      >
        <div
          className={cn(
            isDialog ? "mx-auto w-full max-w-[680px]" : "",
          )}
        >
        <label
          className={cn(
            "flex items-center gap-2 rounded-[10px] border border-[rgba(0,0,0,0.04)] bg-[#f4f4f4] transition-[border-color,background-color] focus-within:border-[rgba(7,193,96,0.2)] focus-within:bg-white",
            isDialog ? "px-3 py-2" : "px-3 py-2.5",
          )}
        >
          <Search
            size={15}
            className="shrink-0 text-[color:var(--text-muted)]"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setSelectorView(null);
            }}
            placeholder={t(msg`搜索`)}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => clearKeywordFilter()}
              className="shrink-0 text-[color:var(--text-dim)] transition hover:text-[color:var(--text-primary)]"
              aria-label={t(msg`清空搜索词`)}
            >
              <X size={14} />
            </button>
          ) : null}
        </label>

        {isDialog ? null : (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 rounded-[10px] bg-[#f6f6f6] px-3 py-2 text-[11px] text-[color:var(--text-muted)]">
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-secondary)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
              {isGroupConversation ? t(msg`群聊`) : t(msg`单聊`)}
            </span>
            <span className="truncate text-[12px] text-[color:var(--text-primary)]">
              {conversation.title}
            </span>
            {openedFromDetails ? (
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[color:var(--brand-primary)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.14)]">
                {t(msg`聊天信息入口`)}
              </span>
            ) : null}
          </div>
        )}

        </div>
      </div>

      <div
        className={cn(
          "border-b border-[rgba(0,0,0,0.06)] bg-white",
          isDialog ? "px-6" : "px-4",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 overflow-x-auto",
            isDialog ? "mx-auto w-full max-w-[680px]" : "",
          )}
        >
          <DesktopSearchTabButton
            label={t(msg`全部`)}
            active={activeCategory === "all" && selectorView === null}
            onClick={() => {
              setActiveCategory("all");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={t(msg`图片与视频`)}
            active={activeCategory === "media" && selectorView === null}
            onClick={() => {
              setActiveCategory("media");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={t(msg`文件`)}
            active={activeCategory === "files" && selectorView === null}
            onClick={() => {
              setActiveCategory("files");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={t(msg`链接`)}
            active={activeCategory === "links" && selectorView === null}
            onClick={() => {
              setActiveCategory("links");
              setSelectorView(null);
            }}
          />
          <DesktopSearchTabButton
            label={
              customDate ||
              resolveQuickDateFilterLabel(quickDateFilter) ||
              t(msg`日期`)
            }
            active={selectorView === "date" || hasDateFilter}
            withCaret
            onClick={() =>
              setSelectorView(selectorView === "date" ? null : "date")
            }
          />
          {isGroupConversation ? (
            <DesktopSearchTabButton
              label={selectedSender?.label ?? t(msg`群成员`)}
              active={selectorView === "sender" || Boolean(senderId)}
              withCaret
              onClick={() =>
                setSelectorView(selectorView === "sender" ? null : "sender")
              }
            />
          ) : null}
        </div>
      </div>

      {selectorView === "date" ? (
        <div
          className={cn(
            "border-b border-[rgba(0,0,0,0.06)] bg-white",
            isDialog ? "px-6 py-2.5" : "px-4 py-2.5",
          )}
        >
          <div
            className={cn(
              isDialog ? "mx-auto w-full max-w-[680px]" : "",
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: "all" as const, label: t(msg`全部时间`) },
                  { key: "today" as const, label: t(msg`今天`) },
                  { key: "7d" as const, label: t(msg`最近 7 天`) },
                  { key: "30d" as const, label: t(msg`最近 30 天`) },
                ]
              ).map((option) => {
                const active =
                  !customDate && quickDateFilter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setQuickDateFilter(option.key);
                      setCustomDate("");
                      setSelectorView(null);
                    }}
                    className={cn(
                      "h-7 rounded-full px-3 text-[12px] transition",
                      active
                        ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                        : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}

              <div className="relative ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const node = customDateInputRef.current;
                    if (!node) return;
                    if (typeof node.showPicker === "function") {
                      node.showPicker();
                    } else {
                      node.focus();
                      node.click();
                    }
                  }}
                  className={cn(
                    "h-7 inline-flex items-center gap-1 rounded-full px-3 text-[12px] transition",
                    customDate
                      ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                      : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  <span>{customDate || t(msg`指定日期`)}</span>
                  <ChevronDown size={11} className="shrink-0 opacity-70" />
                </button>
                <input
                  ref={customDateInputRef}
                  type="date"
                  value={customDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuickDateFilter(value ? "custom" : "all");
                    setCustomDate(value);
                    if (value) {
                      setSelectorView(null);
                    }
                  }}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
                />
                {customDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickDateFilter("all");
                      setCustomDate("");
                    }}
                    className="text-[11px] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
                  >
                    {t(msg`清除`)}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectorView === "sender" ? (
        <div
          className={cn(
            "border-b border-[rgba(0,0,0,0.06)] bg-white",
            isDialog ? "px-6 py-2.5" : "px-4 py-2.5",
          )}
        >
          <div
            className={cn(
              isDialog ? "mx-auto w-full max-w-[680px]" : "",
            )}
          >
            <label className="flex h-8 items-center gap-2 rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-[#f4f4f4] px-2.5 transition-[border-color,background-color] focus-within:border-[rgba(7,193,96,0.2)] focus-within:bg-white">
              <Search
                size={13}
                className="shrink-0 text-[color:var(--text-muted)]"
              />
              <input
                type="search"
                value={memberKeyword}
                onChange={(event) => setMemberKeyword(event.target.value)}
                placeholder={t(msg`搜索群成员`)}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>

            {membersQuery.isLoading ? (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                <LoaderCircle
                  size={13}
                  className="animate-spin text-[color:var(--brand-primary)]"
                />
                {t(msg`正在读取群成员…`)}
              </div>
            ) : null}
            {membersQuery.isError && membersQuery.error instanceof Error ? (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-[#d74b45]">
                <AlertCircle size={13} />
                <span className="truncate">
                  {membersQuery.error.message}
                </span>
                <button
                  type="button"
                  onClick={() => void membersQuery.refetch()}
                  className="ml-auto text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                >
                  {t(msg`重试`)}
                </button>
              </div>
            ) : null}

            {!membersQuery.isLoading && !membersQuery.isError ? (
              <div className="mt-2 max-h-[180px] overflow-y-auto pr-0.5">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSenderId("");
                      setSelectorView(null);
                    }}
                    className={cn(
                      "h-7 rounded-full px-3 text-[12px] transition",
                      !senderId
                        ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                        : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    {t(msg`全部成员`)}
                  </button>
                  {visibleSenderOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSenderId(option.id);
                        setSelectorView(null);
                      }}
                      className={cn(
                        "h-7 max-w-[180px] truncate rounded-full px-3 text-[12px] transition",
                        senderId === option.id
                          ? "bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)]"
                          : "bg-[#f4f4f4] text-[color:var(--text-secondary)] hover:bg-[#ececec] hover:text-[color:var(--text-primary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                  {!visibleSenderOptions.length ? (
                    <div className="px-2 py-1 text-[12px] text-[color:var(--text-muted)]">
                      {t(msg`没有找到匹配的群成员`)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showResultsView ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] bg-white/96 px-5 py-1.5 backdrop-blur">
            <div className="text-[11px] tracking-[0.08em] text-[color:var(--text-dim)]">
              {hasSearchRequest ? t(msg`搜索结果`) : t(msg`聊天记录`)}
            </div>
            <div className="text-[11px] text-[color:var(--text-muted)]">
              {resultsQuery.isLoading
                ? t(msg`正在搜索...`)
                : t(msg`共 ${totalResults} 条`)}
            </div>
          </div>

          {resultsQuery.isLoading ? (
            <DesktopSearchFeedbackState
              className="px-4 py-5"
              icon={
                <LoaderCircle
                  size={16}
                  className="animate-spin text-[color:var(--brand-primary)]"
                />
              }
              title={t(msg`正在搜索聊天记录`)}
              description={t(msg`正在整理当前聊天里的匹配消息。`)}
            />
          ) : null}

          {resultsQuery.isError && resultsQuery.error instanceof Error ? (
            <DesktopSearchFeedbackState
              className="px-4 py-5"
              icon={<AlertCircle size={16} className="text-[#d74b45]" />}
              title={t(msg`搜索失败`)}
              description={resultsQuery.error.message}
              actionLabel={t(msg`重试`)}
              onAction={() => {
                void resultsQuery.refetch();
              }}
            />
          ) : null}

          {!resultsQuery.isLoading &&
          !resultsQuery.isError &&
          !resultItems.length ? (
            <DesktopSearchFeedbackState
              className="px-6 py-8"
              icon={
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f3f3] text-[color:var(--text-secondary)]">
                  <Search size={16} />
                </span>
              }
              title={emptyStateCopy.title}
              description={emptyStateCopy.description}
            />
          ) : null}

          {resultSections.length ? (
            <div className="bg-white">
              {resultSections.map((section) => (
                <section key={section.key}>
                  <div className="flex items-center justify-between gap-3 border-y border-[rgba(0,0,0,0.06)] bg-[#f7f7f7] px-4 py-1.5 text-[10px] text-[color:var(--text-dim)]">
                    <span className="tracking-[0.04em]">{section.label}</span>
                    <span>{t(msg`${section.items.length} 条`)}</span>
                  </div>
                  <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {section.items.map((item) => (
                      <DesktopSearchResultRow
                        key={item.messageId}
                        item={item}
                        debouncedKeyword={debouncedKeyword}
                        onOpenMessage={onOpenMessage}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {resultsQuery.hasNextPage ? (
            <div className="border-t border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
              <button
                type="button"
                disabled={resultsQuery.isFetchingNextPage}
                onClick={() => void resultsQuery.fetchNextPage()}
                className="mx-auto flex h-9 items-center justify-center rounded-full px-4 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-[#f7f7f7] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:text-[color:var(--text-dim)]"
              >
                {resultsQuery.isFetchingNextPage
                  ? t(msg`正在加载...`)
                  : t(msg`查看更多聊天记录`)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DesktopSearchResultRow({
  item,
  debouncedKeyword,
  onOpenMessage,
}: {
  item: ChatMessageSearchItem;
  debouncedKeyword: string;
  onOpenMessage: (messageId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const metaLabel = buildSearchResultMeta(item);
  const previewText = buildSearchPreview(item, debouncedKeyword);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "block w-full border-l-2 px-4 py-3 transition-[background-color,border-color] duration-150",
        hovered
          ? "border-l-[rgba(7,193,96,0.28)] bg-[#f3f9f4]"
          : "border-l-transparent",
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-[12px] font-medium",
            resolveSearchResultAvatarTone(item),
          )}
        >
          {resolveSenderAvatarLabel(item.senderName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                {item.senderName || t(msg`消息`)}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                  resolveSearchResultBadgeTone(item),
                )}
              >
                {resolveSearchResultBadgeLabel(item)}
              </span>
            </div>
            {hovered ? (
              <button
                type="button"
                onClick={() => onOpenMessage(item.messageId)}
                className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[color:var(--brand-primary)] px-2.5 text-[11px] font-medium text-white shadow-[0_1px_2px_rgba(7,193,96,0.25)] transition hover:opacity-95"
              >
                {t(msg`定位到聊天位置`)}
              </button>
            ) : (
              <div className="shrink-0 text-[10px] tabular-nums text-[color:var(--text-dim)]">
                {formatMessageTimestamp(item.createdAt)}
              </div>
            )}
          </div>

          {metaLabel ? (
            <div className="mt-1 truncate text-[10px] leading-4 text-[color:var(--text-dim)]">
              {metaLabel}
            </div>
          ) : null}

          <div className="mt-1 line-clamp-2 text-[12px] leading-[1.35rem] text-[color:var(--text-secondary)]">
            {renderHighlightedText(previewText, debouncedKeyword)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopSearchFeedbackState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("px-3 py-3", className)}>
      <div className="rounded-[12px] border border-[rgba(0,0,0,0.05)] bg-white px-5 py-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f6f6]">
          {icon}
        </div>
        <div className="mt-3 text-[14px] text-[color:var(--text-primary)]">
          {title}
        </div>
        {description ? (
          <div className="mt-1.5 text-[12px] leading-6 text-[color:var(--text-muted)]">
            {description}
          </div>
        ) : null}
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 inline-flex h-8 items-center justify-center rounded-full bg-[#f6f6f6] px-3 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-[#efefef] hover:text-[color:var(--text-primary)]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DesktopSearchTabButton({
  label,
  active,
  withCaret = false,
  onClick,
}: {
  label: string;
  active: boolean;
  withCaret?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1 px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "text-[color:var(--brand-primary)]"
          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
      )}
    >
      <span className="max-w-[160px] truncate">{label}</span>
      {withCaret ? (
        <ChevronDown size={13} className="shrink-0 opacity-70" />
      ) : null}
      {active ? (
        <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[color:var(--brand-primary)]" />
      ) : null}
    </button>
  );
}

function buildSenderOptions(members: GroupMember[]): SenderOption[] {
  return members.map((member) => ({
    id: member.memberId,
    label:
      member.memberName?.trim() ||
      (member.memberType === "user" ? t(msg`我`) : t(msg`未命名成员`)),
    role:
      member.role === "owner"
        ? t(msg`群主`)
        : member.role === "admin"
          ? t(msg`管理员`)
          : member.memberType === "user"
            ? t(msg`我`)
            : t(msg`群成员`),
  }));
}

function buildEmptyStateCopy(input: {
  keyword: string;
  activeCategory: ChatMessageSearchCategory;
  selectedSenderLabel?: string;
  quickDateFilter: QuickDateFilter;
  customDate: string;
}) {
  if (input.keyword && input.activeCategory !== "all") {
    return {
      title: t(msg`没有找到匹配的${resolveCategoryLabel(input.activeCategory)}`),
      description: t(msg`试试换个关键词，或者切换其他分类。`),
    };
  }

  if (input.keyword) {
    return {
      title: t(msg`没有找到相关聊天记录`),
      description: t(msg`试试换个关键词，或者缩小筛选范围后再查找。`),
    };
  }

  if (input.activeCategory !== "all") {
    return {
      title: t(msg`当前会话里还没有${resolveCategoryLabel(input.activeCategory)}`),
      description: t(msg`换个分类试试，或者输入关键词直接搜索。`),
    };
  }

  if (input.selectedSenderLabel) {
    return {
      title: t(msg`没有找到 ${input.selectedSenderLabel} 的聊天记录`),
      description: t(msg`点击「群成员」选择其他成员，或切回「全部成员」。`),
    };
  }

  if (input.customDate || resolveQuickDateFilterLabel(input.quickDateFilter)) {
    return {
      title: t(msg`这个时间范围内没有聊天记录`),
      description: t(msg`点击「日期」换个范围，或切回「全部时间」。`),
    };
  }

  return {
    title: t(msg`暂无聊天记录`),
    description: t(msg`这个会话目前还没有任何消息，过会儿再来看看。`),
  };
}

function resolveDateRange(filter: QuickDateFilter, customDate: string) {
  if (customDate) {
    return {
      dateFrom: customDate,
      dateTo: customDate,
    };
  }

  if (filter === "today") {
    const today = formatDateInput(new Date());
    return {
      dateFrom: today,
      dateTo: today,
    };
  }

  if (filter === "7d") {
    return {
      dateFrom: formatDateInput(subtractDays(6)),
      dateTo: formatDateInput(new Date()),
    };
  }

  if (filter === "30d") {
    return {
      dateFrom: formatDateInput(subtractDays(29)),
      dateTo: formatDateInput(new Date()),
    };
  }

  return {
    dateFrom: undefined,
    dateTo: undefined,
  };
}

function subtractDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveQuickDateFilterLabel(filter: QuickDateFilter) {
  if (filter === "today") {
    return t(msg`今天`);
  }

  if (filter === "7d") {
    return t(msg`最近 7 天`);
  }

  if (filter === "30d") {
    return t(msg`最近 30 天`);
  }

  return "";
}

function resolveCategoryLabel(category: ChatMessageSearchCategory) {
  if (category === "media") {
    return t(msg`图片与视频`);
  }

  if (category === "files") {
    return t(msg`文件`);
  }

  if (category === "links") {
    return t(msg`链接`);
  }

  return t(msg`全部`);
}

function buildResultSections(items: ChatMessageSearchItem[]) {
  const sections: ResultSection[] = [];

  items.forEach((item) => {
    const key = resolveDateSectionKey(item.createdAt);
    const current = sections.at(-1);

    if (current?.key === key) {
      current.items.push(item);
      return;
    }

    sections.push({
      key,
      label: resolveDateSectionLabel(item.createdAt),
      items: [item],
    });
  });

  return sections;
}

function resolveDateSectionKey(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return "unknown";
  }

  const date = new Date(timestamp);
  return formatDateInput(date);
}

function resolveDateSectionLabel(createdAt: string) {
  const timestamp = parseTimestamp(createdAt);
  if (timestamp === null) {
    return t(msg`未知时间`);
  }

  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) {
    return t(msg`今天`);
  }

  if (isSameDay(date, yesterday)) {
    return t(msg`昨天`);
  }

  if (date.getFullYear() === today.getFullYear()) {
    return formatDateTime(timestamp, {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  }

  return formatDateTime(timestamp, {
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

function resolveMessageTypeLabel(type: ChatMessageSearchItem["messageType"]) {
  if (type === "image") {
    return t(msg`图片`);
  }

  if (type === "file") {
    return t(msg`文件`);
  }

  if (type === "voice") {
    return t(msg`语音`);
  }

  if (type === "contact_card") {
    return t(msg`名片`);
  }

  if (type === "location_card") {
    return t(msg`位置`);
  }

  if (type === "sticker") {
    return t(msg`表情`);
  }

  if (type === "system") {
    return t(msg`系统`);
  }

  return t(msg`文本`);
}

function resolveSearchResultBadgeLabel(item: ChatMessageSearchItem) {
  if (item.categories.includes("links")) {
    return t(msg`链接`);
  }

  return resolveMessageTypeLabel(item.messageType);
}

function resolveSearchResultBadgeTone(item: ChatMessageSearchItem) {
  if (item.categories.includes("links")) {
    return "bg-[#eef3fa] text-[#5d6f88]";
  }

  if (item.messageType === "image") {
    return "bg-[#eef7fb] text-[#59768a]";
  }

  if (item.messageType === "file") {
    return "bg-[#faf2eb] text-[#87664f]";
  }

  if (item.messageType === "voice") {
    return "bg-[#f4eef9] text-[#6e6284]";
  }

  if (item.messageType === "location_card") {
    return "bg-[#fbefef] text-[#87635d]";
  }

  return "bg-[#eef7f1] text-[#5d7865]";
}

function resolveSearchResultAvatarTone(item: ChatMessageSearchItem) {
  if (item.messageType === "file") {
    return "bg-[#f7efe8] text-[#87664f]";
  }

  if (item.categories.includes("links")) {
    return "bg-[#eef3fa] text-[#5d6f88]";
  }

  if (item.messageType === "voice") {
    return "bg-[#f3eef8] text-[#6e6284]";
  }

  return "bg-[#eef7f1] text-[#5d7865]";
}

function resolveSenderAvatarLabel(senderName: string) {
  const trimmed = senderName.trim();
  if (!trimmed) {
    return t(msg`消`);
  }

  return Array.from(trimmed)[0] ?? t(msg`消`);
}

function buildSearchResultMeta(item: ChatMessageSearchItem) {
  const attachment = item.attachment;
  if (!attachment) {
    if (item.categories.includes("links")) {
      return t(msg`网页链接`);
    }

    return null;
  }

  if (attachment.kind === "image") {
    const sizeLabel = formatFileSize(attachment.size);
    return [attachment.fileName, sizeLabel].filter(Boolean).join(" · ");
  }

  if (attachment.kind === "file") {
    return [attachment.fileName, formatFileSize(attachment.size)]
      .filter(Boolean)
      .join(" · ");
  }

  if (attachment.kind === "voice") {
    return t(msg`语音 ${formatVoiceDurationLabel(attachment.durationMs)}`);
  }

  if (attachment.kind === "contact_card") {
    return [attachment.name, attachment.relationship].filter(Boolean).join(" · ");
  }

  if (attachment.kind === "location_card") {
    return [attachment.title, attachment.subtitle].filter(Boolean).join(" · ");
  }

  if (attachment.kind === "note_card") {
    return attachment.title;
  }

  if (attachment.kind === "feed_post_card") {
    return (
      attachment.title?.trim() ||
      attachment.excerpt ||
      attachment.authorName
    );
  }

  if (attachment.kind === "sticker") {
    return attachment.label || t(msg`表情消息`);
  }

  return null;
}

function buildSearchPreview(item: ChatMessageSearchItem, keyword: string) {
  const text = resolveSearchPreviewText(item);
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword.toLowerCase());
  if (start === -1) {
    return text;
  }

  const radius = 18;
  const previewStart = Math.max(0, start - radius);
  const previewEnd = Math.min(text.length, start + keyword.length + radius);
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd)}${suffix}`;
}

function resolveSearchPreviewText(item: ChatMessageSearchItem) {
  const trimmedPreview = item.previewText.trim();
  if (trimmedPreview) {
    return trimmedPreview;
  }

  const attachment = item.attachment;
  if (!attachment) {
    return item.categories.includes("links")
      ? t(msg`分享了一条链接。`)
      : t(msg`消息内容`);
  }

  if (attachment.kind === "image") {
    return t(msg`发送了图片 ${attachment.fileName}。`);
  }

  if (attachment.kind === "file") {
    return t(msg`发送了文件 ${attachment.fileName}。`);
  }

  if (attachment.kind === "voice") {
    return t(msg`发送了一条${formatVoiceDurationLabel(attachment.durationMs)}的语音。`);
  }

  if (attachment.kind === "contact_card") {
    return t(msg`分享了名片 ${attachment.name}。`);
  }

  if (attachment.kind === "location_card") {
    return t(msg`分享了位置 ${attachment.title}。`);
  }

  if (attachment.kind === "note_card") {
    return attachment.excerpt.trim() || t(msg`分享了笔记 ${attachment.title}。`);
  }

  if (attachment.kind === "feed_post_card") {
    return (
      attachment.excerpt.trim() ||
      t(msg`转发了 ${attachment.authorName} 的视频号。`)
    );
  }

  if (attachment.kind === "sticker") {
    return attachment.label
      ? t(msg`[表情] ${attachment.label}`)
      : t(msg`发送了一个表情。`);
  }

  return t(msg`消息内容`);
}

function renderHighlightedText(text: string, keyword: string) {
  if (!keyword) {
    return text;
  }

  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword.toLowerCase());
  if (start === -1) {
    return text;
  }

  const end = start + keyword.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-[rgba(250,204,21,0.32)] px-0.5 text-current">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function formatVoiceDurationLabel(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return t(msg`语音`);
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  return t(msg`${totalSeconds} 秒`);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
