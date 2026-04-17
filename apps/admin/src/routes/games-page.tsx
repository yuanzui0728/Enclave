import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminGameCatalogItem } from "@yinjie/contracts";
import {
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  SelectField,
  StatusPill,
  TextField,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminEmptyState,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";

export function GamesPage() {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | AdminGameCatalogItem["publisherKind"]
  >("all");
  const [reviewFilter, setReviewFilter] = useState<
    "all" | AdminGameCatalogItem["reviewStatus"]
  >("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const gamesQuery = useQuery({
    queryKey: ["admin-games-catalog"],
    queryFn: () => adminApi.getGamesCatalog(),
  });

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
        title="一期先把游戏目录、来源和审核状态跑通"
        description="当前后台先承接 AI 游戏目录总览，后续再补详情、发布、版本、运营位和角色游戏工坊。"
        tone="info"
      />

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
          <option value="platform_official">官方出品</option>
          <option value="third_party">第三方上传</option>
          <option value="character_creator">角色出品</option>
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
          <option value="internal_seed">内部种子</option>
          <option value="pending_review">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
          <option value="suspended">已暂停</option>
        </SelectField>
      </div>

      {!gamesQuery.isLoading && !filteredGames.length ? (
        <AdminEmptyState
          title="当前筛选下没有游戏"
          description="调整关键词、来源或审核状态后，再继续查看目录。"
        />
      ) : null}

      <div className="space-y-3">
        {filteredGames.map((game) => (
          <Card key={game.id} className="bg-[color:var(--surface-console)]">
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
                  <StatusPill tone="muted">{formatRuntimeMode(game.runtimeMode)}</StatusPill>
                </div>

                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  {game.studio}
                  {game.sourceCharacterName ? ` · 角色主理人 ${game.sourceCharacterName}` : ""}
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
                <SummaryField label="可见性" value={formatVisibilityScope(game.visibilityScope)} />
                <SummaryField label="生产方式" value={formatProductionKind(game.productionKind)} />
                <SummaryField label="更新摘要" value={game.updateNote} />
                <SummaryField label="玩家热度" value={game.playersLabel} />
                <SummaryField label="社交热度" value={game.friendsLabel} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
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
      return "首页主推";
    case "published":
      return "已发布";
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

function resolveSourceTone(
  value: AdminGameCatalogItem["publisherKind"],
): "healthy" | "muted" | "warning" {
  switch (value) {
    case "platform_official":
      return "healthy";
    case "third_party":
      return "muted";
    case "character_creator":
      return "warning";
  }
}

function resolveReviewTone(
  value: AdminGameCatalogItem["reviewStatus"],
): "healthy" | "muted" | "warning" {
  switch (value) {
    case "internal_seed":
      return "muted";
    case "pending_review":
      return "warning";
    case "approved":
      return "healthy";
    case "rejected":
    case "suspended":
      return "warning";
  }
}
