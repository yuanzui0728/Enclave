import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  AdminChatRecordActivityWindow,
  AdminChatRecordConversationExportResponse,
  AdminChatRecordConversationListQuery,
  AdminChatRecordConversationSearchQuery,
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
import { AdminEmptyState, AdminInfoRows, AdminPageHero } from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { chatRecordsAdminApi } from "../lib/chat-records-api";
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

export function ChatRecordsPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [characterId, setCharacterId] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [includeClearedHistory, setIncludeClearedHistory] = useState(false);
  const [activityWindow, setActivityWindow] =
    useState<AdminChatRecordActivityWindow>("all");
  const [sortBy, setSortBy] =
    useState<AdminChatRecordConversationListQuery["sortBy"]>("lastActivityAt");
  const [page, setPage] = useState(1);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [focusedMessageId, setFocusedMessageId] = useState("");
  const [timelineMessageType, setTimelineMessageType] =
    useState<AdminChatRecordConversationSearchQuery["messageType"] | "all">("all");
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

  const listQuery = useMemo(
    () => ({
      characterId: characterId || undefined,
      includeHidden,
      activityWindow,
      sortBy,
      page,
      pageSize: 24,
    }),
    [activityWindow, characterId, includeHidden, page, sortBy],
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

  const conversations = conversationsQuery.data?.items ?? [];
  const activeConversationId = selectedConversationId || conversations[0]?.id || "";

  useEffect(() => {
    if (!conversations.length) {
      if (selectedConversationId) {
        setSelectedConversationId("");
      }
      return;
    }
    if (!selectedConversationId || !conversations.some((item) => item.id === selectedConversationId)) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    setFocusedMessageId("");
  }, [activeConversationId, includeClearedHistory]);

  const detailQuery = useQuery({
    queryKey: ["admin-chat-records-detail", baseUrl, activeConversationId, includeClearedHistory],
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
  const messagesQuery = useInfiniteQuery({
    queryKey: ["admin-chat-records-messages", baseUrl, activeConversationId, includeClearedHistory, focusedMessageId],
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
    getNextPageParam: (lastPage) => (lastPage.nextCursor ? Number(lastPage.nextCursor) : undefined),
  });

  const detail = detailQuery.data;
  const messages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    if (!pages.length) {
      return [] as Message[];
    }
    return focusedMessageId ? pages[0].items : [...pages].reverse().flatMap((page) => page.items);
  }, [focusedMessageId, messagesQuery.data?.pages]);

  const visibleMessages = useMemo(() => {
    return messages.filter((message) => matchesMessageType(message, timelineMessageType));
  }, [messages, timelineMessageType]);

  function runSearch() {
    if (!activeConversationId) {
      return;
    }
    searchMutation.mutate({
      keyword: search.keyword.trim() || undefined,
      messageType: search.messageType !== "all" ? search.messageType : undefined,
      dateFrom: search.dateFrom || undefined,
      dateTo: search.dateTo || undefined,
      includeClearedHistory,
    });
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
        description="把世界主人与角色的真实单聊沉淀成可检索、可回看、可分析的产品样本池。"
        metrics={[
          { label: "总会话数", value: overviewQuery.data?.totalConversationCount ?? 0 },
          { label: "近 7 天活跃", value: overviewQuery.data?.activeConversationCount7d ?? 0 },
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

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <Card className="space-y-4 bg-[color:var(--surface-console)]">
          <SectionHeading>会话筛选</SectionHeading>
          <select value={characterId} onChange={(event) => { setCharacterId(event.target.value); setPage(1); }} className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm">
            <option value="">全部角色</option>
            {(charactersQuery.data ?? []).map((character: Character) => <option key={character.id} value={character.id}>{character.name}</option>)}
          </select>
          <select value={sortBy} onChange={(event) => { setSortBy(event.target.value as AdminChatRecordConversationListQuery["sortBy"]); setPage(1); }} className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm">
            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-2">
            <ToggleChip label="显示隐藏会话" checked={includeHidden} onChange={(event) => { setIncludeHidden(event.target.checked); setPage(1); }} />
            <ToggleChip label="包含清空前历史" checked={includeClearedHistory} onChange={(event) => setIncludeClearedHistory(event.target.checked)} />
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
          <div className="space-y-3">
            {conversations.length ? conversations.map((item) => (
              <button key={item.id} type="button" onClick={() => { setSelectedConversationId(item.id); searchMutation.reset(); }} className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${item.id === activeConversationId ? "border-[color:var(--border-brand)] bg-[color:var(--surface-card)]" : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] hover:border-[color:var(--border-subtle)]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text-primary)]">{item.characterName}</div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">{item.relationship || "未标注关系"}</div>
                  </div>
                  <span className="text-[11px] text-[color:var(--text-muted)]">{formatCompactDate(item.lastActivityAt)}</span>
                </div>
                <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">{formatPreview(item.lastVisibleMessage ?? item.lastStoredMessage ?? null)}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[color:var(--text-muted)]">
                  <span>可见 {item.visibleMessageCount}</span>
                  <span>留存 {item.storedMessageCount}</span>
                  <span>30 天 {item.recentMessageCount30d}</span>
                  {item.isHidden ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">已隐藏</span> : null}
                  {item.hasClearedHistory ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">含清空前历史</span> : null}
                </div>
              </button>
            )) : <AdminEmptyState title="没有符合条件的会话" description="可以切回全部角色或包含隐藏会话后再查看。" />}
          </div>
          {conversationsQuery.data && conversationsQuery.data.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</Button>
              <span className="text-xs text-[color:var(--text-muted)]">{page} / {conversationsQuery.data.totalPages}</span>
              <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(conversationsQuery.data!.totalPages, current + 1))} disabled={page >= conversationsQuery.data.totalPages}>下一页</Button>
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 bg-[color:var(--surface-console)]">
          <div className="grid gap-3 md:grid-cols-2">
            <input value={search.keyword} onChange={(event) => setSearch((current) => ({ ...current, keyword: event.target.value }))} placeholder="搜索需求、措辞或话题" className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm" />
            <select value={search.messageType} onChange={(event) => setSearch((current) => ({ ...current, messageType: event.target.value as AdminChatRecordConversationSearchQuery["messageType"] | "all" }))} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm">
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input type="date" value={search.dateFrom} onChange={(event) => setSearch((current) => ({ ...current, dateFrom: event.target.value }))} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm" />
            <input type="date" value={search.dateTo} onChange={(event) => setSearch((current) => ({ ...current, dateTo: event.target.value }))} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" size="sm" onClick={runSearch} disabled={!activeConversationId || searchMutation.isPending}>搜索会话</Button>
            {focusedMessageId ? <Button variant="secondary" size="sm" onClick={() => setFocusedMessageId("")}>返回最新消息</Button> : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportMutation.mutate("markdown")}
              disabled={!activeConversationId || exportMutation.isPending}
            >
              {exportMutation.isPending ? "导出中..." : "导出 Markdown"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportMutation.mutate("json")}
              disabled={!activeConversationId || exportMutation.isPending}
            >
              {exportMutation.isPending ? "导出中..." : "导出 JSON"}
            </Button>
          </div>
          {exportMutation.error instanceof Error ? (
            <ErrorBlock message={exportMutation.error.message} />
          ) : null}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[color:var(--text-muted)]">时间线筛选</span>
            <select
              value={timelineMessageType}
              onChange={(event) =>
                setTimelineMessageType(
                  event.target.value as AdminChatRecordConversationSearchQuery["messageType"] | "all",
                )
              }
              className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {timelineMessageType !== "all" ? (
              <span className="text-xs text-[color:var(--text-muted)]">
                当前只显示 {TYPE_OPTIONS.find((item) => item.value === timelineMessageType)?.label || timelineMessageType}
              </span>
            ) : null}
          </div>
          {includeClearedHistory ? <InlineNotice title="当前正在查看清空前历史">这里会展示数据库仍保留的完整会话样本，可能包含用户在前台已清空的聊天。</InlineNotice> : null}
          {searchMutation.data?.items.length ? (
            <div className="space-y-2 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-3">
              <div className="text-xs text-[color:var(--text-muted)]">命中 {searchMutation.data.total} 条消息，点击即可定位上下文。</div>
              {searchMutation.data.items.map((item) => (
                <button key={item.messageId} type="button" onClick={() => setFocusedMessageId(item.messageId)} className="block w-full rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-3 text-left">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">{item.senderName}</div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">{formatCompactDate(item.createdAt)} · {formatMessageType(item.messageType)}</div>
                  <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{item.previewText || "空消息"}</div>
                </button>
              ))}
            </div>
          ) : null}
          {!focusedMessageId && messagesQuery.data?.pages.at(-1)?.hasMore ? (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => void messagesQuery.fetchNextPage()} disabled={messagesQuery.isFetchingNextPage}>
                {messagesQuery.isFetchingNextPage ? "正在加载更早消息..." : "加载更早消息"}
              </Button>
            </div>
          ) : null}
          <div className="space-y-3">
            {messagesQuery.isLoading ? <LoadingBlock label="正在读取时间线..." /> : messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : visibleMessages.length ? visibleMessages.map((message) => <MessageCard key={message.id} message={message} highlighted={focusedMessageId === message.id} />) : messages.length ? <AdminEmptyState title="当前筛选条件下没有消息" description="可以切回全部类型，或者尝试通过搜索定位具体消息。" /> : <AdminEmptyState title="当前会话还没有消息" description="这个角色的单聊档案还没有积累可回看的历史。" />}
          </div>
        </Card>

        <div className="space-y-4">
          {detailQuery.isLoading ? <LoadingBlock label="正在整理会话洞察..." /> : detailQuery.error instanceof Error ? <ErrorBlock message={detailQuery.error.message} /> : detail ? (
            <>
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

              <AdminInfoRows title="会话档案" rows={[
                { label: "角色", value: detail.conversation.characterName },
                { label: "最后活跃", value: formatDateTime(detail.conversation.lastActivityAt) },
                { label: "最后清空", value: detail.conversation.lastClearedAt ? formatDateTime(detail.conversation.lastClearedAt) : "未清空" },
                { label: "平均首响", value: formatDuration(detail.stats.firstResponseAverageMs) },
                { label: "中位首响", value: formatDuration(detail.stats.firstResponseMedianMs) },
              ]} />

              <Card className="space-y-4 bg-[color:var(--surface-console)]">
                <SectionHeading>产品洞察</SectionHeading>
                <div className="grid gap-3 md:grid-cols-2">
                  <MetricCard label="近 7 天活跃天数" value={detail.insight.activeDays7d} />
                  <MetricCard label="近 30 天活跃天数" value={detail.insight.activeDays30d} />
                  <MetricCard label="活跃日均消息" value={detail.insight.averageMessagesPerActiveDay30d ?? "暂无"} />
                  <MetricCard label="高峰工作日" value={detail.insight.mostActiveWeekday || "暂无"} />
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">近 7 天消息趋势</div>
                    <TrendBars items={detail.insight.trend7d} />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">消息结构占比</div>
                    <div className="space-y-2">
                      <RatioBar label="用户消息" value={detail.insight.mix.userShare} tone="slate" />
                      <RatioBar label="角色回复" value={detail.insight.mix.characterShare} tone="emerald" />
                      <RatioBar label="主动消息" value={detail.insight.mix.proactiveShare} tone="amber" />
                      <RatioBar label="附件消息" value={detail.insight.mix.attachmentShare} tone="sky" />
                      <RatioBar label="系统消息" value={detail.insight.mix.systemShare} tone="violet" />
                    </div>
                  </div>
                </div>
                <AdminInfoRows
                  title="最近发言"
                  rows={[
                    { label: "最近一次用户消息", value: formatDateTime(detail.insight.lastUserMessageAt) },
                    { label: "最近一次角色回复", value: formatDateTime(detail.insight.lastCharacterMessageAt) },
                  ]}
                />
              </Card>

              {detail.character ? (
                <Card className="space-y-4 bg-[color:var(--surface-console)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-[color:var(--text-primary)]">{detail.character.name}</div>
                      <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{detail.character.relationship}</div>
                    </div>
                    <StatusPill tone={detail.character.isOnline ? "healthy" : "muted"}>{detail.character.isOnline ? "在线" : "离线"}</StatusPill>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(detail.character.expertDomains.length ? detail.character.expertDomains : ["未标注领域"]).map((item) => <span key={item} className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-2.5 py-1 text-xs text-[color:var(--text-secondary)]">{item}</span>)}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MetricCard label="当前活动" value={formatActivity(detail.character.currentActivity)} />
                    <MetricCard label="亲密度" value={detail.character.intimacyLevel} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link to="/characters/$characterId/runtime" params={{ characterId: detail.character.id }} className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)]">打开运行逻辑台</Link>
                    <a href={buildReplyLogicHref(detail.conversation.id, detail.character.id)} className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)]">查看回复逻辑</a>
                    <a href={buildTokenUsageHref(detail.conversation.id, detail.character.id)} className="inline-flex items-center justify-center rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-primary)]">查看 Token 用量</a>
                  </div>
                </Card>
              ) : null}

              <Card className="space-y-4 bg-[color:var(--surface-console)]">
                <SectionHeading>会话级 Token 成本</SectionHeading>
                {tokenUsageQuery.isLoading ? <LoadingBlock label="正在读取会话成本..." /> : tokenUsageQuery.error instanceof Error ? <ErrorBlock message={tokenUsageQuery.error.message} /> : tokenUsageQuery.data ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <MetricCard label="累计请求" value={tokenUsageQuery.data.allTimeOverview.requestCount} />
                      <MetricCard label="累计 Token" value={tokenUsageQuery.data.allTimeOverview.totalTokens} />
                      <MetricCard label="累计成本" value={formatCurrency(tokenUsageQuery.data.allTimeOverview.estimatedCost, tokenUsageQuery.data.allTimeOverview.currency)} />
                      <MetricCard label="近 30 天成本" value={formatCurrency(tokenUsageQuery.data.recent30dOverview.estimatedCost, tokenUsageQuery.data.recent30dOverview.currency)} />
                    </div>
                    {tokenUsageQuery.data.recent30dTrend.length ? (
                      <div>
                        <div className="mb-2 text-xs font-medium text-[color:var(--text-muted)]">近 30 天 Token 趋势</div>
                        <TokenTrendBars items={tokenUsageQuery.data.recent30dTrend.slice(-10)} />
                      </div>
                    ) : null}
                    <div className="space-y-2 text-sm text-[color:var(--text-secondary)]">
                      {(tokenUsageQuery.data.recent30dBreakdown.byModel.slice(0, 3)).map((item) => <div key={item.key} className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2.5">{item.label} · 请求 {item.requestCount} · Token {item.totalTokens}</div>)}
                      {tokenUsageQuery.data.recentRecords.items.map((record) => <div key={record.id} className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2.5">{formatDateTime(record.occurredAt)} · {record.model || "未记录模型"} · Token {record.totalTokens}</div>)}
                    </div>
                  </>
                ) : null}
              </Card>
            </>
          ) : <AdminEmptyState title="先选择一个会话" description="左侧选中角色会话后，这里会展示会话结构、角色摘要和成本信息。" />}
        </div>
      </div>
    </div>
  );
}

function MessageCard({ message, highlighted }: { message: Message; highlighted: boolean }) {
  return (
    <div className={`rounded-[22px] border px-4 py-4 shadow-[var(--shadow-soft)] ${highlighted ? "border-[color:var(--border-brand)] bg-white" : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">{message.senderName}</div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">{formatDateTime(message.createdAt)}</div>
        </div>
        <StatusPill tone={message.senderType === "character" ? "healthy" : message.senderType === "system" ? "warning" : "muted"}>{formatMessageType(message.type)}</StatusPill>
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[color:var(--text-secondary)]">{message.text?.trim() || "空消息"}</div>
      {message.attachment ? <div className="mt-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm text-[color:var(--text-secondary)]">{attachmentLabel(message)}</div> : null}
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
              style={{ height: `${Math.max(8, Math.round((item.totalMessages / maxValue) * 96))}px` }}
              title={`${item.date} · 总 ${item.totalMessages} · 用户 ${item.userMessages} · 角色 ${item.characterMessages}`}
            />
          </div>
          <div className="text-[11px] text-[color:var(--text-muted)]">{item.date.slice(5).replace("-", "/")}</div>
          <div className="text-[11px] font-medium text-[color:var(--text-primary)]">{item.totalMessages}</div>
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
        <span className="font-medium text-[color:var(--text-primary)]">{formatPercent(value)}</span>
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
              style={{ height: `${Math.max(8, Math.round((item.totalTokens / maxValue) * 80))}px` }}
              title={`${item.label} · Token ${item.totalTokens} · 请求 ${item.requestCount}`}
            />
          </div>
          <div className="text-[11px] text-[color:var(--text-muted)]">{item.label}</div>
          <div className="text-[11px] font-medium text-[color:var(--text-primary)]">{compactInteger(item.totalTokens)}</div>
        </div>
      ))}
    </div>
  );
}

function attachmentLabel(message: Message) {
  const attachment = message.attachment;
  if (!attachment) {
    return "";
  }
  if (attachment.kind === "image" || attachment.kind === "file" || attachment.kind === "voice") {
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

function formatPreview(message: Message | null) {
  if (!message) {
    return "暂无消息";
  }
  return `${message.senderName}：${message.attachment ? attachmentLabel(message) : message.text || "空消息"}`;
}

function formatMessageType(type: Message["type"]) {
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
  if (!value) {
    return "暂无";
  }
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
  }
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatCurrency(value: number, currency: "CNY" | "USD") {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: currency === "USD" ? 4 : 2 }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    maximumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
  }).format(value);
}

function compactInteger(value: number) {
  if (value >= 10000) {
    return `${Math.round((value / 10000) * 10) / 10}w`;
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
