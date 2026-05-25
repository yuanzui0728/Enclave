import { Fragment, useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { useLocation } from "@tanstack/react-router";
import type {
  AdminChatRecordActivityWindow,
  AdminChatRecordConversationListItem,
  AdminChatRecordConversationListQuery,
  AdminChatRecordConversationSearchQuery,
  AdminChatRecordConversationSort,
  AdminChatRecordReviewStatus,
  Message,
} from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHero,
  AdminPillSelectField,
  AdminSkeletonCard,
  AdminToggle,
  AdminToolbar,
} from "../components/admin-workbench";
import { chatRecordsAdminApi } from "../lib/chat-records-api";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { translateRuntimeMessage } from "@yinjie/i18n";

const TYPE_OPTIONS: Array<{
  value: AdminChatRecordConversationSearchQuery["messageType"] | "all";
  label: ReturnType<typeof msg>;
}> = [
  { value: "all", label: msg`全部类型` },
  { value: "text", label: msg`文本` },
  { value: "proactive", label: msg`主动消息` },
  { value: "image", label: msg`图片` },
  { value: "file", label: msg`文件` },
  { value: "voice", label: msg`语音` },
  { value: "sticker", label: msg`表情` },
  { value: "system", label: msg`系统` },
];

const REVIEW_STATUS_OPTIONS: Array<{
  value: AdminChatRecordReviewStatus;
  label: ReturnType<typeof msg>;
}> = [
  { value: "backlog", label: msg`待复盘` },
  { value: "watching", label: msg`持续观察` },
  { value: "important", label: msg`重点样本` },
  { value: "resolved", label: msg`已处理` },
];

function readInitialChatRecordsFocus(search?: string) {
  const raw =
    search ?? (typeof window === "undefined" ? "" : window.location.search);
  const params = new URLSearchParams(raw);
  return {
    characterId: params.get("characterId")?.trim() || "",
    conversationId: params.get("conversationId")?.trim() || "",
  };
}

const MESSAGE_PAGE_SIZE = 60;
// Sentinel page number → backend clamps to the last (newest) page. Lets us
// land on the latest messages without first fetching to learn totalPages.
const MESSAGE_LATEST_PAGE = 1_000_000_000;
const LIST_PAGE_SIZE_OPTIONS = [24, 50, 100];

const SORT_OPTIONS: Array<{
  value: AdminChatRecordConversationSort;
  label: ReturnType<typeof msg>;
}> = [
  { value: "lastActivityAt", label: msg`最近活跃` },
  { value: "recentMessageCount30d", label: msg`30 天消息数` },
  { value: "storedMessageCount", label: msg`留存消息数` },
];

const ACTIVITY_WINDOW_OPTIONS: Array<{
  value: AdminChatRecordActivityWindow;
  label: ReturnType<typeof msg>;
}> = [
  { value: "all", label: msg`全部时间` },
  { value: "7d", label: msg`近 7 天` },
  { value: "30d", label: msg`近 30 天` },
];

export function ChatRecordsPage() {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const location = useLocation();
  const locationSearch = location.searchStr ?? "";
  const initialFocus = useMemo(
    () => readInitialChatRecordsFocus(locationSearch),
    [locationSearch],
  );
  const [characterId, setCharacterId] = useState(initialFocus.characterId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [sortBy, setSortBy] = useState<AdminChatRecordConversationSort>(
    "lastActivityAt",
  );
  const [activityWindow, setActivityWindow] =
    useState<AdminChatRecordActivityWindow>("all");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialFocus.conversationId,
  );
  const [focusedMessageId, setFocusedMessageId] = useState("");
  // null = land on the newest (last) page; a number = explicit page.
  const [messagePage, setMessagePage] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchContext, setSearchContext] = useState<{
    conversationId: string;
  } | null>(null);

  // Re-sync focus state when URL search changes (e.g. user clicks another
  // /chat-records?... link without leaving the page).
  useEffect(() => {
    setCharacterId(initialFocus.characterId);
    setSelectedConversationId(initialFocus.conversationId);
    setPage(1);
  }, [initialFocus.characterId, initialFocus.conversationId]);

  function applyFilterChange(apply: () => void) {
    apply();
    setPage(1);
  }

  const overviewQuery = useQuery({
    queryKey: ["admin-chat-records-overview", baseUrl],
    queryFn: () => chatRecordsAdminApi.getOverview(),
  });
  const overview = overviewQuery.data;
  const overviewMetrics = overview
    ? [
        { label: t(msg`会话总数`), value: overview.totalConversationCount.toLocaleString() },
        { label: t(msg`7 天活跃会话`), value: overview.activeConversationCount7d.toLocaleString() },
        { label: t(msg`7 天消息数`), value: overview.messageCount7d.toLocaleString() },
        { label: t(msg`30 天消息数`), value: overview.messageCount30d.toLocaleString() },
      ]
    : undefined;

  const listQuery = useMemo<AdminChatRecordConversationListQuery>(
    () => ({
      characterId: characterId || undefined,
      includeHidden,
      onlyReviewed,
      activityWindow,
      sortBy,
      page,
      pageSize,
    }),
    [characterId, includeHidden, onlyReviewed, activityWindow, sortBy, page, pageSize],
  );

  const conversationsQuery = useQuery({
    queryKey: ["admin-chat-records-conversations", baseUrl, listQuery],
    queryFn: () => chatRecordsAdminApi.listConversations(listQuery),
    placeholderData: keepPreviousData,
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data?.items],
  );
  const activeConversationId = selectedConversationId || conversations[0]?.id || "";

  useEffect(() => {
    if (!conversations.length) {
      if (selectedConversationId) {
        setSelectedConversationId("");
      }
      return;
    }

    const stillVisible = conversations.some(
      (item) => item.id === selectedConversationId,
    );
    if (!selectedConversationId || !stillVisible) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    setFocusedMessageId("");
    setMessagePage(null);
  }, [activeConversationId]);

  const searchMutation = useMutation({
    mutationFn: (keyword: string) =>
      chatRecordsAdminApi.searchConversationMessages(activeConversationId, {
        keyword,
        includeClearedHistory: true,
      }),
  });
  const messagesQuery = useQuery({
    queryKey: [
      "admin-chat-records-messages",
      baseUrl,
      activeConversationId,
      focusedMessageId,
      messagePage,
    ],
    queryFn: () =>
      focusedMessageId
        ? chatRecordsAdminApi.getConversationMessages(activeConversationId, {
            includeClearedHistory: true,
            aroundMessageId: focusedMessageId,
            before: 18,
            after: 18,
          })
        : chatRecordsAdminApi.getConversationMessages(activeConversationId, {
            includeClearedHistory: true,
            page: messagePage ?? MESSAGE_LATEST_PAGE,
            pageSize: MESSAGE_PAGE_SIZE,
          }),
    enabled: Boolean(activeConversationId),
    placeholderData: keepPreviousData,
  });

  const selectedConversation =
    conversations.find((item) => item.id === activeConversationId) ?? null;

  const messagesPage = messagesQuery.data;
  const messages = messagesPage?.items ?? [];
  // keepPreviousData keeps the prior conversation's page as placeholder across
  // a conversation switch — guard against flashing the wrong chat by checking
  // the data actually belongs to the active conversation. Within the same
  // conversation the placeholder still matches, so page transitions stay smooth.
  const messagesMatchActive =
    messages.length === 0 ||
    messages[0]?.conversationId === activeConversationId;
  const messagesLoading =
    messagesQuery.isLoading ||
    (messagesQuery.isPlaceholderData && !messagesMatchActive);
  const showMessagePager =
    !focusedMessageId &&
    !messagesLoading &&
    messagesMatchActive &&
    messagesPage?.mode === "paged" &&
    (messagesPage.total ?? 0) > 0;
  const messageCurrentPage = messagesPage?.page ?? 1;
  const messageTotalPages = messagesPage?.totalPages ?? 1;

  const searchContextActive =
    searchContext?.conversationId === activeConversationId;
  const searchResults = searchContextActive
    ? searchMutation.data?.items ?? []
    : [];
  const searchedTotal = searchContextActive ? searchMutation.data?.total ?? 0 : 0;

  function runSearch() {
    const keyword = searchKeyword.trim();
    if (!activeConversationId || !keyword) {
      return;
    }
    setSearchContext({ conversationId: activeConversationId });
    searchMutation.mutate(keyword);
  }

  function clearSearchContextState() {
    setSearchContext(null);
    searchMutation.reset();
    setFocusedMessageId("");
  }

  function selectConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setSearchKeyword("");
    clearSearchContextState();
  }

  const listData = conversationsQuery.data;
  const listLoading =
    conversationsQuery.isLoading && !conversationsQuery.data;

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow={t(msg`运营工作台`)}
        title={t(msg`聊天记录`)}
        description={t(
          msg`查看与审阅用户和角色的对话，支持按活跃度筛选、会话内搜索与分页浏览。`,
        )}
        metrics={overviewMetrics}
      />

      <AdminToolbar
        filters={
          <>
            <AdminPillSelectField
              value={sortBy}
              onChange={(value) =>
                applyFilterChange(() =>
                  setSortBy(value as AdminChatRecordConversationSort),
                )
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </AdminPillSelectField>
            <AdminPillSelectField
              value={activityWindow}
              onChange={(value) =>
                applyFilterChange(() =>
                  setActivityWindow(value as AdminChatRecordActivityWindow),
                )
              }
            >
              {ACTIVITY_WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </AdminPillSelectField>
            <AdminToggle
              label={t(msg`含隐藏会话`)}
              checked={includeHidden}
              onChange={(checked) =>
                applyFilterChange(() => setIncludeHidden(checked))
              }
            />
            <AdminToggle
              label={t(msg`仅看已复盘`)}
              checked={onlyReviewed}
              onChange={(checked) =>
                applyFilterChange(() => setOnlyReviewed(checked))
              }
            />
          </>
        }
        actions={
          characterId ? (
            <button
              type="button"
              onClick={() => applyFilterChange(() => setCharacterId(""))}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-primary)] transition hover:opacity-80"
            >
              {t(msg`已按角色筛选`)}
              <span aria-hidden>×</span>
            </button>
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-3 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
          {listLoading ? (
            <AdminSkeletonCard rows={5} showAction />
          ) : conversationsQuery.error instanceof Error ? (
            <AdminErrorState
              title={t(msg`会话列表加载失败`)}
              detail={conversationsQuery.error.message}
              onRetry={() => conversationsQuery.refetch()}
            />
          ) : conversations.length ? (
            <>
              {conversations.map((item) => (
                <ConversationListItemCard
                  key={item.id}
                  item={item}
                  active={item.id === activeConversationId}
                  onSelect={() => selectConversation(item.id)}
                />
              ))}

              {listData ? (
                <Pager
                  page={listData.page}
                  totalPages={listData.totalPages}
                  total={listData.total}
                  disabled={conversationsQuery.isFetching}
                  onChange={(next) => setPage(next)}
                  pageSize={pageSize}
                  pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
                  onPageSizeChange={(size) =>
                    applyFilterChange(() => setPageSize(size))
                  }
                />
              ) : null}
            </>
          ) : (
            <AdminEmptyState title={t(msg`暂无会话`)} description="" />
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {selectedConversation ? (
            <>
              <div className="flex flex-wrap items-center gap-3 px-1">
                <h2 className="text-xl font-semibold text-[color:var(--text-primary)]">
                  {selectedConversation.characterName}
                </h2>
                {selectedConversation.relationship ? (
                  <span className="text-sm text-[color:var(--text-muted)]">
                    {selectedConversation.relationship}
                  </span>
                ) : null}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {searchContextActive ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={clearSearchContextState}
                    >
                      {t(msg`清除搜索`)}
                    </Button>
                  ) : null}
                  {focusedMessageId ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setFocusedMessageId("")}
                    >
                      {t(msg`返回分页浏览`)}
                    </Button>
                  ) : null}
                </div>
              </div>

              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runSearch();
                  }
                }}
                placeholder={t(msg`在此会话内搜索关键词，回车搜索`)}
                className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-2.5 text-sm"
              />

              {searchContextActive && searchMutation.isPending ? (
                <LoadingBlock label={t(msg`正在搜索命中消息...`)} />
              ) : null}

              {searchContextActive && searchResults.length ? (
                <div className="space-y-2 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
                  <div className="px-1 text-xs text-[color:var(--text-muted)]">
                    {t(msg`命中 ${searchedTotal} 条 · 点击跳到上下文`)}
                  </div>
                  <div className="grid gap-2">
                    {searchResults.map((item) => (
                      <button
                        key={item.messageId}
                        type="button"
                        onClick={() => setFocusedMessageId(item.messageId)}
                        className="block w-full rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-left transition hover:border-[color:var(--border-subtle)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {item.senderName}
                          </div>
                          <div className="text-xs text-[color:var(--text-muted)]">
                            {formatCompactDate(item.createdAt)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {truncateText(item.previewText || t(msg`空消息`), 150)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {searchContextActive &&
              searchMutation.isSuccess &&
              !searchMutation.isPending &&
              !searchResults.length ? (
                <AdminEmptyState title={t(msg`没有命中消息`)} description="" />
              ) : null}

              <div className="space-y-4 pt-1">
                {messagesLoading ? (
                  <LoadingBlock label={t(msg`正在读取聊天记录...`)} />
                ) : messagesQuery.error instanceof Error ? (
                  <ErrorBlock message={messagesQuery.error.message} />
                ) : messages.length ? (
                  <TimelineMessages
                    messages={messages}
                    focusedMessageId={focusedMessageId}
                  />
                ) : (
                  <AdminEmptyState
                    title={t(msg`当前会话还没有消息`)}
                    description=""
                  />
                )}
              </div>

              {showMessagePager ? (
                <Pager
                  page={messageCurrentPage}
                  totalPages={messageTotalPages}
                  total={messagesPage?.total ?? 0}
                  disabled={messagesQuery.isFetching}
                  onChange={(next) => setMessagePage(next)}
                />
              ) : null}
            </>
          ) : (
            <AdminEmptyState
              title={t(msg`选一个好友查看聊天记录`)}
              description=""
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  onChange,
  disabled,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}) {
  const t = translateRuntimeMessage;
  const [jump, setJump] = useState("");
  const safeTotalPages = Math.max(1, totalPages);
  const clamp = (value: number) =>
    Math.min(Math.max(1, value), safeTotalPages);

  function submitJump() {
    const parsed = Number(jump.trim());
    if (Number.isFinite(parsed) && parsed >= 1) {
      onChange(clamp(Math.floor(parsed)));
    }
    setJump("");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <span className="text-xs text-[color:var(--text-muted)]">
        {t(msg`共 ${total} 条 · 第 ${page} / ${safeTotalPages} 页`)}
      </span>
      <div className="flex items-center gap-2">
        {pageSizeOptions && onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-2.5 py-1 text-xs text-[color:var(--text-secondary)]"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {t(msg`${option} / 页`)}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(clamp(page - 1))}
          disabled={disabled || page <= 1}
        >
          {t(msg`上一页`)}
        </Button>
        <input
          value={jump}
          onChange={(event) =>
            setJump(event.target.value.replace(/[^0-9]/g, ""))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitJump();
            }
          }}
          placeholder={t(msg`跳页`)}
          inputMode="numeric"
          className="w-14 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-2.5 py-1 text-center text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(clamp(page + 1))}
          disabled={disabled || page >= safeTotalPages}
        >
          {t(msg`下一页`)}
        </Button>
      </div>
    </div>
  );
}

function ConversationListItemCard({
  item,
  active,
  onSelect,
}: {
  item: AdminChatRecordConversationListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
        active
          ? "border-[color:var(--border-brand)] bg-white shadow-[var(--shadow-card)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {item.characterName}
            </div>
            {active ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[12px] font-medium text-emerald-700">
                {t(msg`当前`)}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {item.relationship || t(msg`未标注关系`)}
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px] text-[color:var(--text-muted)]">
          <div>{formatCompactDate(item.lastActivityAt)}</div>
          <div className="mt-1">7d {item.recentMessageCount7d}</div>
        </div>
      </div>

      <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {formatPreview(item.lastVisibleMessage ?? item.lastStoredMessage ?? null, 96)}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[color:var(--text-muted)]">
        <span>{t(msg`可见`)} {item.visibleMessageCount}</span>
        <span>{t(msg`留存`)} {item.storedMessageCount}</span>
        <span>{t(msg`30 天`)} {item.recentMessageCount30d}</span>
        {item.isHidden ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
            {t(msg`已隐藏`)}
          </span>
        ) : null}
        {item.hasClearedHistory ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            {t(msg`含清空前历史`)}
          </span>
        ) : null}
        {item.review ? (
          <span className={`rounded-full px-2 py-0.5 ${reviewBadgeClassName(item.review.status)}`}>
            {formatReviewStatus(item.review.status)}
          </span>
        ) : null}
      </div>
    </button>
  );
}


function TimelineMessages({
  messages,
  focusedMessageId,
}: {
  messages: Message[];
  focusedMessageId: string;
}) {
  let previousDateKey = "";

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const dateKey = message.createdAt.slice(0, 10);
        const showDivider = dateKey !== previousDateKey;
        previousDateKey = dateKey;

        return (
          <Fragment key={message.id}>
            {showDivider ? <TimelineDateDivider value={message.createdAt} /> : null}
            <MessageCard
              message={message}
              highlighted={focusedMessageId === message.id}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function TimelineDateDivider({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[color:var(--border-faint)]" />
      <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1 text-[12px] font-medium text-[color:var(--text-muted)]">
        {formatTimelineDate(value)}
      </span>
      <div className="h-px flex-1 bg-[color:var(--border-faint)]" />
    </div>
  );
}

function MessageCard({
  message,
  highlighted,
}: {
  message: Message;
  highlighted: boolean;
}) {
  const t = translateRuntimeMessage;
  const isUser = message.senderType === "user";
  const isSystem = message.senderType === "system";
  const alignmentClass = isSystem
    ? "justify-center"
    : isUser
      ? "justify-end"
      : "justify-start";
  const bubbleClass = isSystem
    ? "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))]"
    : isUser
      ? "border-orange-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95))]"
      : "border-emerald-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(236,253,245,0.94))]";

  return (
    <div className={`flex ${alignmentClass}`}>
      <div
        className={`w-full max-w-[90%] rounded-[24px] border px-4 py-4 shadow-[var(--shadow-soft)] ${
          highlighted
            ? "border-[color:var(--border-brand)] ring-2 ring-[color:var(--brand-primary)]/12"
            : bubbleClass
        }`}
      >
        <div
          className={`flex items-start justify-between gap-3 ${
            isUser && !isSystem ? "flex-row-reverse" : ""
          }`}
        >
          <div className={`min-w-0 ${isUser && !isSystem ? "text-right" : ""}`}>
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {message.senderName}
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              {formatDateTime(message.createdAt)}
            </div>
          </div>
          <div
            className={`flex flex-wrap gap-2 ${
              isUser && !isSystem ? "justify-end" : ""
            }`}
          >
            {highlighted ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[12px] font-medium text-sky-700">
                {t(msg`命中`)}
              </span>
            ) : null}
            <StatusPill
              tone={
                message.senderType === "character"
                  ? "healthy"
                  : message.senderType === "system"
                    ? "warning"
                    : "muted"
              }
            >
              {formatMessageType(message.type)}
            </StatusPill>
          </div>
        </div>

        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[color:var(--text-secondary)]">
          {message.text?.trim() || (message.attachment ? t(msg`无额外文本描述`) : t(msg`空消息`))}
        </div>

        {message.attachment ? (
          <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-white/85 px-3 py-2.5 text-sm text-[color:var(--text-secondary)]">
            {attachmentLabel(message)}
          </div>
        ) : null}
      </div>
    </div>
  );
}





function attachmentLabel(message: Message) {
  const t = translateRuntimeMessage;
  const attachment = message.attachment;
  if (!attachment) {
    return "";
  }
  if (
    attachment.kind === "image" ||
    attachment.kind === "file" ||
    attachment.kind === "voice"
  ) {
    return `${formatMessageType(message.type)}：${attachment.fileName}`;
  }
  if (attachment.kind === "sticker") {
    return `${t(msg`表情`)}：${attachment.label || attachment.stickerId}`;
  }
  if (attachment.kind === "contact_card") {
    return `${t(msg`名片`)}：${attachment.name}`;
  }
  if (attachment.kind === "location_card") {
    return `${t(msg`位置`)}：${attachment.title}`;
  }
  if (attachment.kind === "note_card") {
    return `${t(msg`笔记`)}：${attachment.title}`;
  }
  if (attachment.kind === "feed_post_card") {
    return `${t(msg`视频号`)}：${
      attachment.title || attachment.excerpt || attachment.authorName
    }`;
  }
  // call_log
  const callKind =
    attachment.mode === "video" ? t(msg`视频通话`) : t(msg`语音通话`);
  return `${callKind} · ${formatCallDuration(attachment.durationSec)}`;
}

function formatCallDuration(durationSec: number) {
  const total = Math.max(0, Math.floor(durationSec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPreview(message: Message | null, maxLength = 120) {
  const t = translateRuntimeMessage;
  if (!message) {
    return t(msg`暂无消息`);
  }

  const rawText = message.attachment
    ? attachmentLabel(message)
    : message.text || t(msg`空消息`);
  return `${message.senderName}：${truncateText(rawText, maxLength)}`;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatMessageType(type: Message["type"]) {
  const t = translateRuntimeMessage;
  if (type === "contact_card") {
    return t(msg`名片`);
  }
  if (type === "location_card") {
    return t(msg`位置`);
  }
  if (type === "note_card") {
    return t(msg`笔记`);
  }
  const found = TYPE_OPTIONS.find((item) => item.value === type);
  return found ? t(found.label) : type;
}


function formatCompactDate(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "none",
  );
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "none",
  );
}

function formatTimelineDate(value: string) {
  return formatLocalizedDateTime(
    value,
    {
      month: "long",
      day: "numeric",
      weekday: "short",
    },
    "notRecorded",
  );
}







function formatReviewStatus(status: AdminChatRecordReviewStatus) {
  const t = translateRuntimeMessage;
  const found = REVIEW_STATUS_OPTIONS.find((item) => item.value === status);
  return found ? t(found.label) : status;
}

function reviewBadgeClassName(status: AdminChatRecordReviewStatus) {
  if (status === "important") {
    return "bg-rose-50 text-rose-700";
  }
  if (status === "watching") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "resolved") {
    return "bg-emerald-50 text-emerald-700";
  }
  return "bg-sky-50 text-sky-700";
}











