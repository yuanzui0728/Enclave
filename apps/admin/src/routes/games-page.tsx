import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
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
import { AdminCallout, AdminEmptyState } from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";

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

export function GamesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | AdminGameCatalogItem["publisherKind"]
  >("all");
  const [reviewFilter, setReviewFilter] = useState<
    "all" | AdminGameCatalogItem["reviewStatus"]
  >("all");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
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

    setDraft(draftFromGame(selectedGameQuery.data));
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
    };
  }, [gamesQuery.data]);

  const filteredGames = useMemo(() => {
    const items = gamesQuery.data ?? [];
    return items.filter((item) => {
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
      return matchesSearch && matchesSource && matchesReview;
    });
  }, [deferredSearch, gamesQuery.data, reviewFilter, sourceFilter]);

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
      setDraft(draftFromGame(game));
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
      setDraft(draftFromGame(game));
      setFeedback({
        tone: "success",
        message: `${game.name} 的目录资料已更新。`,
      });
    },
  });

  function handleStartCreate() {
    setIsCreating(true);
    setSelectedGameId(null);
    setDraft(createEmptyDraft((gamesQuery.data?.length ?? 0) + 1));
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

  return (
    <div className="space-y-6">
      {gamesQuery.isLoading ? <LoadingBlock label="正在加载 AI 游戏目录..." /> : null}
      {gamesQuery.isError && gamesQuery.error instanceof Error ? (
        <ErrorBlock message={gamesQuery.error.message} />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="目录总数" value={String(metrics.total)} />
        <MetricCard label="官方出品" value={String(metrics.official)} />
        <MetricCard label="第三方上传" value={String(metrics.thirdParty)} />
        <MetricCard label="角色出品" value={String(metrics.character)} />
        <MetricCard label="待审核" value={String(metrics.pending)} />
      </div>

      <AdminCallout
        title="后台工作台先承接目录、审核和来源编辑"
        description="这一版先把 AI 游戏目录事实源切到服务端表，后台可以直接新建草稿、维护资料、调整审核状态。后续再继续补版本、运营位和角色产游工坊。"
        tone="info"
        actions={
          <Button variant="primary" onClick={handleStartCreate}>
            新建游戏草稿
          </Button>
        }
      />

      {feedback ? <InlineNotice tone={feedback.tone}>{feedback.message}</InlineNotice> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] flex-1">
              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索游戏名、工作室、角色出品人或 AI 标签"
              />
            </div>
            <SelectField
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(
                  event.target.value as "all" | AdminGameCatalogItem["publisherKind"],
                )
              }
              className="w-36"
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
                  event.target.value as "all" | AdminGameCatalogItem["reviewStatus"],
                )
              }
              className="w-36"
            >
              <option value="all">全部审核</option>
              {REVIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>

          {!gamesQuery.isLoading && !filteredGames.length ? (
            <AdminEmptyState
              title="当前筛选下没有游戏"
              description="调整关键词、来源或审核状态后，再继续查看目录。"
            />
          ) : null}

          <div className="space-y-3">
            {filteredGames.map((game) => {
              const selected = !isCreating && selectedGameId === game.id;
              return (
                <Card
                  key={game.id}
                  className={
                    selected
                      ? "border-[rgba(7,193,96,0.18)] bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(255,255,255,0.98))]"
                      : "bg-[color:var(--surface-console)]"
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleSelectGame(game.id)}
                    className="w-full text-left"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
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
                          <StatusPill tone="muted">
                            {formatRuntimeMode(game.runtimeMode)}
                          </StatusPill>
                        </div>

                        <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                          {game.studio}
                          {game.sourceCharacterName
                            ? ` · 角色主理人 ${game.sourceCharacterName}`
                            : ""}
                        </div>

                        <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {game.slogan}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {game.aiHighlights.map((item) => (
                            <span
                              key={`${game.id}-ai-${item}`}
                              className="rounded-full border border-[color:var(--border-faint)] bg-white px-2.5 py-0.5 text-xs text-[color:var(--text-muted)]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {game.tags.map((tag) => (
                            <span
                              key={`${game.id}-tag-${tag}`}
                              className="rounded-full bg-[color:var(--surface-card)] px-2.5 py-0.5 text-xs text-[color:var(--text-muted)]"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:w-[320px]">
                        <SummaryField label="目录分类" value={formatCategory(game.category)} />
                        <SummaryField
                          label="可见性"
                          value={formatVisibilityScope(game.visibilityScope)}
                        />
                        <SummaryField
                          label="生产方式"
                          value={formatProductionKind(game.productionKind)}
                        />
                        <SummaryField label="排序权重" value={String(game.sortOrder)} />
                        <SummaryField label="更新摘要" value={game.updateNote} />
                        <SummaryField
                          label="最近更新"
                          value={formatTime(game.updatedAt)}
                        />
                      </div>
                    </div>
                  </button>
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,250,0.96))]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                {isCreating ? "Create Draft" : "Catalog Editor"}
              </div>
              <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
                {isCreating ? "新建 AI 游戏草稿" : draft.name || "游戏目录编辑器"}
              </div>
              <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                {isCreating
                  ? "先登记目录草稿，再逐步补齐审核、来源和运行方式。"
                  : "直接维护游戏资料、审核状态和来源信息，前台游戏中心会使用同一份服务端目录。"}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {!isCreating ? (
                <Button variant="secondary" onClick={handleStartCreate}>
                  复制思路新建
                </Button>
              ) : null}
              <Button variant="primary" onClick={handleSaveDraft} disabled={editorBusy}>
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : isCreating
                    ? "创建草稿"
                    : "保存修改"}
              </Button>
            </div>
          </div>

          {selectedGameQuery.isError && selectedGameQuery.error instanceof Error ? (
            <div className="mt-4">
              <ErrorBlock message={selectedGameQuery.error.message} />
            </div>
          ) : null}

          {selectedGameQuery.isLoading && !isCreating ? (
            <div className="mt-6">
              <LoadingBlock label="正在加载游戏详情..." />
            </div>
          ) : null}

          {!isCreating && !selectedGameId && !selectedGameQuery.isLoading ? (
            <div className="mt-6">
              <AdminEmptyState
                title="先选择一个游戏"
                description="左侧选中一款游戏后，这里会展示完整目录详情和可编辑字段。"
              />
            </div>
          ) : null}

          {isCreating || selectedGameId ? (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
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
                  label="一句话卖点"
                  value={draft.slogan}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, slogan: value }))
                  }
                  placeholder="例如 三分钟一局，把反应和协作压到最紧"
                  className="md:col-span-2"
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
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    目录分类
                  </div>
                  <SelectField
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category: event.target.value as AdminGameCatalogItem["category"],
                      }))
                    }
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    Tone
                  </div>
                  <SelectField
                    value={draft.tone}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        tone: event.target.value as AdminGameCatalogItem["tone"],
                      }))
                    }
                  >
                    {TONE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
              </div>

              <EditorTextArea
                label="游戏简介"
                value={draft.description}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, description: value }))
                }
                placeholder="描述这款 AI 游戏的玩法、目标和回流价值"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <EditorField
                  label="单局时长"
                  value={draft.estimatedDuration}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      estimatedDuration: value,
                    }))
                  }
                />
                <EditorField
                  label="奖励文案"
                  value={draft.rewardLabel}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, rewardLabel: value }))
                  }
                />
                <EditorField
                  label="玩家热度"
                  value={draft.playersLabel}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, playersLabel: value }))
                  }
                />
                <EditorField
                  label="社交热度"
                  value={draft.friendsLabel}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, friendsLabel: value }))
                  }
                />
                <EditorField
                  label="更新摘要"
                  value={draft.updateNote}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, updateNote: value }))
                  }
                  className="md:col-span-2"
                />
              </div>

              <EditorTextArea
                label="本局目标"
                value={draft.sessionObjective}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, sessionObjective: value }))
                }
                placeholder="说明玩家本轮打开后应该做什么"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    来源
                  </div>
                  <SelectField
                    value={draft.publisherKind}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        publisherKind:
                          event.target.value as AdminGameCatalogItem["publisherKind"],
                      }))
                    }
                  >
                    {PUBLISHER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    生产方式
                  </div>
                  <SelectField
                    value={draft.productionKind}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        productionKind:
                          event.target.value as AdminGameCatalogItem["productionKind"],
                      }))
                    }
                  >
                    {PRODUCTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    运行方式
                  </div>
                  <SelectField
                    value={draft.runtimeMode}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        runtimeMode:
                          event.target.value as AdminGameCatalogItem["runtimeMode"],
                      }))
                    }
                  >
                    {RUNTIME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    审核状态
                  </div>
                  <SelectField
                    value={draft.reviewStatus}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        reviewStatus:
                          event.target.value as AdminGameCatalogItem["reviewStatus"],
                      }))
                    }
                  >
                    {REVIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    可见性
                  </div>
                  <SelectField
                    value={draft.visibilityScope}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        visibilityScope:
                          event.target.value as AdminGameCatalogItem["visibilityScope"],
                      }))
                    }
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <EditorField
                  label="排序权重"
                  value={draft.sortOrder}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, sortOrder: value }))
                  }
                  type="number"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

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
              />

              <EditorTextArea
                label="标签"
                value={draft.tagsText}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, tagsText: value }))
                }
                placeholder="用逗号或换行分隔，例如 组队，3 分钟，赛季"
              />
            </div>
          ) : null}
        </Card>
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

function EditorTextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
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

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
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
