import { Fragment, useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  AdminChatRecordActivityWindow,
  AdminChatRecordConversationDetail,
  AdminChatRecordConversationExportResponse,
  AdminChatRecordConversationListItem,
  AdminChatRecordConversationListQuery,
  AdminChatRecordConversationReview,
  AdminChatRecordConversationSearchQuery,
  AdminChatRecordReviewStatus,
  Character,
  Message,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SectionHeading,
  StatusPill,
  ToggleChip,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminEmptyState,
  AdminInfoRows,
  AdminPageHero,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { chatRecordsAdminApi } from "../lib/chat-records-api";
import {
  formatAdminCompactInteger,
  formatAdminCurrency,
  formatAdminDateTime as formatLocalizedDateTime,
  formatAdminPercent,
} from "../lib/format";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

const SORT_OPTIONS = [
  { value: "lastActivityAt", label: "最近活跃" },
  { value: "recentMessageCount30d", label: "近 30 天消息量" },
  { value: "storedMessageCount", label: "累计消息量" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "text", label: "文本" },
  { value: "proactive", label: "主动消息" },
  { value: "image", label: "图片" },
  { value: "file", label: "文件" },
  { value: "voice", label: "语音" },
  { value: "sticker", label: "表情" },
  { value: "system", label: "系统" },
] as const;

const ACTIVITY_WINDOW_OPTIONS: Array<{
  value: AdminChatRecordActivityWindow;
  label: string;
}> = [
  { value: "all", label: "全部会话" },
  { value: "7d", label: "近 7 天活跃" },
  { value: "30d", label: "近 30 天活跃" },
];

const REVIEW_STATUS_OPTIONS: Array<{
  value: AdminChatRecordReviewStatus;
  label: string;
}> = [
  { value: "backlog", label: "待复盘" },
  { value: "watching", label: "持续观察" },
  { value: "important", label: "重点样本" },
  { value: "resolved", label: "已处理" },
];

const REVIEW_TAG_SUGGESTIONS = [
  "高需求",
  "高成本",
  "首响偏慢",
  "可复用",
  "需排查",
  "回复优秀",
] as const;

type ReviewDraft = {
  status: AdminChatRecordReviewStatus;
  tags: string;
  note: string;
};

function readInitialChatRecordsFocus() {
  if (typeof window === "undefined") {
    return {
      characterId: "",
      conversationId: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    characterId: params.get("characterId")?.trim() || "",
    conversationId: params.get("conversationId")?.trim() || "",
  };
}

export function ChatRecordsPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const initialFocus = useMemo(() => readInitialChatRecordsFocus(), []);
  const [characterId, setCharacterId] = useState(initialFocus.characterId);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const [includeClearedHistory, setIncludeClearedHistory] = useState(false);
  const [activityWindow, setActivityWindow] =
    useState<AdminChatRecordActivityWindow>("all");
  const [sortBy, setSortBy] =
    useState<AdminChatRecordConversationListQuery["sortBy"]>("lastActivityAt");
  const [page, setPage] = useState(1);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialFocus.conversationId,
  );
  const [focusedMessageId, setFocusedMessageId] = useState("");
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>({
    status: "backlog",
    tags: "",
    note: "",
  });
  const [timelineMessageType, setTimelineMessageType] =
    useState<AdminChatRecordConversationSearchQuery["messageType"] | "all">(
      "all",
    );
  const [search, setSearch] = useState<{
    keyword: string;
    messageType: AdminChatRecordConversationSearchQuery["messageType"] | "all";
    dateFrom: string;
    dateTo: string;
  }>({
    keyword: "",
    messageType: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [searchContext, setSearchContext] = useState<{
    conversationId: string;
    includeClearedHistory: boolean;
  } | null>(null);

  const listQuery = useMemo(
    () => ({
      characterId: characterId || undefined,
      includeHidden,
      onlyReviewed,
      activityWindow,
      sortBy,
      page,
      pageSize: 24,
    }),
    [activityWindow, characterId, includeHidden, onlyReviewed, page, sortBy],
  );

  const overviewQuery = useQuery({
    queryKey: ["admin-chat-records-overview", baseUrl],
    queryFn: () => chatRecordsAdminApi.getOverview(),
  });
  const charactersQuery = useQuery({
    queryKey: ["admin-chat-records-characters", baseUrl],
    queryFn: () => adminApi.getCharacters(),
  });
  const conversationsQuery = useQuery({
    queryKey: ["admin-chat-records-conversations", baseUrl, listQuery],
    queryFn: () => chatRecordsAdminApi.listConversations(listQuery),
  });

  const characters = charactersQuery.data ?? [];
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
  }, [activeConversationId, includeClearedHistory]);

  const detailQuery = useQuery({
    queryKey: [
      "admin-chat-records-detail",
      baseUrl,
      activeConversationId,
      includeClearedHistory,
    ],
    queryFn: () =>
      chatRecordsAdminApi.getConversationDetail(activeConversationId, {
        includeClearedHistory,
      }),
    enabled: Boolean(activeConversationId),
  });
  const tokenUsageQuery = useQuery({
    queryKey: ["admin-chat-records-token-usage", baseUrl, activeConversationId],
    queryFn: () => chatRecordsAdminApi.getConversationTokenUsage(activeConversationId),
    enabled: Boolean(activeConversationId),
  });
  const searchMutation = useMutation({
    mutationFn: (payload: AdminChatRecordConversationSearchQuery) =>
      chatRecordsAdminApi.searchConversationMessages(activeConversationId, payload),
  });
  const exportMutation = useMutation({
    mutationFn: (format: "markdown" | "json") =>
      chatRecordsAdminApi.exportConversation(activeConversationId, {
        format,
        includeClearedHistory,
      }),
    onSuccess: (file) => downloadExportFile(file),
  });
  const saveReviewMutation = useMutation({
    mutationFn: () =>
      chatRecordsAdminApi.upsertConversationReview(activeConversationId, {
        status: reviewDraft.status,
        tags: parseReviewTags(reviewDraft.tags),
        note: reviewDraft.note.trim() || null,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-chat-records-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-chat-records-detail", baseUrl, activeConversationId],
        }),
      ]);
    },
  });
  const deleteReviewMutation = useMutation({
    mutationFn: () => chatRecordsAdminApi.deleteConversationReview(activeConversationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-chat-records-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-chat-records-detail", baseUrl, activeConversationId],
        }),
      ]);
    },
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: [
      "admin-chat-records-messages",
      baseUrl,
      activeConversationId,
      includeClearedHistory,
      focusedMessageId,
    ],
    queryFn: ({ pageParam }) =>
      chatRecordsAdminApi.getConversationMessages(activeConversationId, {
        includeClearedHistory,
        limit: 60,
        cursor: focusedMessageId || !pageParam ? undefined : String(pageParam),
        aroundMessageId: focusedMessageId || undefined,
        before: focusedMessageId ? 18 : undefined,
        after: focusedMessageId ? 18 : undefined,
      }),
    initialPageParam: 0,
    enabled: Boolean(activeConversationId),
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ? Number(lastPage.nextCursor) : undefined,
  });

  const detail = detailQuery.data;
  const review = detail?.review;
  const selectedConversation =
    detail?.conversation ??
    conversations.find((item) => item.id === activeConversationId) ??
    null;
  const selectedCharacterName = characterId
    ? characters.find((item) => item.id === characterId)?.name || "当前角色"
    : "";

  const messages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    if (!pages.length) {
      return [] as Message[];
    }
    return focusedMessageId
      ? pages[0].items
      : [...pages].reverse().flatMap((pageData) => pageData.items);
  }, [focusedMessageId, messagesQuery.data?.pages]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => matchesMessageType(message, timelineMessageType)),
    [messages, timelineMessageType],
  );

  useEffect(() => {
    if (!review) {
      setReviewDraft({
        status: "backlog",
        tags: "",
        note: "",
      });
      return;
    }

    setReviewDraft({
      status: review.status,
      tags: review.tags.join(", "),
      note: review.note ?? "",
    });
  }, [review]);

  const parsedReviewTags = useMemo(
    () => parseReviewTags(reviewDraft.tags),
    [reviewDraft.tags],
  );
  const reviewDirty = useMemo(
    () => isReviewDraftDirty(review ?? null, reviewDraft),
    [review, reviewDraft],
  );

  const filterLabels = useMemo(
    () =>
      buildConversationFilterLabels({
        characterName: selectedCharacterName,
        includeHidden,
        onlyReviewed,
        includeClearedHistory,
        activityWindow,
        sortBy,
      }),
    [
      activityWindow,
      includeClearedHistory,
      includeHidden,
      onlyReviewed,
      selectedCharacterName,
      sortBy,
    ],
  );
  const searchLabels = useMemo(() => buildSearchLabels(search), [search]);
  const hasConversationFilters = filterLabels.length > 0;
  const searchContextActive =
    searchContext?.conversationId === activeConversationId &&
    searchContext.includeClearedHistory === includeClearedHistory;
  const searchResults = searchContextActive
    ? searchMutation.data?.items ?? []
    : [];
  const searchedTotal = searchContextActive ? searchMutation.data?.total ?? 0 : 0;
  const operatorSummary = useMemo(
    () =>
      buildOperatorSummary({
        detail,
        includeClearedHistory,
        focusedMessageId,
        reviewDirty,
        searchedTotal,
        recentCost: tokenUsageQuery.data?.recent30dOverview.estimatedCost ?? null,
        recentCostCurrency:
          tokenUsageQuery.data?.recent30dOverview.currency ?? "CNY",
      }),
    [
      detail,
      focusedMessageId,
      includeClearedHistory,
      reviewDirty,
      searchedTotal,
      tokenUsageQuery.data?.recent30dOverview.currency,
      tokenUsageQuery.data?.recent30dOverview.estimatedCost,
    ],
  );

  function runSearch() {
    if (!activeConversationId) {
      return;
    }

    setSearchContext({
      conversationId: activeConversationId,
      includeClearedHistory,
    });
    searchMutation.mutate({
      keyword: search.keyword.trim() || undefined,
      messageType: search.messageType !== "all" ? search.messageType : undefined,
      dateFrom: search.dateFrom || undefined,
      dateTo: search.dateTo || undefined,
      includeClearedHistory,
    });
  }

  function clearSearchContextState() {
    setSearchContext(null);
    searchMutation.reset();
    setFocusedMessageId("");
  }

  function resetSearchFields() {
    setSearch({
      keyword: "",
      messageType: "all",
      dateFrom: "",
      dateTo: "",
    });
  }

  function resetConversationFilters() {
    setCharacterId("");
    setIncludeHidden(false);
    setOnlyReviewed(false);
    setIncludeClearedHistory(false);
    setActivityWindow("all");
    setSortBy("lastActivityAt");
    setPage(1);
    clearSearchContextState();
  }

  function selectConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    clearSearchContextState();
  }

  function appendReviewTag(tag: string) {
    setReviewDraft((current) => ({
      ...current,
      tags: appendReviewTagValue(current.tags, tag),
    }));
  }

  if (overviewQuery.isLoading && conversationsQuery.isLoading) {
    return <LoadingBlock label="正在加载聊天记录..." />;
  }
  if (overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }
  if (conversationsQuery.error instanceof Error) {
    return <ErrorBlock message={conversationsQuery.error.message} />;
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="聊天记录"
        title="世界样本与会话档案"
        description="围绕运营主路径重排成“找会话 -> 看上下文 -> 标样本 -> 跳联动台”的工作台，降低扫读和复盘成本。"
        actions={
          <div className="flex flex-wrap gap-2">
            {focusedMessageId ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFocusedMessageId("")}
              >
                返回最新消息
              </Button>
            ) : null}
            {hasConversationFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={resetConversationFilters}
              >
                恢复默认筛选
              </Button>
            ) : null}
          </div>
        }
        metrics={[
          { label: "总会话数", value: overviewQuery.data?.totalConversationCount ?? 0 },
          {
            label: "近 7 天活跃",
            value: overviewQuery.data?.activeConversationCount7d ?? 0,
          },
          { label: "近 30 天消息", value: overviewQuery.data?.messageCount30d ?? 0 },
          {
            label: "近 30 天成本",
            value: formatCurrency(
              overviewQuery.data?.estimatedCost30d ?? 0,
              overviewQuery.data?.currency ?? "CNY",
            ),
          },
        ]}
      />

      <AdminCallout
        title={operatorSummary.title}
        description={operatorSummary.description}
        tone={operatorSummary.tone}
      />

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
          <Card className="space-y-5 bg-[color:var(--surface-console)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionHeading>会话导航</SectionHeading>
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  先锁定会话范围，再进入中间时间线与右侧复盘操作。
                </p>
              </div>
              {conversationsQuery.isFetching ? (
                <StatusPill tone="muted">刷新中</StatusPill>
              ) : null}
            </div>

            <div className="grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-[color:var(--text-muted)]">
                  角色范围
                </span>
                <select
                  value={characterId}
                  onChange={(event) => {
                    setCharacterId(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
                >
                  <option value="">全部角色</option>
                  {characters.map((character: Character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-[color:var(--text-muted)]">
                  排序方式
                </span>
                <select
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(
                      event.target
                        .value as AdminChatRecordConversationListQuery["sortBy"],
                    );
                    setPage(1);
                  }}
                  className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-2">
                <ToggleChip
                  label="显示隐藏会话"
                  checked={includeHidden}
                  onChange={(event) => {
                    setIncludeHidden(event.target.checked);
                    setPage(1);
                  }}
                />
                <ToggleChip
                  label="仅看已标记样本"
                  checked={onlyReviewed}
                  onChange={(event) => {
                    setOnlyReviewed(event.target.checked);
                    setPage(1);
                  }}
                />
                <ToggleChip
                  label="包含清空前历史"
                  checked={includeClearedHistory}
                  onChange={(event) => {
                    setIncludeClearedHistory(event.target.checked);
                    clearSearchContextState();
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {ACTIVITY_WINDOW_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setActivityWindow(option.value);
                      setPage(1);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      activityWindow === option.value
                        ? "border-[color:var(--border-brand)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)]"
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                    当前结果
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {conversationsQuery.data
                      ? `共 ${conversationsQuery.data.total} 个会话，第 ${page} / ${Math.max(
                          conversationsQuery.data.totalPages,
                          1,
                        )} 页`
                      : "正在读取列表"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                    {conversations.length}
                  </div>
                  <div className="text-[11px] text-[color:var(--text-muted)]">
                    本页会话
                  </div>
                </div>
              </div>
              {filterLabels.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {filterLabels.map((label) => (
                    <FilterBadge key={label} label={label} />
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-[color:var(--text-muted)]">
                  默认视图：全部角色，按最近活跃排序。
                </div>
              )}
            </div>

            <div className="space-y-3">
              {conversations.length ? (
                conversations.map((item) => (
                  <ConversationListItemCard
                    key={item.id}
                    item={item}
                    active={item.id === activeConversationId}
                    onSelect={() => selectConversation(item.id)}
                  />
                ))
              ) : (
                <AdminEmptyState
                  title="没有符合条件的会话"
                  description="可以切回全部角色，或放宽活跃时间与隐藏会话筛选。"
                />
              )}
            </div>

            {conversationsQuery.data && conversationsQuery.data.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </Button>
                <span className="text-xs text-[color:var(--text-muted)]">
                  第 {page} / {conversationsQuery.data.totalPages} 页
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(conversationsQuery.data!.totalPages, current + 1),
                    )
                  }
                  disabled={page >= conversationsQuery.data.totalPages}
                >
                  下一页
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          {selectedConversation ? (
            <ConversationWorkspaceHeader
              conversation={selectedConversation}
              detail={detail}
              recentCost={tokenUsageQuery.data?.recent30dOverview.estimatedCost ?? null}
              recentCostCurrency={
                tokenUsageQuery.data?.recent30dOverview.currency ?? "CNY"
              }
            />
          ) : (
            <AdminEmptyState
              title="先从左侧选择一个会话"
              description="选中角色会话后，中间会进入上下文阅读与定位模式，右侧则同步显示复盘和洞察。"
            />
          )}

          <Card className="space-y-5 bg-[color:var(--surface-console)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <SectionHeading>检索与定位</SectionHeading>
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  先用关键词、类型、时间窗锁定片段，再切回完整时间线继续浏览。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={runSearch}
                  disabled={!activeConversationId || searchMutation.isPending}
                >
                  {searchMutation.isPending ? "搜索中..." : "执行搜索"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={resetSearchFields}
                >
                  清空条件
                </Button>
                {searchContextActive ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={clearSearchContextState}
                  >
                    清除命中
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => exportMutation.mutate("markdown")}
                  disabled={!activeConversationId || exportMutation.isPending}
                >
                  导出 Markdown
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => exportMutation.mutate("json")}
                  disabled={!activeConversationId || exportMutation.isPending}
                >
                  导出 JSON
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_1fr_1fr]">
              <input
                value={search.keyword}
                onChange={(event) =>
                  setSearch((current) => ({
                    ...current,
                    keyword: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="搜索需求、措辞、反馈或具体话题"
                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
              />
              <select
                value={search.messageType}
                onChange={(event) =>
                  setSearch((current) => ({
                    ...current,
                    messageType:
                      event.target
                        .value as AdminChatRecordConversationSearchQuery["messageType"] | "all",
                  }))
                }
                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={search.dateFrom}
                onChange={(event) =>
                  setSearch((current) => ({
                    ...current,
                    dateFrom: event.target.value,
                  }))
                }
                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
              />
              <input
                type="date"
                value={search.dateTo}
                onChange={(event) =>
                  setSearch((current) => ({
                    ...current,
                    dateTo: event.target.value,
                  }))
                }
                className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
              />
            </div>

            {searchLabels.length ? (
              <div className="flex flex-wrap gap-2">
                {searchLabels.map((label) => (
                  <FilterBadge key={label} label={label} />
                ))}
              </div>
            ) : (
              <div className="text-xs text-[color:var(--text-muted)]">
                支持关键词、消息类型、起止日期组合搜索，命中后可直接定位到上下文。
              </div>
            )}

            {exportMutation.error instanceof Error ? (
              <ErrorBlock message={exportMutation.error.message} />
            ) : null}

            <div className="flex flex-col gap-3 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  时间线视角
                </div>
                <div className="text-sm text-[color:var(--text-secondary)]">
                  当前展示 {visibleMessages.length} / {messages.length} 条消息
                  {focusedMessageId ? "，已进入命中上下文模式" : "，默认按最新向前浏览"}。
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={timelineMessageType}
                  onChange={(event) =>
                    setTimelineMessageType(
                      event.target
                        .value as AdminChatRecordConversationSearchQuery["messageType"] | "all",
                    )
                  }
                  className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm"
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {focusedMessageId ? (
                  <StatusPill tone="warning">定位上下文</StatusPill>
                ) : (
                  <StatusPill tone="muted">最新时间线</StatusPill>
                )}
              </div>
            </div>

            {includeClearedHistory ? (
              <InlineNotice title="当前正在查看清空前历史">
                这里展示数据库仍保留的完整会话样本，可能包含用户在前台已清空的聊天。
              </InlineNotice>
            ) : null}

            {searchContextActive && searchMutation.isPending ? (
              <LoadingBlock label="正在搜索命中消息..." />
            ) : null}

            {searchContextActive && searchResults.length ? (
              <div className="space-y-3 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                      搜索命中
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      共命中 {searchedTotal} 条消息，点击任一条即可切到附近上下文。
                    </div>
                  </div>
                  <StatusPill tone="healthy">
                    {searchLabels.length ? searchLabels.join(" · ") : "无附加条件"}
                  </StatusPill>
                </div>
                <div className="grid gap-2">
                  {searchResults.map((item) => (
                    <button
                      key={item.messageId}
                      type="button"
                      onClick={() => setFocusedMessageId(item.messageId)}
                      className="block w-full rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-3 text-left transition hover:border-[color:var(--border-subtle)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[color:var(--text-primary)]">
                            {item.senderName}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            {formatCompactDate(item.createdAt)} ·{" "}
                            {formatMessageType(item.messageType)}
                          </div>
                        </div>
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          定位
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {truncateText(item.previewText || "空消息", 150)}
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
              <AdminEmptyState
                title="没有命中消息"
                description="换一个关键词、放宽时间范围，或者切回全部消息类型后再试。"
              />
            ) : null}
          </Card>

          <Card className="space-y-5 bg-[color:var(--surface-console)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <SectionHeading>时间线</SectionHeading>
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                  阅读和判断都在这里完成。用户消息右对齐，角色回复左对齐，系统消息居中展示。
                </p>
              </div>
              {!focusedMessageId && messagesQuery.data?.pages.at(-1)?.hasMore ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void messagesQuery.fetchNextPage()}
                  disabled={messagesQuery.isFetchingNextPage}
                >
                  {messagesQuery.isFetchingNextPage
                    ? "正在加载更早消息..."
                    : "加载更早消息"}
                </Button>
              ) : null}
            </div>

            {focusedMessageId ? (
              <InlineNotice title="当前正在查看命中消息附近上下文">
                如果已经完成判断，可以点击上方“返回最新消息”回到完整时间线继续浏览。
              </InlineNotice>
            ) : null}

            <div className="space-y-4">
              {messagesQuery.isLoading ? (
                <LoadingBlock label="正在读取时间线..." />
              ) : messagesQuery.error instanceof Error ? (
                <ErrorBlock message={messagesQuery.error.message} />
              ) : visibleMessages.length ? (
                <TimelineMessages
                  messages={visibleMessages}
                  focusedMessageId={focusedMessageId}
                />
              ) : messages.length ? (
                <AdminEmptyState
                  title="当前筛选条件下没有消息"
                  description="可以切回全部类型，或者通过搜索先定位到具体片段。"
                />
              ) : (
                <AdminEmptyState
                  title="当前会话还没有消息"
                  description="这个角色的单聊档案还没有积累可回看的历史。"
                />
              )}
            </div>

            {!focusedMessageId && messagesQuery.data?.pages.at(-1)?.hasMore ? (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void messagesQuery.fetchNextPage()}
                  disabled={messagesQuery.isFetchingNextPage}
                >
                  {messagesQuery.isFetchingNextPage
                    ? "正在加载更早消息..."
                    : "继续向前加载"}
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
          {detailQuery.isLoading ? (
            <LoadingBlock label="正在整理会话洞察..." />
          ) : detailQuery.error instanceof Error ? (
            <ErrorBlock message={detailQuery.error.message} />
          ) : detail ? (
            <>
              <AdminCallout
                title="运营动作区"
                tone={reviewDirty ? "warning" : detail.review ? "success" : "info"}
                description={
                  reviewDirty
                    ? "右侧复盘草稿尚未保存，保存后这段会话才会进入“仅看已标记样本”的稳定筛选路径。"
                    : detail.review
                      ? `当前已标记为“${formatReviewStatus(detail.review.status)}”，适合继续补标签、备注或联动到回复逻辑台。`
                      : "这段会话还没有进入复盘池，建议先给出状态、标签和备注，方便后续回看。"
                }
              />

              <Card className="space-y-4 bg-[color:var(--surface-console)]">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading>复盘操作</SectionHeading>
                  {reviewDirty ? (
                    <StatusPill tone="warning">未保存</StatusPill>
                  ) : detail.review ? (
                    <StatusPill tone="healthy">已入池</StatusPill>
                  ) : (
                    <StatusPill tone="muted">未标记</StatusPill>
                  )}
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[color:var(--text-muted)]">
                      标记状态
                    </span>
                    <select
                      value={reviewDraft.status}
                      onChange={(event) =>
                        setReviewDraft((current) => ({
                          ...current,
                          status: event.target.value as AdminChatRecordReviewStatus,
                        }))
                      }
                      className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
                    >
                      {REVIEW_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[color:var(--text-muted)]">
                      标签
                    </span>
                    <input
                      value={reviewDraft.tags}
                      onChange={(event) =>
                        setReviewDraft((current) => ({
                          ...current,
                          tags: event.target.value,
                        }))
                      }
                      placeholder="如：高需求、高成本、易复用"
                      className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {REVIEW_TAG_SUGGESTIONS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendReviewTag(tag)}
                        className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>

                  {parsedReviewTags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {parsedReviewTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-xs text-[color:var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[color:var(--text-muted)]">
                      还没有标签，可用上方快捷标签快速沉淀样本特征。
                    </div>
                  )}

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-[color:var(--text-muted)]">
                      复盘备注
                    </span>
                    <textarea
                      value={reviewDraft.note}
                      onChange={(event) =>
                        setReviewDraft((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      rows={6}
                      placeholder="记录这段对话为什么值得复盘、后续应该如何调策略或 Prompt。"
                      className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm"
                    />
                  </label>
                </div>

                {detail.review ? (
                  <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
                    <div className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      当前标记
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-secondary)]">
                      <div className="flex items-center justify-between gap-3">
                        <span>状态</span>
                        <span className="font-medium text-[color:var(--text-primary)]">
                          {formatReviewStatus(detail.review.status)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>最后更新</span>
                        <span className="font-medium text-[color:var(--text-primary)]">
                          {formatDateTime(detail.review.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>标签数</span>
                        <span className="font-medium text-[color:var(--text-primary)]">
                          {detail.review.tags.length}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <InlineNotice title="这段会话还没有进入复盘池">
                    先打一个状态或写几句备注，后面筛“仅看已标记样本”时就能直接回到它。
                  </InlineNotice>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => saveReviewMutation.mutate()}
                    disabled={!activeConversationId || saveReviewMutation.isPending}
                  >
                    {saveReviewMutation.isPending ? "保存中..." : "保存复盘标记"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => deleteReviewMutation.mutate()}
                    disabled={!detail.review || deleteReviewMutation.isPending}
                  >
                    {deleteReviewMutation.isPending ? "清除中..." : "清空标记"}
                  </Button>
                </div>

                {saveReviewMutation.error instanceof Error ? (
                  <ErrorBlock message={saveReviewMutation.error.message} />
                ) : null}
                {deleteReviewMutation.error instanceof Error ? (
                  <ErrorBlock message={deleteReviewMutation.error.message} />
                ) : null}
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>会话概览</SectionHeading>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <MetricCard label="当前口径消息" value={detail.stats.messageCount} />
                  <MetricCard label="可见消息" value={detail.stats.visibleMessageCount} />
                  <MetricCard label="留存消息" value={detail.stats.storedMessageCount} />
                  <MetricCard label="近 30 天消息" value={detail.stats.recentMessageCount30d} />
                  <MetricCard label="角色消息" value={detail.stats.characterMessageCount} />
                  <MetricCard label="用户消息" value={detail.stats.userMessageCount} />
                  <MetricCard label="主动消息" value={detail.stats.proactiveMessageCount} />
                  <MetricCard label="附件消息" value={detail.stats.attachmentMessageCount} />
                </div>
              </Card>

              <AdminInfoRows
                title="会话档案"
                rows={[
                  { label: "角色", value: detail.conversation.characterName },
                  {
                    label: "关系",
                    value: detail.conversation.relationship || "未标注关系",
                  },
                  {
                    label: "最后活跃",
                    value: formatDateTime(detail.conversation.lastActivityAt),
                  },
                  {
                    label: "最后清空",
                    value: detail.conversation.lastClearedAt
                      ? formatDateTime(detail.conversation.lastClearedAt)
                      : "未清空",
                  },
                  {
                    label: "平均首响",
                    value: formatDuration(detail.stats.firstResponseAverageMs),
                  },
                  {
                    label: "中位首响",
                    value: formatDuration(detail.stats.firstResponseMedianMs),
                  },
                ]}
              />

              <Card className="space-y-4 bg-[color:var(--surface-console)]">
                <SectionHeading>产品洞察</SectionHeading>
                <div className="grid gap-3 md:grid-cols-2">
                  <MetricCard label="近 7 天活跃天数" value={detail.insight.activeDays7d} />
                  <MetricCard label="近 30 天活跃天数" value={detail.insight.activeDays30d} />
                  <MetricCard
                    label="活跃日均消息"
                    value={detail.insight.averageMessagesPerActiveDay30d ?? "暂无"}
                  />
                  <MetricCard
                    label="高峰工作日"
                    value={detail.insight.mostActiveWeekday || "暂无"}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                      近 7 天消息趋势
                    </div>
                    <TrendBars items={detail.insight.trend7d} />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                      消息结构占比
                    </div>
                    <div className="space-y-2">
                      <RatioBar label="用户消息" value={detail.insight.mix.userShare} tone="slate" />
                      <RatioBar
                        label="角色回复"
                        value={detail.insight.mix.characterShare}
                        tone="emerald"
                      />
                      <RatioBar
                        label="主动消息"
                        value={detail.insight.mix.proactiveShare}
                        tone="amber"
                      />
                      <RatioBar
                        label="附件消息"
                        value={detail.insight.mix.attachmentShare}
                        tone="sky"
                      />
                      <RatioBar
                        label="系统消息"
                        value={detail.insight.mix.systemShare}
                        tone="violet"
                      />
                    </div>
                  </div>
                </div>

                <AdminInfoRows
                  title="最近发言"
                  rows={[
                    {
                      label: "最近一次用户消息",
                      value: formatDateTime(detail.insight.lastUserMessageAt),
                    },
                    {
                      label: "最近一次角色回复",
                      value: formatDateTime(detail.insight.lastCharacterMessageAt),
                    },
                  ]}
                />
              </Card>

              {detail.character ? (
                <Card className="space-y-4 bg-[color:var(--surface-console)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-[color:var(--text-primary)]">
                        {detail.character.name}
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                        {detail.character.relationship}
                      </div>
                    </div>
                    <StatusPill tone={detail.character.isOnline ? "healthy" : "muted"}>
                      {detail.character.isOnline ? "在线" : "离线"}
                    </StatusPill>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      detail.character.expertDomains.length
                        ? detail.character.expertDomains
                        : ["未标注领域"]
                    ).map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-2.5 py-1 text-xs text-[color:var(--text-secondary)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MetricCard
                      label="当前活动"
                      value={formatActivity(detail.character.currentActivity)}
                    />
                    <MetricCard label="亲密度" value={detail.character.intimacyLevel} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/characters/$characterId/runtime"
                      params={{ characterId: detail.character.id }}
                      className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)]"
                    >
                      打开运行逻辑台
                    </Link>
                  </div>
                </Card>
              ) : null}

              <Card className="space-y-4 bg-[color:var(--surface-console)]">
                <SectionHeading>会话级 Token 成本</SectionHeading>
                {tokenUsageQuery.isLoading ? (
                  <LoadingBlock label="正在读取会话成本..." />
                ) : tokenUsageQuery.error instanceof Error ? (
                  <ErrorBlock message={tokenUsageQuery.error.message} />
                ) : tokenUsageQuery.data ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <MetricCard
                        label="累计请求"
                        value={tokenUsageQuery.data.allTimeOverview.requestCount}
                      />
                      <MetricCard
                        label="累计 Token"
                        value={tokenUsageQuery.data.allTimeOverview.totalTokens}
                      />
                      <MetricCard
                        label="累计成本"
                        value={formatCurrency(
                          tokenUsageQuery.data.allTimeOverview.estimatedCost,
                          tokenUsageQuery.data.allTimeOverview.currency,
                        )}
                      />
                      <MetricCard
                        label="近 30 天成本"
                        value={formatCurrency(
                          tokenUsageQuery.data.recent30dOverview.estimatedCost,
                          tokenUsageQuery.data.recent30dOverview.currency,
                        )}
                      />
                    </div>

                    {tokenUsageQuery.data.recent30dTrend.length ? (
                      <div>
                        <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                          近 30 天 Token 趋势
                        </div>
                        <TokenTrendBars
                          items={tokenUsageQuery.data.recent30dTrend.slice(-10)}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-3">
                      <div>
                        <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                          主要模型
                        </div>
                        <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                          {tokenUsageQuery.data.recent30dBreakdown.byModel
                            .slice(0, 3)
                            .map((item) => (
                              <div
                                key={item.key}
                                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2.5"
                              >
                                {item.label} · 请求 {item.requestCount} · Token{" "}
                                {compactInteger(item.totalTokens)}
                              </div>
                            ))}
                        </div>
                      </div>

                      {tokenUsageQuery.data.recent30dBreakdown.byScene.length ? (
                        <div>
                          <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                            主要场景
                          </div>
                          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                            {tokenUsageQuery.data.recent30dBreakdown.byScene
                              .slice(0, 2)
                              .map((item) => (
                                <div
                                  key={item.key}
                                  className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2.5"
                                >
                                  {item.label} · 请求 {item.requestCount} · Token{" "}
                                  {compactInteger(item.totalTokens)}
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : null}

                      {tokenUsageQuery.data.recentRecords.items.length ? (
                        <div>
                          <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">
                            最近请求
                          </div>
                          <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                            {tokenUsageQuery.data.recentRecords.items
                              .slice(0, 4)
                              .map((record) => (
                                <div
                                  key={record.id}
                                  className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2.5"
                                >
                                  {formatDateTime(record.occurredAt)} ·{" "}
                                  {record.model || "未记录模型"} · Token{" "}
                                  {compactInteger(record.totalTokens)}
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </Card>
            </>
          ) : (
            <AdminEmptyState
              title="先选择一个会话"
              description="左侧选中角色会话后，这里会展示复盘入口、角色摘要和成本信息。"
            />
          )}
        </div>
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
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                当前
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            {item.relationship || "未标注关系"}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-[color:var(--text-muted)]">
          <div>{formatCompactDate(item.lastActivityAt)}</div>
          <div className="mt-1">7d {item.recentMessageCount7d}</div>
        </div>
      </div>

      <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
        {formatPreview(item.lastVisibleMessage ?? item.lastStoredMessage ?? null, 96)}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
        <span>可见 {item.visibleMessageCount}</span>
        <span>留存 {item.storedMessageCount}</span>
        <span>30 天 {item.recentMessageCount30d}</span>
        {item.isHidden ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
            已隐藏
          </span>
        ) : null}
        {item.hasClearedHistory ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            含清空前历史
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

function ConversationWorkspaceHeader({
  conversation,
  detail,
  recentCost,
  recentCostCurrency,
}: {
  conversation: AdminChatRecordConversationListItem;
  detail: AdminChatRecordConversationDetail | undefined;
  recentCost: number | null;
  recentCostCurrency: "CNY" | "USD";
}) {
  const characterId = detail?.character?.id ?? conversation.characterId ?? undefined;
  const reviewStatus = detail?.review?.status ?? conversation.review?.status ?? null;

  return (
    <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,249,241,0.96)_48%,rgba(237,248,245,0.94))]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
              当前工作会话
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-semibold text-[color:var(--text-primary)]">
                {conversation.characterName}
              </h3>
              {detail?.character ? (
                <StatusPill tone={detail.character.isOnline ? "healthy" : "muted"}>
                  {detail.character.isOnline ? "在线" : "离线"}
                </StatusPill>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
              {conversation.relationship || "未标注关系"} ·{" "}
              {formatPreview(
                conversation.lastVisibleMessage ?? conversation.lastStoredMessage ?? null,
                160,
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {reviewStatus ? (
                <span className={`rounded-full px-2.5 py-1 text-xs ${reviewBadgeClassName(reviewStatus)}`}>
                  {formatReviewStatus(reviewStatus)}
                </span>
              ) : (
                <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-xs text-[color:var(--text-secondary)]">
                  未进入复盘池
                </span>
              )}
              {conversation.isHidden ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                  已隐藏会话
                </span>
              ) : null}
              {conversation.hasClearedHistory ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                  含清空前历史
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {characterId ? (
              <Link
                to="/characters/$characterId/runtime"
                params={{ characterId }}
                className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-white px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
              >
                运行逻辑台
              </Link>
            ) : null}
            <a
              href={buildReplyLogicHref(conversation.id, characterId)}
              className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-white px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
            >
              回复逻辑
            </a>
            <a
              href={buildTokenUsageHref(conversation.id, characterId)}
              className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-white px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
            >
              Token 用量
            </a>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="最近活跃"
            value={formatCompactDate(conversation.lastActivityAt)}
          />
          <MetricCard
            label="近 30 天消息"
            value={detail?.stats.recentMessageCount30d ?? conversation.recentMessageCount30d}
          />
          <MetricCard
            label="留存消息"
            value={detail?.stats.storedMessageCount ?? conversation.storedMessageCount}
          />
          <MetricCard
            label="近 30 天成本"
            value={
              recentCost == null
                ? "读取中"
                : formatCurrency(recentCost, recentCostCurrency)
            }
          />
        </div>
      </div>
    </Card>
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
      <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1 text-[11px] font-medium text-[color:var(--text-muted)]">
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
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                命中
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
          {message.text?.trim() || (message.attachment ? "无额外文本描述" : "空消息")}
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

function TrendBars({
  items,
}: {
  items: Array<{
    date: string;
    totalMessages: number;
    userMessages: number;
    characterMessages: number;
  }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.totalMessages), 1);

  return (
    <div className="flex items-end gap-2 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-4">
      {items.map((item) => (
        <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-24 w-full items-end justify-center">
            <div
              className="w-full max-w-7 rounded-t-[10px] bg-[linear-gradient(180deg,#0f766e_0%,#34d399_100%)]"
              style={{
                height: `${Math.max(8, Math.round((item.totalMessages / maxValue) * 96))}px`,
              }}
              title={`${item.date} · 总 ${item.totalMessages} · 用户 ${item.userMessages} · 角色 ${item.characterMessages}`}
            />
          </div>
          <div className="text-[11px] text-[color:var(--text-muted)]">
            {item.date.slice(5).replace("-", "/")}
          </div>
          <div className="text-[11px] font-medium text-[color:var(--text-primary)]">
            {item.totalMessages}
          </div>
        </div>
      ))}
    </div>
  );
}

function RatioBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "amber" | "sky" | "violet";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-400"
        : tone === "sky"
          ? "bg-sky-500"
          : tone === "violet"
            ? "bg-violet-500"
            : "bg-slate-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[color:var(--text-secondary)]">{label}</span>
        <span className="font-medium text-[color:var(--text-primary)]">
          {formatPercent(value)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[color:var(--surface-soft)]">
        <div
          className={`h-2 rounded-full ${toneClass}`}
          style={{ width: `${Math.max(value * 100, value > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function TokenTrendBars({
  items,
}: {
  items: Array<{
    bucketStart: string;
    label: string;
    totalTokens: number;
    requestCount: number;
  }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.totalTokens), 1);

  return (
    <div className="flex items-end gap-2 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-4">
      {items.map((item) => (
        <div key={item.bucketStart} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-20 w-full items-end justify-center">
            <div
              className="w-full max-w-7 rounded-t-[10px] bg-[linear-gradient(180deg,#2563eb_0%,#60a5fa_100%)]"
              style={{
                height: `${Math.max(8, Math.round((item.totalTokens / maxValue) * 80))}px`,
              }}
              title={`${item.label} · Token ${item.totalTokens} · 请求 ${item.requestCount}`}
            />
          </div>
          <div className="text-[11px] text-[color:var(--text-muted)]">{item.label}</div>
          <div className="text-[11px] font-medium text-[color:var(--text-primary)]">
            {compactInteger(item.totalTokens)}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-1 text-xs text-[color:var(--text-secondary)]">
      {label}
    </span>
  );
}

function attachmentLabel(message: Message) {
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
    return `表情：${attachment.label || attachment.stickerId}`;
  }
  if (attachment.kind === "contact_card") {
    return `名片：${attachment.name}`;
  }
  if (attachment.kind === "location_card") {
    return `位置：${attachment.title}`;
  }
  return `笔记：${attachment.title}`;
}

function formatPreview(message: Message | null, maxLength = 120) {
  if (!message) {
    return "暂无消息";
  }

  const rawText = message.attachment
    ? attachmentLabel(message)
    : message.text || "空消息";
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
  if (type === "contact_card") {
    return "名片";
  }
  if (type === "location_card") {
    return "位置";
  }
  if (type === "note_card") {
    return "笔记";
  }
  return TYPE_OPTIONS.find((item) => item.value === type)?.label || type;
}

function matchesMessageType(
  message: Message,
  filter: AdminChatRecordConversationSearchQuery["messageType"] | "all",
) {
  if (filter === "all" || !filter) {
    return true;
  }
  if (filter === "text") {
    return message.type === "text" || message.type === "proactive";
  }
  return message.type === filter;
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

function formatCurrency(value: number, currency: "CNY" | "USD") {
  return formatAdminCurrency(value, currency, currency === "USD" ? 4 : 2);
}

function formatPercent(value: number) {
  return formatAdminPercent(value, value > 0 && value < 0.1 ? 1 : 0);
}

function compactInteger(value: number) {
  if (value >= 10000) {
    return formatAdminCompactInteger(value);
  }
  return String(value);
}

function formatDuration(value: number | null) {
  if (value == null) {
    return "暂无";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  const seconds = Math.round(value / 1000);
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分钟`;
}

function formatActivity(value?: string | null) {
  if (value === "working") return "工作中";
  if (value === "eating") return "吃饭中";
  if (value === "resting") return "休息中";
  if (value === "commuting") return "通勤中";
  if (value === "sleeping") return "睡觉中";
  if (value === "free") return "空闲";
  return value || "未标注";
}

function parseReviewTags(value: string) {
  return value
    .split(/[,\n，]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatReviewStatus(status: AdminChatRecordReviewStatus) {
  return REVIEW_STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
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

function buildReplyLogicHref(conversationId: string, characterId?: string | null) {
  const params = new URLSearchParams();
  params.set("scope", "conversation");
  params.set("conversationId", conversationId);
  if (characterId) {
    params.set("characterId", characterId);
  }
  return `/reply-logic?${params.toString()}`;
}

function buildTokenUsageHref(conversationId: string, characterId?: string | null) {
  const params = new URLSearchParams();
  params.set("conversationId", conversationId);
  params.set("from", shiftDate(-29));
  params.set("to", formatDateInput(new Date()));
  if (characterId) {
    params.set("characterId", characterId);
  }
  return `/token-usage?${params.toString()}`;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return formatDateInput(next);
}

function downloadExportFile(file: AdminChatRecordConversationExportResponse) {
  const blob = new Blob([file.content], { type: file.contentType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function buildConversationFilterLabels({
  characterName,
  includeHidden,
  onlyReviewed,
  includeClearedHistory,
  activityWindow,
  sortBy,
}: {
  characterName: string;
  includeHidden: boolean;
  onlyReviewed: boolean;
  includeClearedHistory: boolean;
  activityWindow: AdminChatRecordActivityWindow;
  sortBy: AdminChatRecordConversationListQuery["sortBy"];
}) {
  const labels: string[] = [];
  if (characterName) {
    labels.push(`角色：${characterName}`);
  }
  if (includeHidden) {
    labels.push("显示隐藏会话");
  }
  if (onlyReviewed) {
    labels.push("仅看已标记样本");
  }
  if (includeClearedHistory) {
    labels.push("包含清空前历史");
  }
  if (activityWindow !== "all") {
    labels.push(
      `活跃范围：${
        ACTIVITY_WINDOW_OPTIONS.find((item) => item.value === activityWindow)?.label
      }`,
    );
  }
  if (sortBy && sortBy !== "lastActivityAt") {
    labels.push(
      `排序：${SORT_OPTIONS.find((item) => item.value === sortBy)?.label || sortBy}`,
    );
  }
  return labels;
}

function buildSearchLabels(search: {
  keyword: string;
  messageType: AdminChatRecordConversationSearchQuery["messageType"] | "all";
  dateFrom: string;
  dateTo: string;
}) {
  const labels: string[] = [];
  if (search.keyword.trim()) {
    labels.push(`关键词：${search.keyword.trim()}`);
  }
  if (search.messageType !== "all") {
    labels.push(
      `类型：${
        TYPE_OPTIONS.find((item) => item.value === search.messageType)?.label ||
        search.messageType
      }`,
    );
  }
  if (search.dateFrom) {
    labels.push(`起始：${search.dateFrom}`);
  }
  if (search.dateTo) {
    labels.push(`结束：${search.dateTo}`);
  }
  return labels;
}

function normalizeReviewNote(value?: string | null) {
  return value?.trim() || "";
}

function isReviewDraftDirty(
  review: AdminChatRecordConversationReview | null,
  draft: ReviewDraft,
) {
  const currentStatus = review?.status ?? "backlog";
  const currentTags = review?.tags ?? [];
  const currentNote = normalizeReviewNote(review?.note);
  const draftTags = parseReviewTags(draft.tags);

  return (
    draft.status !== currentStatus ||
    draftTags.join("|") !== currentTags.join("|") ||
    normalizeReviewNote(draft.note) !== currentNote
  );
}

function appendReviewTagValue(currentValue: string, tag: string) {
  const tags = parseReviewTags(currentValue);
  if (!tags.includes(tag)) {
    tags.push(tag);
  }
  return tags.join(", ");
}

function buildOperatorSummary({
  detail,
  includeClearedHistory,
  focusedMessageId,
  reviewDirty,
  searchedTotal,
  recentCost,
  recentCostCurrency,
}: {
  detail: AdminChatRecordConversationDetail | undefined;
  includeClearedHistory: boolean;
  focusedMessageId: string;
  reviewDirty: boolean;
  searchedTotal: number;
  recentCost: number | null;
  recentCostCurrency: "CNY" | "USD";
}) {
  if (!detail) {
    return {
      title: "先选择一个会话进入工作区",
      description:
        "左侧锁定角色样本，中间阅读完整上下文，右侧再完成复盘标记和联动操作。",
      tone: "muted" as const,
    };
  }

  if (reviewDirty) {
    return {
      title: "复盘草稿未保存",
      description:
        "右侧的状态、标签或备注已经变更，保存后这段会话才能稳定进入样本池筛选。",
      tone: "warning" as const,
    };
  }

  if (focusedMessageId) {
    return {
      title: "当前处于命中上下文模式",
      description:
        "时间线围绕一条命中消息展开，适合快速判断片段质量；处理完后可回到最新消息继续浏览全局。",
      tone: "info" as const,
    };
  }

  if (!detail.review) {
    return {
      title: "建议先把这段会话纳入复盘池",
      description:
        "当前尚未标记状态、标签和备注。先做样本归档，后续运营回看和过滤才会稳定可用。",
      tone: "info" as const,
    };
  }

  if (includeClearedHistory) {
    return {
      title: "当前包含清空前历史",
      description:
        "适合追溯长期样本，但这部分内容用户前台可能已经不可见，操作时要明确这是后台留存口径。",
      tone: "warning" as const,
    };
  }

  if (searchedTotal > 0) {
    return {
      title: `已命中 ${searchedTotal} 条搜索结果`,
      description:
        "可以直接点命中片段进入上下文，再结合右侧洞察判断这段样本应归入哪个复盘状态。",
      tone: "success" as const,
    };
  }

  if (recentCost != null && recentCost > 0) {
    return {
      title: "当前会话可直接进入成本与质量联动判断",
      description: `近 30 天成本 ${formatCurrency(recentCost, recentCostCurrency)}，建议结合回复节奏、主动消息占比和复盘状态一起判断是否值得继续优化。`,
      tone: "success" as const,
    };
  }

  return {
    title: "当前会话已进入稳定查看状态",
    description:
      "可以继续查看上下文、补充复盘备注，或者跳转到回复逻辑台和 Token 用量页做进一步分析。",
    tone: "muted" as const,
  };
}
