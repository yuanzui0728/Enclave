import {
  type Dispatch,
  type SetStateAction,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AdminCreateGameCatalogRequest,
  AdminGameCatalogDetail,
  AdminGameCatalogItem,
  AdminUpdateGameCatalogRequest,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SelectField,
  StatusPill,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminDetailPanel,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminMiniPanel,
  AdminPageHero,
  AdminTabs,
} from "../components/admin-workbench";
import { GameCurationWorkbench } from "../components/game-curation-workbench";
import { GameReleaseWorkbench } from "../components/game-release-workbench";
import { GameSubmissionWorkbench } from "../components/game-submission-workbench";
import { adminApi } from "../lib/admin-api";
import { compareAdminText } from "../lib/format";

type GameWorkbenchDraft = {
  id: string;
  name: string;
  slogan: string;
  description: string;
  studio: string;
  badge: string;
  heroLabel: string;
  category: AdminGameCatalogItem["category"];
  tone: AdminGameCatalogItem["tone"];
  deckLabel: string;
  estimatedDuration: string;
  rewardLabel: string;
  sessionObjective: string;
  publisherKind: AdminGameCatalogItem["publisherKind"];
  productionKind: AdminGameCatalogItem["productionKind"];
  runtimeMode: AdminGameCatalogItem["runtimeMode"];
  reviewStatus: AdminGameCatalogItem["reviewStatus"];
  visibilityScope: AdminGameCatalogItem["visibilityScope"];
  sourceCharacterId: string;
  sourceCharacterName: string;
  aiHighlightsText: string;
  tagsText: string;
  updateNote: string;
  playersLabel: string;
  friendsLabel: string;
  sortOrder: string;
};

const CATEGORY_OPTIONS: Array<{
  value: AdminGameCatalogItem["category"];
  label: string;
}> = [
  { value: "featured", label: "推荐" },
  { value: "party", label: "聚会" },
  { value: "competitive", label: "竞技" },
  { value: "relax", label: "休闲" },
  { value: "strategy", label: "经营" },
];

const TONE_OPTIONS: Array<{
  value: AdminGameCatalogItem["tone"];
  label: string;
}> = [
  { value: "forest", label: "Forest" },
  { value: "gold", label: "Gold" },
  { value: "ocean", label: "Ocean" },
  { value: "violet", label: "Violet" },
  { value: "sunset", label: "Sunset" },
  { value: "mint", label: "Mint" },
];

const PUBLISHER_OPTIONS: Array<{
  value: AdminGameCatalogItem["publisherKind"];
  label: string;
}> = [
  { value: "platform_official", label: "官方出品" },
  { value: "third_party", label: "第三方上传" },
  { value: "character_creator", label: "角色出品" },
];

const PRODUCTION_OPTIONS: Array<{
  value: AdminGameCatalogItem["productionKind"];
  label: string;
}> = [
  { value: "human_authored", label: "人工制作" },
  { value: "ai_assisted", label: "AI 辅助" },
  { value: "ai_generated", label: "AI 生成" },
  { value: "character_generated", label: "角色生成" },
];

const RUNTIME_OPTIONS: Array<{
  value: AdminGameCatalogItem["runtimeMode"];
  label: string;
}> = [
  { value: "workspace_mock", label: "工作区占位" },
  { value: "chat_native", label: "聊天式 AI 游戏" },
  { value: "embedded_web", label: "嵌入式 Web" },
  { value: "remote_session", label: "远程会话" },
];

const REVIEW_OPTIONS: Array<{
  value: AdminGameCatalogItem["reviewStatus"];
  label: string;
}> = [
  { value: "internal_seed", label: "内部种子" },
  { value: "pending_review", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "suspended", label: "已暂停" },
];

const VISIBILITY_OPTIONS: Array<{
  value: AdminGameCatalogItem["visibilityScope"];
  label: string;
}> = [
  { value: "featured", label: "主推可见" },
  { value: "published", label: "正式发布" },
  { value: "coming_soon", label: "即将上线" },
  { value: "internal", label: "内部可见" },
];

function createEmptyDraft(indexHint = 1): GameWorkbenchDraft {
  return {
    id: "",
    name: "",
    slogan: "",
    description: "",
    studio: "",
    badge: "",
    heroLabel: "",
    category: "featured",
    tone: "forest",
    deckLabel: "",
    estimatedDuration: "",
    rewardLabel: "",
    sessionObjective: "",
    publisherKind: "platform_official",
    productionKind: "ai_assisted",
    runtimeMode: "workspace_mock",
    reviewStatus: "pending_review",
    visibilityScope: "internal",
    sourceCharacterId: "",
    sourceCharacterName: "",
    aiHighlightsText: "",
    tagsText: "",
    updateNote: "",
    playersLabel: "",
    friendsLabel: "",
    sortOrder: String(indexHint),
  };
}

function draftFromGame(game: AdminGameCatalogDetail): GameWorkbenchDraft {
  return {
    id: game.id,
    name: game.name,
    slogan: game.slogan,
    description: game.description,
    studio: game.studio,
    badge: game.badge,
    heroLabel: game.heroLabel,
    category: game.category,
    tone: game.tone,
    deckLabel: game.deckLabel,
    estimatedDuration: game.estimatedDuration,
    rewardLabel: game.rewardLabel,
    sessionObjective: game.sessionObjective,
    publisherKind: game.publisherKind,
    productionKind: game.productionKind,
    runtimeMode: game.runtimeMode,
    reviewStatus: game.reviewStatus,
    visibilityScope: game.visibilityScope,
    sourceCharacterId: game.sourceCharacterId ?? "",
    sourceCharacterName: game.sourceCharacterName ?? "",
    aiHighlightsText: game.aiHighlights.join("，"),
    tagsText: game.tags.join("，"),
    updateNote: game.updateNote,
    playersLabel: game.playersLabel,
    friendsLabel: game.friendsLabel,
    sortOrder: String(game.sortOrder),
  };
}

function splitCommaLikeText(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCreatePayload(draft: GameWorkbenchDraft): AdminCreateGameCatalogRequest {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    slogan: draft.slogan.trim(),
    description: draft.description.trim(),
    studio: draft.studio.trim(),
    badge: draft.badge.trim(),
    heroLabel: draft.heroLabel.trim(),
    category: draft.category,
    tone: draft.tone,
    deckLabel: draft.deckLabel.trim(),
    estimatedDuration: draft.estimatedDuration.trim(),
    rewardLabel: draft.rewardLabel.trim(),
    sessionObjective: draft.sessionObjective.trim(),
    publisherKind: draft.publisherKind,
    productionKind: draft.productionKind,
    runtimeMode: draft.runtimeMode,
    reviewStatus: draft.reviewStatus,
    visibilityScope: draft.visibilityScope,
    sourceCharacterId: draft.sourceCharacterId.trim() || null,
    sourceCharacterName: draft.sourceCharacterName.trim() || null,
    aiHighlights: splitCommaLikeText(draft.aiHighlightsText),
    tags: splitCommaLikeText(draft.tagsText),
    updateNote: draft.updateNote.trim(),
    playersLabel: draft.playersLabel.trim(),
    friendsLabel: draft.friendsLabel.trim(),
    sortOrder: Number(draft.sortOrder) || 0,
  };
}

function toUpdatePayload(draft: GameWorkbenchDraft): AdminUpdateGameCatalogRequest {
  return {
    name: draft.name.trim(),
    slogan: draft.slogan.trim(),
    description: draft.description.trim(),
    studio: draft.studio.trim(),
    badge: draft.badge.trim(),
    heroLabel: draft.heroLabel.trim(),
    category: draft.category,
    tone: draft.tone,
    deckLabel: draft.deckLabel.trim(),
    estimatedDuration: draft.estimatedDuration.trim(),
    rewardLabel: draft.rewardLabel.trim(),
    sessionObjective: draft.sessionObjective.trim(),
    publisherKind: draft.publisherKind,
    productionKind: draft.productionKind,
    runtimeMode: draft.runtimeMode,
    reviewStatus: draft.reviewStatus,
    visibilityScope: draft.visibilityScope,
    sourceCharacterId: draft.sourceCharacterId.trim() || null,
    sourceCharacterName: draft.sourceCharacterName.trim() || null,
    aiHighlights: splitCommaLikeText(draft.aiHighlightsText),
    tags: splitCommaLikeText(draft.tagsText),
    updateNote: draft.updateNote.trim(),
    playersLabel: draft.playersLabel.trim(),
    friendsLabel: draft.friendsLabel.trim(),
    sortOrder: Number(draft.sortOrder) || 0,
  };
}

type GamesWorkspaceTab = "catalog" | "release" | "curation" | "submissions";
type QuickViewFilter =
  | "all"
  | "action_required"
  | "pending_review"
  | "unpublished"
  | "official"
  | "character";

export function GamesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | AdminGameCatalogItem["publisherKind"]
  >("all");
  const [reviewFilter, setReviewFilter] = useState<
    "all" | AdminGameCatalogItem["reviewStatus"]
  >("all");
  const [quickFilter, setQuickFilter] = useState<QuickViewFilter>("all");
  const [workspaceTab, setWorkspaceTab] = useState<GamesWorkspaceTab>("catalog");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [baselineDraft, setBaselineDraft] = useState<GameWorkbenchDraft>(() =>
    createEmptyDraft(),
  );
  const [feedback, setFeedback] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const gamesQuery = useQuery({
    queryKey: ["admin-games-catalog"],
    queryFn: () => adminApi.getGamesCatalog(),
  });

  const selectedGameQuery = useQuery({
    queryKey: ["admin-games-catalog-item", selectedGameId],
    queryFn: () => adminApi.getGameCatalogItem(selectedGameId!),
    enabled: Boolean(selectedGameId) && !isCreating,
  });

  const [draft, setDraft] = useState<GameWorkbenchDraft>(() => createEmptyDraft());

  useEffect(() => {
    if (!gamesQuery.data?.length || selectedGameId || isCreating) {
      return;
    }

    setSelectedGameId(gamesQuery.data[0].id);
  }, [gamesQuery.data, isCreating, selectedGameId]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timer = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!selectedGameQuery.data || isCreating) {
      return;
    }

    const nextDraft = draftFromGame(selectedGameQuery.data);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
  }, [isCreating, selectedGameQuery.data]);

  const metrics = useMemo(() => {
    const items = gamesQuery.data ?? [];
    return {
      total: items.length,
      official: items.filter((item) => item.publisherKind === "platform_official")
        .length,
      thirdParty: items.filter((item) => item.publisherKind === "third_party")
        .length,
      character: items.filter((item) => item.publisherKind === "character_creator")
        .length,
      pending: items.filter((item) => item.reviewStatus === "pending_review")
        .length,
      unpublished: items.filter((item) => item.hasUnpublishedChanges).length,
      published: items.filter((item) => item.visibilityScope !== "internal").length,
    };
  }, [gamesQuery.data]);

  const filteredGames = useMemo(() => {
    const items = gamesQuery.data ?? [];
    return items
      .filter((item) => {
        const haystack = [
          item.name,
          item.studio,
          item.slogan,
          item.description,
          item.sourceCharacterName ?? "",
          item.tags.join(" "),
          item.aiHighlights.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !deferredSearch || haystack.includes(deferredSearch);
        const matchesSource =
          sourceFilter === "all" || item.publisherKind === sourceFilter;
        const matchesReview =
          reviewFilter === "all" || item.reviewStatus === reviewFilter;
        const matchesQuickView = matchesGameQuickFilter(item, quickFilter);
        return matchesSearch && matchesSource && matchesReview && matchesQuickView;
      })
      .sort(compareGamesByOperationsPriority);
  }, [deferredSearch, gamesQuery.data, quickFilter, reviewFilter, sourceFilter]);

  const filteredMetrics = useMemo(() => {
    return {
      visible: filteredGames.length,
      actionRequired: filteredGames.filter(isGameActionRequired).length,
      pending: filteredGames.filter((item) => item.reviewStatus === "pending_review")
        .length,
      unpublished: filteredGames.filter((item) => item.hasUnpublishedChanges).length,
    };
  }, [filteredGames]);

  const selectedGame = useMemo(() => {
    if (isCreating) {
      return null;
    }

    return (
      selectedGameQuery.data ??
      gamesQuery.data?.find((item) => item.id === selectedGameId) ??
      null
    );
  }, [gamesQuery.data, isCreating, selectedGameId, selectedGameQuery.data]);

  const draftIssues = useMemo(() => getDraftIssues(draft), [draft]);
  const draftReady = draftIssues.length === 0;
  const isDraftDirty = useMemo(
    () => buildDraftFingerprint(draft) !== buildDraftFingerprint(baselineDraft),
    [baselineDraft, draft],
  );

  const activeSummary = useMemo(() => {
    if (isCreating) {
      return {
        title: draft.name.trim() || "未命名新草稿",
        description:
          "先补齐最小目录资料，再切到发布版本或策展区安排前台曝光。",
      };
    }

    if (!selectedGame) {
      return {
        title: "尚未选中目录项",
        description: "从左侧选择一个游戏后，这里会展示编辑、发布和运营摘要。",
      };
    }

    return {
      title: selectedGame.name,
      description: summarizeGameNextStep(selectedGame),
    };
  }, [draft.name, isCreating, selectedGame]);

  const createMutation = useMutation({
    mutationFn: (payload: AdminCreateGameCatalogRequest) =>
      adminApi.createGameCatalogItem(payload),
    onSuccess: async (game) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-games-catalog"],
      });
      queryClient.setQueryData(["admin-games-catalog-item", game.id], game);
      setSelectedGameId(game.id);
      setIsCreating(false);
      setWorkspaceTab("catalog");
      const nextDraft = draftFromGame(game);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      setFeedback({
        tone: "success",
        message: `${game.name} 已加入 AI 游戏目录。`,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; payload: AdminUpdateGameCatalogRequest }) =>
      adminApi.updateGameCatalogItem(input.id, input.payload),
    onSuccess: async (game) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-games-catalog"],
      });
      queryClient.setQueryData(["admin-games-catalog-item", game.id], game);
      const nextDraft = draftFromGame(game);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      setFeedback({
        tone: "success",
        message: `${game.name} 的目录资料已更新。`,
      });
    },
  });

  function handleStartCreate() {
    const nextDraft = createEmptyDraft((gamesQuery.data?.length ?? 0) + 1);
    setWorkspaceTab("catalog");
    setIsCreating(true);
    setSelectedGameId(null);
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
  }

  function handleSelectGame(gameId: string) {
    setIsCreating(false);
    setSelectedGameId(gameId);
  }

  async function handleSaveDraft() {
    try {
      if (isCreating) {
        await createMutation.mutateAsync(toCreatePayload(draft));
        return;
      }

      if (!selectedGameId) {
        setFeedback({
          tone: "info",
          message: "请先选择一款游戏，或新建一个目录草稿。",
        });
        return;
      }

      await updateMutation.mutateAsync({
        id: selectedGameId,
        payload: toUpdatePayload(draft),
      });
    } catch (error) {
      setFeedback({
        tone: "info",
        message:
          error instanceof Error ? error.message : "保存游戏目录失败，请稍后重试。",
      });
    }
  }

  const editorBusy =
    createMutation.isPending || updateMutation.isPending || selectedGameQuery.isLoading;

  const quickFilters: Array<{
    key: QuickViewFilter;
    label: string;
    count: number;
  }> = [
    { key: "all", label: "全部目录", count: metrics.total },
    {
      key: "action_required",
      label: "待处理",
      count: (gamesQuery.data ?? []).filter(isGameActionRequired).length,
    },
    { key: "pending_review", label: "待审核", count: metrics.pending },
    { key: "unpublished", label: "待发布", count: metrics.unpublished },
    { key: "official", label: "官方出品", count: metrics.official },
    { key: "character", label: "角色出品", count: metrics.character },
  ];

  return (
    <div className="space-y-6">
      {gamesQuery.isLoading ? <LoadingBlock label="正在加载 AI 游戏目录..." /> : null}
      {gamesQuery.isError && gamesQuery.error instanceof Error ? (
        <ErrorBlock message={gamesQuery.error.message} />
      ) : null}

      <AdminPageHero
        eyebrow="Game Catalog Ops"
        title="AI 游戏目录工作台"
        description="先看目录盘面，再处理待审核、待发布和前台编排。目录编辑、版本发布、首页策展和投稿入库拆成独立工作区，方便运营连续处理。"
        badges={[
          `${filteredMetrics.visible}/${metrics.total} 条目录已进入当前视图`,
          metrics.pending > 0 ? `${metrics.pending} 款待审核` : "审核队列已清空",
          metrics.unpublished > 0
            ? `${metrics.unpublished} 款有未发布修改`
            : "当前目录已基本同步正式版本",
          activeSummary.title,
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setWorkspaceTab("submissions")}
            >
              去投稿入库
            </Button>
            <Button variant="primary" onClick={handleStartCreate}>
              新建游戏草稿
            </Button>
          </>
        }
        metrics={[
          { label: "目录总数", value: String(metrics.total) },
          { label: "待审核", value: String(metrics.pending) },
          { label: "待发布修改", value: String(metrics.unpublished) },
          { label: "正式可见", value: String(metrics.published) },
        ]}
      />

      {feedback ? <InlineNotice tone={feedback.tone}>{feedback.message}</InlineNotice> : null}

      <AdminTabs
        tabs={[
          { key: "catalog", label: "目录管理" },
          { key: "release", label: "发布版本" },
          { key: "curation", label: "首页策展" },
          { key: "submissions", label: "投稿入库" },
        ]}
        activeKey={workspaceTab}
        onChange={(key) => setWorkspaceTab(key as GamesWorkspaceTab)}
      />

      {workspaceTab === "catalog" || workspaceTab === "release" ? (
        <div className="grid gap-6 xl:grid-cols-[0.38fr_0.62fr]">
          <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,250,0.96))]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    Queue View
                  </div>
                  <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
                    运营目录队列
                  </div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                    先筛出待处理目录，再进入右侧编辑或发布工作区。列表按待审核、待发布和更新时间排序。
                  </div>
                </div>
                <StatusPill tone={filteredMetrics.actionRequired > 0 ? "warning" : "healthy"}>
                  {filteredMetrics.actionRequired > 0
                    ? `${filteredMetrics.actionRequired} 项待处理`
                    : "当前无阻塞项"}
                </StatusPill>
              </div>

              <div className="mt-5 space-y-3">
                <TextField
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索游戏名、工作室、角色出品人或 AI 标签"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    value={sourceFilter}
                    onChange={(event) =>
                      setSourceFilter(
                        event.target.value as
                          | "all"
                          | AdminGameCatalogItem["publisherKind"],
                      )
                    }
                  >
                    <option value="all">全部来源</option>
                    {PUBLISHER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    value={reviewFilter}
                    onChange={(event) =>
                      setReviewFilter(
                        event.target.value as
                          | "all"
                          | AdminGameCatalogItem["reviewStatus"],
                      )
                    }
                  >
                    <option value="all">全部审核</option>
                    {REVIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setQuickFilter(filter.key)}
                      className={
                        quickFilter === filter.key
                          ? "rounded-[16px] border border-emerald-200 bg-[linear-gradient(160deg,rgba(236,253,245,0.98),rgba(220,252,231,0.92))] px-3.5 py-3 text-left shadow-[var(--shadow-soft)]"
                          : "rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3.5 py-3 text-left transition hover:border-[color:var(--border-subtle)] hover:bg-white"
                      }
                    >
                      <div className="text-sm font-medium text-[color:var(--text-primary)]">
                        {filter.label}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {filter.count} 项
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="当前视图" value={String(filteredMetrics.visible)} />
              <MetricCard label="待审核" value={String(filteredMetrics.pending)} />
              <MetricCard label="待发布" value={String(filteredMetrics.unpublished)} />
              <MetricCard
                label="需关注"
                value={String(filteredMetrics.actionRequired)}
              />
            </div>

            <AdminCallout
              tone={filteredMetrics.actionRequired > 0 ? "warning" : "success"}
              title={
                filteredMetrics.actionRequired > 0
                  ? "目录队列里还有待推进事项"
                  : "当前视图内的目录状态比较稳定"
              }
              description={
                filteredMetrics.actionRequired > 0
                  ? `优先处理 ${filteredMetrics.pending} 个待审核目录，再发布 ${filteredMetrics.unpublished} 个未同步正式版本的修改。`
                  : "可以继续做新建草稿、版本发布，或切到策展区安排前台曝光。"
              }
              actions={
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setQuickFilter("pending_review")}
                  >
                    查看待审核
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setQuickFilter("unpublished")}
                  >
                    查看待发布
                  </Button>
                </>
              }
            />

            {!gamesQuery.isLoading && !filteredGames.length ? (
              <AdminEmptyState
                title="当前筛选下没有游戏"
                description="调整关键词、来源、审核状态或快捷视图后，再继续查看目录。"
              />
            ) : (
              <div className="max-h-[calc(100vh-15rem)] space-y-3 overflow-y-auto pr-1">
                {filteredGames.map((game) => {
                  const selected = !isCreating && selectedGameId === game.id;
                  return (
                    <CatalogListCard
                      key={game.id}
                      game={game}
                      selected={selected}
                      onSelect={() => handleSelectGame(game.id)}
                      onEnterRelease={() => {
                        handleSelectGame(game.id);
                        setWorkspaceTab("release");
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,248,240,0.94),rgba(239,250,245,0.92))]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    Active Workspace
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="text-xl font-semibold text-[color:var(--text-primary)]">
                      {activeSummary.title}
                    </div>
                    <AdminDraftStatusPill
                      ready={isCreating || Boolean(selectedGame)}
                      dirty={isCreating || Boolean(selectedGame) ? isDraftDirty : false}
                      loadingLabel="等待选择"
                    />
                    {selectedGame ? (
                      <>
                        <StatusPill tone={resolveSourceTone(selectedGame.publisherKind)}>
                          {formatPublisherKind(selectedGame.publisherKind)}
                        </StatusPill>
                        <StatusPill tone={resolveReviewTone(selectedGame.reviewStatus)}>
                          {formatReviewStatus(selectedGame.reviewStatus)}
                        </StatusPill>
                        {selectedGame.hasUnpublishedChanges ? (
                          <StatusPill tone="warning">待发布</StatusPill>
                        ) : null}
                      </>
                    ) : null}
                    {isCreating ? <StatusPill tone="muted">新草稿</StatusPill> : null}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                    {activeSummary.description}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {workspaceTab === "catalog" && !isCreating && selectedGame ? (
                    <Button
                      variant="secondary"
                      onClick={() => setWorkspaceTab("release")}
                    >
                      去版本发布
                    </Button>
                  ) : null}
                  {workspaceTab === "release" ? (
                    <Button
                      variant="secondary"
                      onClick={() => setWorkspaceTab("catalog")}
                    >
                      返回目录编辑
                    </Button>
                  ) : null}
                  {!isCreating ? (
                    <Button variant="secondary" onClick={handleStartCreate}>
                      新开草稿
                    </Button>
                  ) : null}
                  {workspaceTab === "catalog" ? (
                    <Button
                      variant="primary"
                      onClick={handleSaveDraft}
                      disabled={editorBusy}
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? "保存中..."
                        : isCreating
                          ? "创建草稿"
                          : "保存修改"}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AdminMiniPanel title="当前工作区" tone="soft">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {workspaceTab === "catalog" ? "目录编辑" : "版本发布"}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    {workspaceTab === "catalog"
                      ? "维护资料、状态和前台标签。"
                      : "管理修订记录、正式发布和回滚。"}
                  </div>
                </AdminMiniPanel>
                <AdminMiniPanel title="下一步建议" tone="soft">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {selectedGame
                      ? summarizeNextActionLabel(selectedGame)
                      : "先选中目录项"}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    {selectedGame
                      ? summarizeGameNextStep(selectedGame)
                      : "左侧队列按优先级排序，可直接进入处理。"}
                  </div>
                </AdminMiniPanel>
                <AdminMiniPanel title="版本状态" tone="soft">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {selectedGame
                      ? `v${selectedGame.publishedVersion || 0}`
                      : isCreating
                        ? "尚未发布"
                        : "未选择"}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    {selectedGame?.lastPublishedAt
                      ? `上次发布于 ${formatTime(selectedGame.lastPublishedAt)}`
                      : "当前没有正式发布时间记录。"}
                  </div>
                </AdminMiniPanel>
                <AdminMiniPanel title="表单完整度" tone="soft">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    {draftReady ? "关键字段已齐备" : `还缺 ${draftIssues.length} 项`}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                    {draftReady
                      ? isDraftDirty
                        ? "可以保存后进入发布或策展流。"
                        : "表单内容已和当前草稿同步。"
                      : `优先补齐：${draftIssues.slice(0, 3).join("、")}`}
                  </div>
                </AdminMiniPanel>
              </div>
            </Card>

            {workspaceTab === "catalog" ? (
              <CatalogEditorWorkspace
                isCreating={isCreating}
                selectedGameId={selectedGameId}
                selectedGameQuery={selectedGameQuery}
                draft={draft}
                setDraft={setDraft}
                draftIssues={draftIssues}
                draftReady={draftReady}
                isDraftDirty={isDraftDirty}
              />
            ) : (
              <GameReleaseWorkbench
                selectedGameId={isCreating ? null : selectedGameId}
                selectedGame={selectedGame}
                onFeedback={setFeedback}
              />
            )}
          </div>
        </div>
      ) : null}

      {!gamesQuery.isLoading && workspaceTab === "curation" ? (
        <GameCurationWorkbench
          games={gamesQuery.data ?? []}
          onFeedback={setFeedback}
        />
      ) : null}

      {!gamesQuery.isLoading && workspaceTab === "submissions" ? (
        <GameSubmissionWorkbench
          onFeedback={setFeedback}
          onImportedGame={(gameId) => {
            setIsCreating(false);
            setSelectedGameId(gameId);
            setWorkspaceTab("catalog");
          }}
        />
      ) : null}
    </div>
  );
}

function CatalogEditorWorkspace({
  isCreating,
  selectedGameId,
  selectedGameQuery,
  draft,
  setDraft,
  draftIssues,
  draftReady,
  isDraftDirty,
}: {
  isCreating: boolean;
  selectedGameId: string | null;
  selectedGameQuery: UseQueryResult<AdminGameCatalogDetail, Error>;
  draft: GameWorkbenchDraft;
  setDraft: Dispatch<SetStateAction<GameWorkbenchDraft>>;
  draftIssues: string[];
  draftReady: boolean;
  isDraftDirty: boolean;
}) {
  if (selectedGameQuery.isError && selectedGameQuery.error instanceof Error) {
    return <ErrorBlock message={selectedGameQuery.error.message} />;
  }

  if (selectedGameQuery.isLoading && !isCreating) {
    return <LoadingBlock label="正在加载游戏详情..." />;
  }

  if (!isCreating && !selectedGameId) {
    return (
      <AdminEmptyState
        title="先选择一个游戏"
        description="左侧选中一款游戏后，这里会展示完整目录详情、关键摘要和可编辑字段。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminCallout
        tone={!draftReady ? "warning" : isDraftDirty ? "info" : "success"}
        title={
          !draftReady
            ? "草稿还不适合流入后续运营环节"
            : isDraftDirty
              ? "草稿有未保存修改"
              : "当前目录资料已同步"
        }
        description={
          !draftReady
            ? `请先补齐以下关键字段：${draftIssues.join("、")}。`
            : isDraftDirty
              ? "保存后再去发布版本或首页策展，避免运营看到的状态和实际草稿不一致。"
              : "可以继续切到版本发布、首页策展或投稿入库，处理后续运营动作。"
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminDetailPanel title="基础资料">
          <div className="grid gap-4 2xl:grid-cols-2">
            <EditorField
              label="游戏 ID"
              value={draft.id}
              onChange={(value) => setDraft((current) => ({ ...current, id: value }))}
              disabled={!isCreating}
              placeholder="例如 signal-squad"
            />
            <EditorField
              label="游戏名"
              value={draft.name}
              onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
              placeholder="输入目录显示名称"
            />
            <EditorField
              label="工作室"
              value={draft.studio}
              onChange={(value) =>
                setDraft((current) => ({ ...current, studio: value }))
              }
            />
            <EditorField
              label="Badge"
              value={draft.badge}
              onChange={(value) => setDraft((current) => ({ ...current, badge: value }))}
              placeholder="例如 新作、爆款"
            />
            <EditorField
              label="Hero 标签"
              value={draft.heroLabel}
              onChange={(value) =>
                setDraft((current) => ({ ...current, heroLabel: value }))
              }
            />
            <EditorField
              label="Deck 标签"
              value={draft.deckLabel}
              onChange={(value) =>
                setDraft((current) => ({ ...current, deckLabel: value }))
              }
            />
            <EditorField
              label="一句话卖点"
              value={draft.slogan}
              onChange={(value) =>
                setDraft((current) => ({ ...current, slogan: value }))
              }
              placeholder="例如 三分钟一局，把反应和协作压到最紧"
              className="2xl:col-span-2"
            />
            <EditorTextArea
              label="游戏简介"
              value={draft.description}
              onChange={(value) =>
                setDraft((current) => ({ ...current, description: value }))
              }
              placeholder="描述这款 AI 游戏的玩法、目标和回流价值"
              className="2xl:col-span-2"
            />
          </div>
        </AdminDetailPanel>

        <AdminDetailPanel title="前台定位">
          <div className="grid gap-4 2xl:grid-cols-2">
            <EditorSelect
              label="目录分类"
              value={draft.category}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  category: value as AdminGameCatalogItem["category"],
                }))
              }
              options={CATEGORY_OPTIONS}
            />
            <EditorSelect
              label="Tone"
              value={draft.tone}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  tone: value as AdminGameCatalogItem["tone"],
                }))
              }
              options={TONE_OPTIONS}
            />
            <EditorField
              label="单局时长"
              value={draft.estimatedDuration}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  estimatedDuration: value,
                }))
              }
              placeholder="例如 3-5 分钟"
            />
            <EditorField
              label="奖励文案"
              value={draft.rewardLabel}
              onChange={(value) =>
                setDraft((current) => ({ ...current, rewardLabel: value }))
              }
              placeholder="例如 连胜奖励、周榜积分"
            />
            <EditorField
              label="玩家热度"
              value={draft.playersLabel}
              onChange={(value) =>
                setDraft((current) => ({ ...current, playersLabel: value }))
              }
              placeholder="例如 2.4k 在玩"
            />
            <EditorField
              label="社交热度"
              value={draft.friendsLabel}
              onChange={(value) =>
                setDraft((current) => ({ ...current, friendsLabel: value }))
              }
              placeholder="例如 236 位好友在聊"
            />
            <EditorField
              label="更新摘要"
              value={draft.updateNote}
              onChange={(value) =>
                setDraft((current) => ({ ...current, updateNote: value }))
              }
              placeholder="例如 新增赛季对抗、优化新手引导"
              className="2xl:col-span-2"
            />
            <EditorTextArea
              label="本局目标"
              value={draft.sessionObjective}
              onChange={(value) =>
                setDraft((current) => ({ ...current, sessionObjective: value }))
              }
              placeholder="说明玩家本轮打开后应该做什么"
              className="2xl:col-span-2"
            />
          </div>
        </AdminDetailPanel>

        <AdminDetailPanel title="运营与审核">
          <div className="grid gap-4 2xl:grid-cols-2">
            <EditorSelect
              label="来源"
              value={draft.publisherKind}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  publisherKind: value as AdminGameCatalogItem["publisherKind"],
                }))
              }
              options={PUBLISHER_OPTIONS}
            />
            <EditorSelect
              label="生产方式"
              value={draft.productionKind}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  productionKind: value as AdminGameCatalogItem["productionKind"],
                }))
              }
              options={PRODUCTION_OPTIONS}
            />
            <EditorSelect
              label="运行方式"
              value={draft.runtimeMode}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  runtimeMode: value as AdminGameCatalogItem["runtimeMode"],
                }))
              }
              options={RUNTIME_OPTIONS}
            />
            <EditorSelect
              label="审核状态"
              value={draft.reviewStatus}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  reviewStatus: value as AdminGameCatalogItem["reviewStatus"],
                }))
              }
              options={REVIEW_OPTIONS}
            />
            <EditorSelect
              label="可见性"
              value={draft.visibilityScope}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  visibilityScope: value as AdminGameCatalogItem["visibilityScope"],
                }))
              }
              options={VISIBILITY_OPTIONS}
            />
            <EditorField
              label="排序权重"
              value={draft.sortOrder}
              onChange={(value) =>
                setDraft((current) => ({ ...current, sortOrder: value }))
              }
              type="number"
            />
          </div>
        </AdminDetailPanel>

        <AdminDetailPanel title="来源与标签">
          <div className="grid gap-4 2xl:grid-cols-2">
            <EditorField
              label="来源角色 ID"
              value={draft.sourceCharacterId}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  sourceCharacterId: value,
                }))
              }
              placeholder="例如 character-conductor-01"
            />
            <EditorField
              label="来源角色名"
              value={draft.sourceCharacterName}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  sourceCharacterName: value,
                }))
              }
              placeholder="例如 星野乘务长"
            />
            <EditorTextArea
              label="AI 亮点"
              value={draft.aiHighlightsText}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  aiHighlightsText: value,
                }))
              }
              placeholder="用逗号或换行分隔，例如 AI 陪练，AI 剧情生成"
              className="2xl:col-span-2"
            />
            <EditorTextArea
              label="标签"
              value={draft.tagsText}
              onChange={(value) =>
                setDraft((current) => ({ ...current, tagsText: value }))
              }
              placeholder="用逗号或换行分隔，例如 组队，3 分钟，赛季"
              className="2xl:col-span-2"
            />
          </div>
        </AdminDetailPanel>
      </div>
    </div>
  );
}

function EditorField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  type,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <TextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        type={type}
      />
    </label>
  );
}

function EditorSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <SelectField value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}

function EditorTextArea({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <TextAreaField
        className="min-h-28"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function CatalogListCard({
  game,
  selected,
  onSelect,
  onEnterRelease,
}: {
  game: AdminGameCatalogItem;
  selected: boolean;
  onSelect: () => void;
  onEnterRelease: () => void;
}) {
  return (
    <Card
      className={
        selected
          ? "border-[rgba(7,193,96,0.18)] bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(255,255,255,0.98))]"
          : "bg-[color:var(--surface-console)]"
      }
    >
      <div className="flex gap-3">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold text-[color:var(--text-primary)]">
              {game.name}
            </span>
            <StatusPill tone={resolveSourceTone(game.publisherKind)}>
              {formatPublisherKind(game.publisherKind)}
            </StatusPill>
            <StatusPill tone={resolveReviewTone(game.reviewStatus)}>
              {formatReviewStatus(game.reviewStatus)}
            </StatusPill>
            {game.hasUnpublishedChanges ? (
              <StatusPill tone="warning">待发布</StatusPill>
            ) : null}
          </div>

          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
            {game.studio}
            {game.sourceCharacterName ? ` · 角色主理人 ${game.sourceCharacterName}` : ""}
          </div>

          <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {game.slogan}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone="muted">{formatRuntimeMode(game.runtimeMode)}</StatusPill>
            <StatusPill tone="muted">
              {formatProductionKind(game.productionKind)}
            </StatusPill>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <SummaryField label="目录分类" value={formatCategory(game.category)} />
            <SummaryField label="可见性" value={formatVisibilityScope(game.visibilityScope)} />
            <SummaryField label="版本" value={`v${game.publishedVersion || 0}`} />
            <SummaryField label="更新时间" value={formatTime(game.updatedAt)} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {game.aiHighlights.slice(0, 3).map((item) => (
              <span
                key={`${game.id}-ai-${item}`}
                className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-0.5 text-xs text-[color:var(--text-muted)]"
              >
                {item}
              </span>
            ))}
            {game.tags.slice(0, 3).map((tag) => (
              <span
                key={`${game.id}-tag-${tag}`}
                className="rounded-full bg-[color:var(--surface-card)] px-2.5 py-0.5 text-xs text-[color:var(--text-muted)]"
              >
                #{tag}
              </span>
            ))}
          </div>

          {game.updateNote ? (
            <div className="mt-3 rounded-[16px] border border-[color:var(--border-faint)] bg-white/80 px-3 py-2.5 text-xs leading-5 text-[color:var(--text-muted)]">
              最近更新：{game.updateNote}
            </div>
          ) : null}
        </button>

        <div className="hidden shrink-0 flex-col gap-2 lg:flex">
          <Button variant="secondary" onClick={onSelect}>
            编辑
          </Button>
          <Button variant="secondary" onClick={onEnterRelease}>
            发布
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
}

function matchesGameQuickFilter(
  game: AdminGameCatalogItem,
  quickFilter: QuickViewFilter,
) {
  switch (quickFilter) {
    case "action_required":
      return isGameActionRequired(game);
    case "pending_review":
      return game.reviewStatus === "pending_review";
    case "unpublished":
      return game.hasUnpublishedChanges;
    case "official":
      return game.publisherKind === "platform_official";
    case "character":
      return game.publisherKind === "character_creator";
    case "all":
    default:
      return true;
  }
}

function isGameActionRequired(game: AdminGameCatalogItem) {
  return game.reviewStatus === "pending_review" || game.hasUnpublishedChanges;
}

function compareGamesByOperationsPriority(
  left: AdminGameCatalogItem,
  right: AdminGameCatalogItem,
) {
  return (
    scoreGameOperationsPriority(right) - scoreGameOperationsPriority(left) ||
    Number(new Date(right.updatedAt)) - Number(new Date(left.updatedAt)) ||
    left.sortOrder - right.sortOrder ||
    compareAdminText(left.name, right.name)
  );
}

function scoreGameOperationsPriority(game: AdminGameCatalogItem) {
  let score = 0;
  if (game.reviewStatus === "pending_review") {
    score += 40;
  }
  if (game.hasUnpublishedChanges) {
    score += 25;
  }
  if (game.visibilityScope === "featured") {
    score += 8;
  }
  if (game.publisherKind === "character_creator") {
    score += 3;
  }
  return score;
}

function buildDraftFingerprint(draft: GameWorkbenchDraft) {
  return JSON.stringify({
    id: draft.id.trim(),
    ...toUpdatePayload(draft),
  });
}

function getDraftIssues(draft: GameWorkbenchDraft) {
  const issues: string[] = [];

  if (!draft.id.trim()) {
    issues.push("游戏 ID");
  }
  if (!draft.name.trim()) {
    issues.push("游戏名");
  }
  if (!draft.slogan.trim()) {
    issues.push("一句话卖点");
  }
  if (!draft.description.trim()) {
    issues.push("游戏简介");
  }
  if (!draft.studio.trim()) {
    issues.push("工作室");
  }
  if (!draft.sessionObjective.trim()) {
    issues.push("本局目标");
  }

  return issues;
}

function summarizeNextActionLabel(game: AdminGameCatalogItem) {
  if (game.reviewStatus === "pending_review") {
    return "先完成审核";
  }
  if (game.hasUnpublishedChanges) {
    return "切到发布版本";
  }
  if (game.visibilityScope === "internal") {
    return "确认是否开放可见";
  }
  if (game.visibilityScope === "coming_soon") {
    return "准备排期上线";
  }
  return "可安排前台曝光";
}

function summarizeGameNextStep(game: AdminGameCatalogItem) {
  if (game.reviewStatus === "pending_review") {
    return `${game.name} 还处于待审核队列，建议先确认来源、运行方式和可见性策略。`;
  }
  if (game.hasUnpublishedChanges) {
    return `${game.name} 已有未发布修改，建议先进入版本发布区同步正式版本，再安排首页资源位。`;
  }
  if (game.visibilityScope === "internal") {
    return `${game.name} 当前只对内部可见，若要进入首页策展，先调整可见性并发布。`;
  }
  if (game.visibilityScope === "coming_soon") {
    return `${game.name} 处于即将上线状态，可以补齐活动位和上架节奏说明。`;
  }
  return `${game.name} 当前目录状态稳定，可以直接进入首页策展或继续做版本迭代。`;
}

function formatPublisherKind(value: AdminGameCatalogItem["publisherKind"]) {
  switch (value) {
    case "platform_official":
      return "官方出品";
    case "third_party":
      return "第三方上传";
    case "character_creator":
      return "角色出品";
  }
}

function formatProductionKind(value: AdminGameCatalogItem["productionKind"]) {
  switch (value) {
    case "human_authored":
      return "人工制作";
    case "ai_assisted":
      return "AI 辅助";
    case "ai_generated":
      return "AI 生成";
    case "character_generated":
      return "角色生成";
  }
}

function formatRuntimeMode(value: AdminGameCatalogItem["runtimeMode"]) {
  switch (value) {
    case "workspace_mock":
      return "工作区占位";
    case "chat_native":
      return "聊天式 AI 游戏";
    case "embedded_web":
      return "嵌入式 Web";
    case "remote_session":
      return "远程会话";
  }
}

function formatReviewStatus(value: AdminGameCatalogItem["reviewStatus"]) {
  switch (value) {
    case "internal_seed":
      return "内部种子";
    case "pending_review":
      return "待审核";
    case "approved":
      return "已通过";
    case "rejected":
      return "已拒绝";
    case "suspended":
      return "已暂停";
  }
}

function formatVisibilityScope(value: AdminGameCatalogItem["visibilityScope"]) {
  switch (value) {
    case "featured":
      return "主推可见";
    case "published":
      return "正式发布";
    case "coming_soon":
      return "即将上线";
    case "internal":
      return "内部可见";
  }
}

function formatCategory(value: AdminGameCatalogItem["category"]) {
  switch (value) {
    case "featured":
      return "推荐";
    case "party":
      return "聚会";
    case "competitive":
      return "竞技";
    case "relax":
      return "休闲";
    case "strategy":
      return "经营";
  }
}

function resolveSourceTone(value: AdminGameCatalogItem["publisherKind"]) {
  switch (value) {
    case "platform_official":
      return "healthy" as const;
    case "third_party":
      return "muted" as const;
    case "character_creator":
      return "warning" as const;
  }
}

function resolveReviewTone(value: AdminGameCatalogItem["reviewStatus"]) {
  switch (value) {
    case "approved":
      return "healthy" as const;
    case "pending_review":
      return "warning" as const;
    case "rejected":
    case "suspended":
      return "muted" as const;
    case "internal_seed":
      return "muted" as const;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}-${date.getDate()} ${String(
    date.getHours(),
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
