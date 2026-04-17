import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminGameCatalogDetail,
  AdminGameCatalogRevision,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  SelectField,
  StatusPill,
  TextAreaField,
} from "@yinjie/ui";
import { AdminCallout, AdminEmptyState } from "./admin-workbench";
import { adminApi } from "../lib/admin-api";

type FeedbackPayload = {
  tone: "success" | "info";
  message: string;
};

type CatalogSnapshot = AdminGameCatalogRevision["snapshot"];

type SnapshotDiff = {
  key: string;
  label: string;
  currentValue: string;
  revisionValue: string;
  changed: boolean;
};

export function GameReleaseWorkbench({
  selectedGameId,
  selectedGame,
  onFeedback,
}: {
  selectedGameId: string | null;
  selectedGame: AdminGameCatalogDetail | null;
  onFeedback: (feedback: FeedbackPayload) => void;
}) {
  const queryClient = useQueryClient();
  const [publishSummary, setPublishSummary] = useState("");
  const [publishVisibilityScope, setPublishVisibilityScope] = useState<
    AdminGameCatalogDetail["visibilityScope"]
  >("published");
  const [compareRevisionId, setCompareRevisionId] = useState("");
  const [restoreSummary, setRestoreSummary] = useState("");

  const revisionsQuery = useQuery({
    queryKey: ["admin-game-catalog-revisions", selectedGameId],
    queryFn: () => adminApi.getGameCatalogRevisions(selectedGameId!),
    enabled: Boolean(selectedGameId),
  });

  useEffect(() => {
    if (!selectedGame) {
      return;
    }

    setPublishVisibilityScope(
      selectedGame.visibilityScope === "internal" ||
        selectedGame.visibilityScope === "coming_soon"
        ? "published"
        : selectedGame.visibilityScope,
    );
  }, [selectedGame]);

  useEffect(() => {
    setRestoreSummary("");
  }, [selectedGameId]);

  useEffect(() => {
    const revisions = revisionsQuery.data ?? [];
    if (revisions.length === 0) {
      setCompareRevisionId("");
      return;
    }

    setCompareRevisionId((current) =>
      revisions.some((revision) => revision.id === current)
        ? current
        : revisions[0].id,
    );
  }, [revisionsQuery.data]);

  const publishMutation = useMutation({
    mutationFn: (input: {
      id: string;
      summary: string;
      visibilityScope: AdminGameCatalogDetail["visibilityScope"];
    }) =>
      adminApi.publishGameCatalogItem(input.id, {
        summary: input.summary.trim() || undefined,
        visibilityScope: input.visibilityScope,
      }),
    onSuccess: async (game) => {
      queryClient.setQueryData(["admin-games-catalog-item", game.id], game);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-games-catalog"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-game-catalog-revisions", game.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-game-submissions"],
        }),
      ]);
      setPublishSummary("");
      onFeedback({
        tone: "success",
        message: `${game.name} 已发布为目录版本 v${game.publishedVersion}。`,
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (input: {
      id: string;
      revisionId: string;
      revisionSequence: number;
      summary: string;
    }) =>
      adminApi.restoreGameCatalogRevision(input.id, input.revisionId, {
        summary: input.summary.trim() || undefined,
      }),
    onSuccess: async (game, variables) => {
      queryClient.setQueryData(["admin-games-catalog-item", game.id], game);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-games-catalog"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-game-catalog-revisions", game.id],
        }),
      ]);
      setRestoreSummary("");
      onFeedback({
        tone: "success",
        message: `${game.name} 已恢复到修订 #${variables.revisionSequence}。`,
      });
    },
  });

  const metrics = useMemo(() => {
    const revisions = revisionsQuery.data ?? [];
    const publishedCount = revisions.filter(
      (revision) => revision.changeSource === "publish",
    ).length;
    return {
      revisionCount: revisions.length,
      publishedCount,
      latestRevisionSequence: revisions[0]?.revisionSequence ?? 0,
    };
  }, [revisionsQuery.data]);

  const comparedRevision = useMemo(() => {
    const revisions = revisionsQuery.data ?? [];
    return (
      revisions.find((revision) => revision.id === compareRevisionId) ??
      revisions[0] ??
      null
    );
  }, [compareRevisionId, revisionsQuery.data]);

  const snapshotDiffs = useMemo(() => {
    if (!selectedGame || !comparedRevision) {
      return [];
    }

    return createSnapshotDiffs(
      createCatalogSnapshotFromGame(selectedGame),
      comparedRevision.snapshot,
    ).filter((item) => item.changed);
  }, [comparedRevision, selectedGame]);

  async function handlePublish() {
    if (!selectedGameId || !selectedGame) {
      onFeedback({
        tone: "info",
        message: "先从目录中选中一款游戏，再执行发布。",
      });
      return;
    }

    try {
      await publishMutation.mutateAsync({
        id: selectedGameId,
        summary: publishSummary,
        visibilityScope: publishVisibilityScope,
      });
    } catch (error) {
      onFeedback({
        tone: "info",
        message:
          error instanceof Error ? error.message : "发布版本失败，请稍后重试。",
      });
    }
  }

  async function handleRestoreRevision(revision: AdminGameCatalogRevision) {
    if (!selectedGameId) {
      onFeedback({
        tone: "info",
        message: "先选择一个游戏，再执行修订恢复。",
      });
      return;
    }

    try {
      await restoreMutation.mutateAsync({
        id: selectedGameId,
        revisionId: revision.id,
        revisionSequence: revision.revisionSequence,
        summary: restoreSummary,
      });
    } catch (error) {
      onFeedback({
        tone: "info",
        message:
          error instanceof Error ? error.message : "恢复修订失败，请稍后重试。",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="当前版本号" value={String(selectedGame?.publishedVersion ?? 0)} />
        <MetricCard label="修订记录" value={String(metrics.revisionCount)} />
        <MetricCard label="已发布次数" value={String(metrics.publishedCount)} />
      </div>

      <AdminCallout
        title="目录草稿已经具备版本发布流"
        description="这里管理每个游戏的版本历史、发布摘要和最近一次正式发布状态。更新目录资料后会形成新的草稿修订，点击发布才会形成正式版本。"
        tone="info"
      />

      {!selectedGameId || !selectedGame ? (
        <AdminEmptyState
          title="先选择一个游戏"
          description="选中目录中的具体游戏后，这里会显示版本历史、修订轨迹和发布操作。"
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,252,249,0.98))]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Release Flow
            </div>
            <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
              发布 {selectedGame.name}
            </div>
            <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
              当前审核状态为 {formatReviewStatus(selectedGame.reviewStatus)}，最近一次发布
              {selectedGame.lastPublishedAt
                ? `发生在 ${formatTime(selectedGame.lastPublishedAt)}`
                : " 尚未发生"}
              。
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <SummaryField
                label="当前可见性"
                value={formatVisibilityScope(selectedGame.visibilityScope)}
              />
              <SummaryField
                label="草稿状态"
                value={selectedGame.hasUnpublishedChanges ? "有未发布修改" : "已同步正式版本"}
              />
              <SummaryField
                label="最新修订"
                value={`#${metrics.latestRevisionSequence || "0"}`}
              />
              <SummaryField
                label="发布摘要"
                value={selectedGame.lastPublishedSummary || "暂无发布摘要"}
              />
            </div>

            <label className="mt-5 block">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                发布后可见性
              </div>
              <SelectField
                value={publishVisibilityScope}
                onChange={(event) =>
                  setPublishVisibilityScope(
                    event.target.value as AdminGameCatalogDetail["visibilityScope"],
                  )
                }
              >
                <option value="published">正式发布</option>
                <option value="featured">主推可见</option>
                <option value="coming_soon">即将上线</option>
                <option value="internal">内部可见</option>
              </SelectField>
            </label>

            <label className="mt-5 block">
              <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                发布摘要
              </div>
              <TextAreaField
                className="min-h-28"
                value={publishSummary}
                onChange={(event) => setPublishSummary(event.target.value)}
                placeholder="例如：开放到正式发布，补齐首期活动位和新手奖励。"
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={handlePublish}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? "发布中..." : "发布为正式版本"}
              </Button>
              {selectedGame.originSubmissionId ? (
                <StatusPill tone="warning">
                  关联投稿 {selectedGame.originSubmissionId}
                </StatusPill>
              ) : null}
              <StatusPill
                tone={selectedGame.hasUnpublishedChanges ? "warning" : "healthy"}
              >
                {selectedGame.hasUnpublishedChanges ? "待发布草稿" : "已同步"}
              </StatusPill>
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Revision Timeline
                </div>
                <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
                  修订历史
                </div>
                <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                  记录每次创建、编辑、投稿入库、恢复和正式发布的快照。
                </div>
              </div>
            </div>

            {revisionsQuery.isLoading ? (
              <div className="mt-5">
                <LoadingBlock label="正在加载版本历史..." />
              </div>
            ) : null}
            {revisionsQuery.isError && revisionsQuery.error instanceof Error ? (
              <div className="mt-5">
                <ErrorBlock message={revisionsQuery.error.message} />
              </div>
            ) : null}

            {!revisionsQuery.isLoading && !(revisionsQuery.data?.length ?? 0) ? (
              <div className="mt-5">
                <AdminEmptyState
                  title="还没有修订历史"
                  description="第一次保存或发布后，这里会开始沉淀版本轨迹。"
                />
              </div>
            ) : null}

            {comparedRevision ? (
              <Card className="mt-5 border border-[color:var(--border-faint)] bg-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                      Snapshot Diff
                    </div>
                    <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
                      对比修订 #{comparedRevision.revisionSequence}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                      当前草稿和所选修订的差异会列在下面，确认后可以直接把目录草稿恢复到这个快照。
                    </div>
                  </div>

                  <label className="block min-w-[220px]">
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      对比目标
                    </div>
                    <SelectField
                      value={compareRevisionId}
                      onChange={(event) => setCompareRevisionId(event.target.value)}
                    >
                      {(revisionsQuery.data ?? []).map((revision) => (
                        <option key={revision.id} value={revision.id}>
                          {`修订 #${revision.revisionSequence} · ${formatRevisionChangeSource(
                            revision.changeSource,
                          )}`}
                        </option>
                      ))}
                    </SelectField>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SummaryField
                    label="对比修订"
                    value={`#${comparedRevision.revisionSequence}`}
                  />
                  <SummaryField
                    label="变化字段"
                    value={
                      snapshotDiffs.length > 0
                        ? `${snapshotDiffs.length} 项`
                        : "当前草稿已一致"
                    }
                  />
                  <SummaryField
                    label="修订来源"
                    value={formatRevisionChangeSource(comparedRevision.changeSource)}
                  />
                </div>

                <label className="mt-4 block">
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    恢复摘要
                  </div>
                  <TextAreaField
                    className="min-h-24"
                    value={restoreSummary}
                    onChange={(event) => setRestoreSummary(event.target.value)}
                    placeholder={`例如：回滚到修订 #${comparedRevision.revisionSequence}，撤回最近一轮目录改动。`}
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={() => handleRestoreRevision(comparedRevision)}
                    disabled={restoreMutation.isPending}
                  >
                    {restoreMutation.isPending ? "恢复中..." : "恢复到所选修订"}
                  </Button>
                  <StatusPill tone="warning">恢复后会生成一条新的草稿修订</StatusPill>
                </div>

                {snapshotDiffs.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {snapshotDiffs.map((diff) => (
                      <div
                        key={diff.key}
                        className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
                      >
                        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                          {diff.label}
                        </div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div>
                            <div className="text-xs text-[color:var(--text-muted)]">
                              当前草稿
                            </div>
                            <div className="mt-1 text-sm leading-6 text-[color:var(--text-primary)]">
                              {diff.currentValue}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-[color:var(--text-muted)]">
                              所选修订
                            </div>
                            <div className="mt-1 text-sm leading-6 text-[color:var(--text-primary)]">
                              {diff.revisionValue}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <AdminEmptyState
                      title="当前草稿与所选修订一致"
                      description="如果只是想补一条回滚记录，也可以直接执行恢复。"
                    />
                  </div>
                )}
              </Card>
            ) : null}

            <div className="mt-5 space-y-3">
              {(revisionsQuery.data ?? []).map((revision) => (
                <Card
                  key={revision.id}
                  className="border border-[color:var(--border-faint)] bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[color:var(--text-primary)]">
                          修订 #{revision.revisionSequence}
                        </span>
                        <StatusPill tone={resolveRevisionTone(revision.changeSource)}>
                          {formatRevisionChangeSource(revision.changeSource)}
                        </StatusPill>
                        {revision.publishedVersion ? (
                          <StatusPill tone="healthy">
                            发布版 v{revision.publishedVersion}
                          </StatusPill>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                        {formatTime(revision.createdAt)}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {revision.summary || revision.snapshot.updateNote || "无摘要"}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:w-[320px]">
                      <SummaryField
                        label="审核"
                        value={formatReviewStatus(revision.snapshot.reviewStatus)}
                      />
                      <SummaryField
                        label="可见性"
                        value={formatVisibilityScope(revision.snapshot.visibilityScope)}
                      />
                      <SummaryField
                        label="运行方式"
                        value={formatRuntimeMode(revision.snapshot.runtimeMode)}
                      />
                      <SummaryField
                        label="排序权重"
                        value={String(revision.snapshot.sortOrder)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant={
                        compareRevisionId === revision.id ? "primary" : "secondary"
                      }
                      onClick={() => setCompareRevisionId(revision.id)}
                    >
                      {compareRevisionId === revision.id ? "对比中" : "对比此修订"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleRestoreRevision(revision)}
                      disabled={restoreMutation.isPending}
                    >
                      {restoreMutation.isPending ? "恢复中..." : "恢复到此修订"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      )}
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

function formatRevisionChangeSource(
  value: AdminGameCatalogRevision["changeSource"],
) {
  switch (value) {
    case "draft_created":
      return "新建草稿";
    case "draft_updated":
      return "更新草稿";
    case "publish":
      return "正式发布";
    case "restore":
      return "恢复修订";
    case "submission_ingest":
      return "投稿入库";
    case "seed_backfill":
      return "历史回填";
  }
}

function resolveRevisionTone(value: AdminGameCatalogRevision["changeSource"]) {
  switch (value) {
    case "publish":
      return "healthy" as const;
    case "submission_ingest":
    case "restore":
      return "warning" as const;
    case "draft_created":
    case "draft_updated":
    case "seed_backfill":
      return "muted" as const;
  }
}

function createCatalogSnapshotFromGame(
  game: AdminGameCatalogDetail,
): CatalogSnapshot {
  return {
    id: game.id,
    name: game.name,
    slogan: game.slogan,
    description: game.description,
    studio: game.studio,
    heroLabel: game.heroLabel,
    category: game.category,
    tone: game.tone,
    badge: game.badge,
    deckLabel: game.deckLabel,
    estimatedDuration: game.estimatedDuration,
    rewardLabel: game.rewardLabel,
    sessionObjective: game.sessionObjective,
    publisherKind: game.publisherKind,
    productionKind: game.productionKind,
    runtimeMode: game.runtimeMode,
    reviewStatus: game.reviewStatus,
    visibilityScope: game.visibilityScope,
    sortOrder: game.sortOrder,
    sourceCharacterId: game.sourceCharacterId ?? null,
    sourceCharacterName: game.sourceCharacterName ?? null,
    aiHighlights: [...game.aiHighlights],
    tags: [...game.tags],
    updateNote: game.updateNote,
    playersLabel: game.playersLabel,
    friendsLabel: game.friendsLabel,
  };
}

function createSnapshotDiffs(
  currentSnapshot: CatalogSnapshot,
  revisionSnapshot: CatalogSnapshot,
): SnapshotDiff[] {
  return [
    buildSnapshotDiff("name", "游戏名", currentSnapshot.name, revisionSnapshot.name),
    buildSnapshotDiff("slogan", "一句话卖点", currentSnapshot.slogan, revisionSnapshot.slogan),
    buildSnapshotDiff(
      "description",
      "游戏说明",
      currentSnapshot.description,
      revisionSnapshot.description,
    ),
    buildSnapshotDiff("studio", "工作室", currentSnapshot.studio, revisionSnapshot.studio),
    buildSnapshotDiff("badge", "徽标", currentSnapshot.badge, revisionSnapshot.badge),
    buildSnapshotDiff(
      "heroLabel",
      "主视觉标签",
      currentSnapshot.heroLabel,
      revisionSnapshot.heroLabel,
    ),
    buildSnapshotDiff("category", "分类", currentSnapshot.category, revisionSnapshot.category),
    buildSnapshotDiff("tone", "Tone", currentSnapshot.tone, revisionSnapshot.tone),
    buildSnapshotDiff(
      "deckLabel",
      "卡片标签",
      currentSnapshot.deckLabel,
      revisionSnapshot.deckLabel,
    ),
    buildSnapshotDiff(
      "estimatedDuration",
      "时长",
      currentSnapshot.estimatedDuration,
      revisionSnapshot.estimatedDuration,
    ),
    buildSnapshotDiff(
      "rewardLabel",
      "奖励标签",
      currentSnapshot.rewardLabel,
      revisionSnapshot.rewardLabel,
    ),
    buildSnapshotDiff(
      "sessionObjective",
      "本局目标",
      currentSnapshot.sessionObjective,
      revisionSnapshot.sessionObjective,
    ),
    buildSnapshotDiff(
      "publisherKind",
      "来源",
      currentSnapshot.publisherKind,
      revisionSnapshot.publisherKind,
    ),
    buildSnapshotDiff(
      "productionKind",
      "生产方式",
      currentSnapshot.productionKind,
      revisionSnapshot.productionKind,
    ),
    buildSnapshotDiff(
      "runtimeMode",
      "运行方式",
      currentSnapshot.runtimeMode,
      revisionSnapshot.runtimeMode,
    ),
    buildSnapshotDiff(
      "reviewStatus",
      "审核状态",
      currentSnapshot.reviewStatus,
      revisionSnapshot.reviewStatus,
    ),
    buildSnapshotDiff(
      "visibilityScope",
      "可见性",
      currentSnapshot.visibilityScope,
      revisionSnapshot.visibilityScope,
    ),
    buildSnapshotDiff(
      "sourceCharacterId",
      "来源角色 ID",
      currentSnapshot.sourceCharacterId ?? "",
      revisionSnapshot.sourceCharacterId ?? "",
    ),
    buildSnapshotDiff(
      "sourceCharacterName",
      "来源角色名",
      currentSnapshot.sourceCharacterName ?? "",
      revisionSnapshot.sourceCharacterName ?? "",
    ),
    buildSnapshotDiff(
      "aiHighlights",
      "AI 亮点",
      formatListValue(currentSnapshot.aiHighlights),
      formatListValue(revisionSnapshot.aiHighlights),
    ),
    buildSnapshotDiff(
      "tags",
      "标签",
      formatListValue(currentSnapshot.tags),
      formatListValue(revisionSnapshot.tags),
    ),
    buildSnapshotDiff(
      "updateNote",
      "更新说明",
      currentSnapshot.updateNote,
      revisionSnapshot.updateNote,
    ),
    buildSnapshotDiff(
      "playersLabel",
      "玩家状态",
      currentSnapshot.playersLabel,
      revisionSnapshot.playersLabel,
    ),
    buildSnapshotDiff(
      "friendsLabel",
      "好友状态",
      currentSnapshot.friendsLabel,
      revisionSnapshot.friendsLabel,
    ),
    buildSnapshotDiff(
      "sortOrder",
      "排序权重",
      String(currentSnapshot.sortOrder),
      String(revisionSnapshot.sortOrder),
    ),
  ];
}

function buildSnapshotDiff(
  key: string,
  label: string,
  currentValue: string,
  revisionValue: string,
): SnapshotDiff {
  return {
    key,
    label,
    currentValue: formatSnapshotValue(currentValue),
    revisionValue: formatSnapshotValue(revisionValue),
    changed: currentValue !== revisionValue,
  };
}

function formatSnapshotValue(value: string) {
  const nextValue = value.trim();
  return nextValue || "未填写";
}

function formatListValue(value: string[]) {
  return value.length > 0 ? value.join(" / ") : "";
}

function formatReviewStatus(value: AdminGameCatalogDetail["reviewStatus"]) {
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

function formatVisibilityScope(value: AdminGameCatalogDetail["visibilityScope"]) {
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

function formatRuntimeMode(value: AdminGameCatalogDetail["runtimeMode"]) {
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

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getMonth() + 1}-${date.getDate()} ${String(
    date.getHours(),
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
