import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminCreateGameSubmissionRequest,
  AdminGameSubmission,
  AdminUpdateGameSubmissionRequest,
  Character,
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
  TextField,
} from "@yinjie/ui";
import { AdminCallout, AdminEmptyState } from "./admin-workbench";
import { adminApi } from "../lib/admin-api";

type FeedbackPayload = {
  tone: "success" | "info";
  message: string;
};

type SubmissionDraft = {
  sourceKind: AdminGameSubmission["sourceKind"];
  status: AdminGameSubmission["status"];
  proposedGameId: string;
  proposedName: string;
  slogan: string;
  description: string;
  studio: string;
  category: AdminGameSubmission["category"];
  tone: AdminGameSubmission["tone"];
  runtimeMode: AdminGameSubmission["runtimeMode"];
  productionKind: AdminGameSubmission["productionKind"];
  sourceCharacterId: string;
  sourceCharacterName: string;
  submitterName: string;
  submitterContact: string;
  submissionNote: string;
  reviewNote: string;
  aiHighlightsText: string;
  tagsText: string;
};

const SOURCE_OPTIONS: Array<{
  value: AdminGameSubmission["sourceKind"];
  label: string;
}> = [
  { value: "platform_official", label: "官方出品" },
  { value: "third_party", label: "第三方上传" },
  { value: "character_creator", label: "角色出品" },
];

const CATEGORY_OPTIONS: Array<{
  value: AdminGameSubmission["category"];
  label: string;
}> = [
  { value: "featured", label: "推荐" },
  { value: "party", label: "聚会" },
  { value: "competitive", label: "竞技" },
  { value: "relax", label: "休闲" },
  { value: "strategy", label: "经营" },
];

const TONE_OPTIONS: Array<{
  value: AdminGameSubmission["tone"];
  label: string;
}> = [
  { value: "forest", label: "Forest" },
  { value: "gold", label: "Gold" },
  { value: "ocean", label: "Ocean" },
  { value: "violet", label: "Violet" },
  { value: "sunset", label: "Sunset" },
  { value: "mint", label: "Mint" },
];

const RUNTIME_OPTIONS: Array<{
  value: AdminGameSubmission["runtimeMode"];
  label: string;
}> = [
  { value: "workspace_mock", label: "工作区占位" },
  { value: "chat_native", label: "聊天式 AI 游戏" },
  { value: "embedded_web", label: "嵌入式 Web" },
  { value: "remote_session", label: "远程会话" },
];

const PRODUCTION_OPTIONS: Array<{
  value: AdminGameSubmission["productionKind"];
  label: string;
}> = [
  { value: "human_authored", label: "人工制作" },
  { value: "ai_assisted", label: "AI 辅助" },
  { value: "ai_generated", label: "AI 生成" },
  { value: "character_generated", label: "角色生成" },
];

const STATUS_OPTIONS: Array<{
  value: AdminGameSubmission["status"];
  label: string;
}> = [
  { value: "pending_review", label: "待审核" },
  { value: "draft_imported", label: "已入库草稿" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
];

function splitCommaLikeText(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEmptySubmissionDraft(): SubmissionDraft {
  return {
    sourceKind: "third_party",
    status: "pending_review",
    proposedGameId: "",
    proposedName: "",
    slogan: "",
    description: "",
    studio: "",
    category: "featured",
    tone: "forest",
    runtimeMode: "workspace_mock",
    productionKind: "ai_assisted",
    sourceCharacterId: "",
    sourceCharacterName: "",
    submitterName: "",
    submitterContact: "",
    submissionNote: "",
    reviewNote: "",
    aiHighlightsText: "",
    tagsText: "",
  };
}

function applyCharacterToDraft(
  draft: SubmissionDraft,
  character: Character,
): SubmissionDraft {
  const expertDomains = character.expertDomains.filter(Boolean);

  return {
    ...draft,
    sourceKind: "character_creator",
    productionKind: "character_generated",
    runtimeMode:
      draft.runtimeMode === "workspace_mock" ? "chat_native" : draft.runtimeMode,
    proposedGameId: draft.proposedGameId.trim() || `character-${character.id}`,
    proposedName: draft.proposedName.trim() || `${character.name} 出品新作`,
    slogan:
      draft.slogan.trim() || `由 ${character.name} 主持推进的 AI 互动游戏提案。`,
    description:
      draft.description.trim() ||
      character.bio.trim() ||
      `${character.name} 发起的角色出品游戏，待补充完整玩法说明。`,
    studio: draft.studio.trim() || "角色工坊",
    sourceCharacterId: character.id,
    sourceCharacterName: character.name,
    submitterName: draft.submitterName.trim() || character.name,
    submitterContact:
      draft.submitterContact.trim() || `world://${character.id}`,
    submissionNote:
      draft.submissionNote.trim() ||
      `${character.name} 以角色身份提交的游戏提案，建议重点评估可持续更新能力与角色运营空间。`,
    aiHighlightsText:
      draft.aiHighlightsText.trim() || expertDomains.join("，"),
    tagsText:
      draft.tagsText.trim() || expertDomains.slice(0, 3).join("，"),
  };
}

function draftFromSubmission(submission: AdminGameSubmission): SubmissionDraft {
  return {
    sourceKind: submission.sourceKind,
    status: submission.status,
    proposedGameId: submission.proposedGameId,
    proposedName: submission.proposedName,
    slogan: submission.slogan,
    description: submission.description,
    studio: submission.studio,
    category: submission.category,
    tone: submission.tone,
    runtimeMode: submission.runtimeMode,
    productionKind: submission.productionKind,
    sourceCharacterId: submission.sourceCharacterId ?? "",
    sourceCharacterName: submission.sourceCharacterName ?? "",
    submitterName: submission.submitterName,
    submitterContact: submission.submitterContact,
    submissionNote: submission.submissionNote,
    reviewNote: submission.reviewNote ?? "",
    aiHighlightsText: submission.aiHighlights.join("，"),
    tagsText: submission.tags.join("，"),
  };
}

function toCreatePayload(draft: SubmissionDraft): AdminCreateGameSubmissionRequest {
  return {
    sourceKind: draft.sourceKind,
    proposedGameId: draft.proposedGameId.trim(),
    proposedName: draft.proposedName.trim(),
    slogan: draft.slogan.trim(),
    description: draft.description.trim(),
    studio: draft.studio.trim(),
    category: draft.category,
    tone: draft.tone,
    runtimeMode: draft.runtimeMode,
    productionKind: draft.productionKind,
    sourceCharacterId: draft.sourceCharacterId.trim() || null,
    sourceCharacterName: draft.sourceCharacterName.trim() || null,
    submitterName: draft.submitterName.trim(),
    submitterContact: draft.submitterContact.trim(),
    submissionNote: draft.submissionNote.trim(),
    aiHighlights: splitCommaLikeText(draft.aiHighlightsText),
    tags: splitCommaLikeText(draft.tagsText),
  };
}

function toUpdatePayload(draft: SubmissionDraft): AdminUpdateGameSubmissionRequest {
  return {
    sourceKind: draft.sourceKind,
    status: draft.status,
    proposedGameId: draft.proposedGameId.trim(),
    proposedName: draft.proposedName.trim(),
    slogan: draft.slogan.trim(),
    description: draft.description.trim(),
    studio: draft.studio.trim(),
    category: draft.category,
    tone: draft.tone,
    runtimeMode: draft.runtimeMode,
    productionKind: draft.productionKind,
    sourceCharacterId: draft.sourceCharacterId.trim() || null,
    sourceCharacterName: draft.sourceCharacterName.trim() || null,
    submitterName: draft.submitterName.trim(),
    submitterContact: draft.submitterContact.trim(),
    submissionNote: draft.submissionNote.trim(),
    reviewNote: draft.reviewNote.trim() || null,
    aiHighlights: splitCommaLikeText(draft.aiHighlightsText),
    tags: splitCommaLikeText(draft.tagsText),
  };
}

export function GameSubmissionWorkbench({
  onFeedback,
  onImportedGame,
}: {
  onFeedback: (feedback: FeedbackPayload) => void;
  onImportedGame: (gameId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [draft, setDraft] = useState<SubmissionDraft>(() =>
    createEmptySubmissionDraft(),
  );

  const submissionsQuery = useQuery({
    queryKey: ["admin-game-submissions"],
    queryFn: () => adminApi.getGameSubmissions(),
  });

  const charactersQuery = useQuery({
    queryKey: ["admin-game-submission-characters"],
    queryFn: () => adminApi.getCharacters(),
    enabled: draft.sourceKind === "character_creator",
  });

  useEffect(() => {
    if (!submissionsQuery.data?.length || selectedSubmissionId || isCreating) {
      return;
    }

    setSelectedSubmissionId(submissionsQuery.data[0].id);
  }, [isCreating, selectedSubmissionId, submissionsQuery.data]);

  const selectedSubmission = useMemo(
    () =>
      submissionsQuery.data?.find((submission) => submission.id === selectedSubmissionId) ??
      null,
    [selectedSubmissionId, submissionsQuery.data],
  );

  useEffect(() => {
    if (!selectedSubmission || isCreating) {
      return;
    }

    setDraft(draftFromSubmission(selectedSubmission));
  }, [isCreating, selectedSubmission]);

  useEffect(() => {
    if (draft.sourceKind !== "character_creator") {
      return;
    }

    setSelectedCharacterId((current) => {
      if (draft.sourceCharacterId && current !== draft.sourceCharacterId) {
        return draft.sourceCharacterId;
      }

      if (current) {
        return current;
      }

      return charactersQuery.data?.[0]?.id ?? "";
    });
  }, [charactersQuery.data, draft.sourceCharacterId, draft.sourceKind]);

  const metrics = useMemo(() => {
    const items = submissionsQuery.data ?? [];
    return {
      total: items.length,
      pending: items.filter((item) => item.status === "pending_review").length,
      imported: items.filter((item) => item.status === "draft_imported").length,
      approved: items.filter((item) => item.status === "approved").length,
    };
  }, [submissionsQuery.data]);

  const selectedCharacter = useMemo(
    () =>
      charactersQuery.data?.find((character) => character.id === selectedCharacterId) ??
      null,
    [charactersQuery.data, selectedCharacterId],
  );

  const createMutation = useMutation({
    mutationFn: (payload: AdminCreateGameSubmissionRequest) =>
      adminApi.createGameSubmission(payload),
    onSuccess: async (submission) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-game-submissions"],
      });
      setIsCreating(false);
      setSelectedSubmissionId(submission.id);
      setDraft(draftFromSubmission(submission));
      onFeedback({
        tone: "success",
        message: `${submission.proposedName} 已进入投稿池。`,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; payload: AdminUpdateGameSubmissionRequest }) =>
      adminApi.updateGameSubmission(input.id, input.payload),
    onSuccess: async (submission) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-game-submissions"],
      });
      setDraft(draftFromSubmission(submission));
      onFeedback({
        tone: "success",
        message: `${submission.proposedName} 的投稿资料已更新。`,
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: (id: string) => adminApi.importGameSubmission(id, {}),
    onSuccess: async (result) => {
      queryClient.setQueryData(
        ["admin-games-catalog-item", result.game.id],
        result.game,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-game-submissions"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-games-catalog"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-game-catalog-revisions", result.game.id],
        }),
      ]);
      setSelectedSubmissionId(result.submission.id);
      onImportedGame(result.game.id);
      onFeedback({
        tone: "success",
        message: `${result.submission.proposedName} 已导入目录草稿 ${result.game.name}。`,
      });
    },
  });

  function handleStartCreate() {
    setIsCreating(true);
    setSelectedSubmissionId(null);
    setDraft(createEmptySubmissionDraft());
  }

  function handleSelectSubmission(submissionId: string) {
    setIsCreating(false);
    setSelectedSubmissionId(submissionId);
  }

  function handleApplyCharacter() {
    if (!selectedCharacter) {
      onFeedback({
        tone: "info",
        message: "先选择一个角色，再带入角色资料。",
      });
      return;
    }

    setDraft((current) => applyCharacterToDraft(current, selectedCharacter));
    onFeedback({
      tone: "success",
      message: `已把角色 ${selectedCharacter.name} 的资料带入投稿草稿。`,
    });
  }

  async function handleSaveSubmission() {
    try {
      if (isCreating) {
        await createMutation.mutateAsync(toCreatePayload(draft));
        return;
      }

      if (!selectedSubmissionId) {
        onFeedback({
          tone: "info",
          message: "先选中一个投稿，或者新建一条投稿草稿。",
        });
        return;
      }

      await updateMutation.mutateAsync({
        id: selectedSubmissionId,
        payload: toUpdatePayload(draft),
      });
    } catch (error) {
      onFeedback({
        tone: "info",
        message:
          error instanceof Error ? error.message : "保存投稿失败，请稍后重试。",
      });
    }
  }

  async function handleImportSubmission() {
    if (isCreating || !selectedSubmissionId) {
      onFeedback({
        tone: "info",
        message: "先保存投稿，再执行入库。",
      });
      return;
    }

    try {
      await importMutation.mutateAsync(selectedSubmissionId);
    } catch (error) {
      onFeedback({
        tone: "info",
        message:
          error instanceof Error ? error.message : "投稿入库失败，请稍后重试。",
      });
    }
  }

  const editorBusy =
    createMutation.isPending || updateMutation.isPending || importMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="投稿总数" value={String(metrics.total)} />
        <MetricCard label="待审核" value={String(metrics.pending)} />
        <MetricCard label="已入库草稿" value={String(metrics.imported)} />
        <MetricCard label="已通过" value={String(metrics.approved)} />
      </div>

      <AdminCallout
        title="投稿池已经承接第三方、角色和平台内稿件"
        description="这里沉淀未来的游戏供给入口。稿件可以先审核，再一键导入为目录草稿，后续继续沿发布流走向正式上线。"
        tone="info"
        actions={
          <Button variant="primary" onClick={handleStartCreate}>
            新建投稿
          </Button>
        }
      />

      {submissionsQuery.isLoading ? (
        <LoadingBlock label="正在加载投稿池..." />
      ) : null}
      {submissionsQuery.isError && submissionsQuery.error instanceof Error ? (
        <ErrorBlock message={submissionsQuery.error.message} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          {!submissionsQuery.isLoading && !(submissionsQuery.data?.length ?? 0) ? (
            <AdminEmptyState
              title="投稿池还没有内容"
              description="新建一条投稿，或者等待第三方和角色产游稿件入库。"
            />
          ) : null}

          {(submissionsQuery.data ?? []).map((submission) => {
            const selected = !isCreating && submission.id === selectedSubmissionId;
            return (
              <Card
                key={submission.id}
                className={
                  selected
                    ? "border-[rgba(7,193,96,0.18)] bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(255,255,255,0.98))]"
                    : "bg-[color:var(--surface-console)]"
                }
              >
                <button
                  type="button"
                  onClick={() => handleSelectSubmission(submission.id)}
                  className="w-full text-left"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                          {submission.proposedName}
                        </span>
                        <StatusPill tone={resolveSourceTone(submission.sourceKind)}>
                          {formatSourceKind(submission.sourceKind)}
                        </StatusPill>
                        <StatusPill tone={resolveStatusTone(submission.status)}>
                          {formatSubmissionStatus(submission.status)}
                        </StatusPill>
                      </div>

                      <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                        {submission.studio} · {submission.submitterName}
                        {submission.sourceCharacterName
                          ? ` · 角色 ${submission.sourceCharacterName}`
                          : ""}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {submission.slogan}
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:w-[300px]">
                      <SummaryField
                        label="拟入库 ID"
                        value={submission.proposedGameId}
                      />
                      <SummaryField
                        label="运行方式"
                        value={formatRuntimeMode(submission.runtimeMode)}
                      />
                      <SummaryField
                        label="状态"
                        value={formatSubmissionStatus(submission.status)}
                      />
                      <SummaryField
                        label="更新时间"
                        value={formatTime(submission.updatedAt)}
                      />
                    </div>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>

        <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,250,0.96))]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                {isCreating ? "New Submission" : "Submission Editor"}
              </div>
              <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">
                {isCreating
                  ? "新建投稿"
                  : draft.proposedName || "投稿详情编辑器"}
              </div>
              <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                {isCreating
                  ? "先把第三方、角色或平台内稿件登记进投稿池。"
                  : "在这里补齐投稿资料、审核备注，并一键导入为游戏目录草稿。"}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {!isCreating ? (
                <Button variant="secondary" onClick={handleStartCreate}>
                  新建投稿
                </Button>
              ) : null}
              <Button
                variant="primary"
                onClick={handleSaveSubmission}
                disabled={editorBusy}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "保存中..."
                  : isCreating
                    ? "创建投稿"
                    : "保存修改"}
              </Button>
            </div>
          </div>

          {!isCreating && !selectedSubmission ? (
            <div className="mt-6">
              <AdminEmptyState
                title="先选择一条投稿"
                description="左侧选中一条投稿后，这里会展示完整投稿资料与入库动作。"
              />
            </div>
          ) : null}

          {isCreating || selectedSubmission ? (
            <div className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    来源
                  </div>
                  <SelectField
                    value={draft.sourceKind}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        sourceKind:
                          event.target.value as AdminGameSubmission["sourceKind"],
                      }))
                    }
                  >
                    {SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    投稿状态
                  </div>
                  <SelectField
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        status: event.target.value as AdminGameSubmission["status"],
                      }))
                    }
                    disabled={isCreating}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                </label>
                <EditorField
                  label="拟入库游戏 ID"
                  value={draft.proposedGameId}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, proposedGameId: value }))
                  }
                  placeholder="例如 orbit-theatre"
                />
                <EditorField
                  label="投稿游戏名"
                  value={draft.proposedName}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, proposedName: value }))
                  }
                />
                <EditorField
                  label="一句话卖点"
                  value={draft.slogan}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, slogan: value }))
                  }
                  className="md:col-span-2"
                />
              </div>

              {draft.sourceKind === "character_creator" ? (
                <div className="rounded-[20px] border border-[rgba(7,193,96,0.14)] bg-[linear-gradient(180deg,rgba(240,253,244,0.96),rgba(255,255,255,0.98))] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                        Character Intake
                      </div>
                      <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
                        角色资料快速带入
                      </div>
                      <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                        选一个现有世界角色，把身份、简介、擅长领域和联系方式直接带进投稿草稿。
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      onClick={handleApplyCharacter}
                      disabled={editorBusy || !selectedCharacter}
                    >
                      带入角色资料
                    </Button>
                  </div>

                  {charactersQuery.isLoading ? (
                    <div className="mt-4">
                      <LoadingBlock label="正在加载角色列表..." />
                    </div>
                  ) : null}
                  {charactersQuery.isError && charactersQuery.error instanceof Error ? (
                    <div className="mt-4">
                      <ErrorBlock message={charactersQuery.error.message} />
                    </div>
                  ) : null}

                  {!charactersQuery.isLoading &&
                  !(charactersQuery.data?.length ?? 0) ? (
                    <div className="mt-4">
                      <AdminEmptyState
                        title="当前还没有可用角色"
                        description="先在角色页创建或导入角色，再把角色产游稿件带进投稿池。"
                      />
                    </div>
                  ) : null}

                  {(charactersQuery.data?.length ?? 0) > 0 ? (
                    <div className="mt-4 space-y-4">
                      <label className="block">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                          选择角色
                        </div>
                        <SelectField
                          value={selectedCharacterId}
                          onChange={(event) =>
                            setSelectedCharacterId(event.target.value)
                          }
                        >
                          {charactersQuery.data?.map((character) => (
                            <option key={character.id} value={character.id}>
                              {character.name}
                            </option>
                          ))}
                        </SelectField>
                      </label>

                      {selectedCharacter ? (
                        <div className="grid gap-3 md:grid-cols-3">
                          <SummaryField label="角色名" value={selectedCharacter.name} />
                          <SummaryField
                            label="关系"
                            value={selectedCharacter.relationship}
                          />
                          <SummaryField
                            label="擅长领域"
                            value={
                              selectedCharacter.expertDomains.length > 0
                                ? selectedCharacter.expertDomains.join(" / ")
                                : "未填写"
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <EditorTextArea
                label="游戏说明"
                value={draft.description}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, description: value }))
                }
              />

              <div className="grid gap-4 md:grid-cols-2">
                <EditorField
                  label="工作室 / 团队"
                  value={draft.studio}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, studio: value }))
                  }
                />
                <EditorField
                  label="提交人"
                  value={draft.submitterName}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, submitterName: value }))
                  }
                />
                <EditorField
                  label="联系信息"
                  value={draft.submitterContact}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      submitterContact: value,
                    }))
                  }
                />
                <label>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    分类
                  </div>
                  <SelectField
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category:
                          event.target.value as AdminGameSubmission["category"],
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
                        tone: event.target.value as AdminGameSubmission["tone"],
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
                          event.target.value as AdminGameSubmission["runtimeMode"],
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
                    生产方式
                  </div>
                  <SelectField
                    value={draft.productionKind}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        productionKind:
                          event.target.value as AdminGameSubmission["productionKind"],
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
                />
              </div>

              <EditorTextArea
                label="投稿说明"
                value={draft.submissionNote}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, submissionNote: value }))
                }
              />

              <EditorTextArea
                label="审核备注"
                value={draft.reviewNote}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, reviewNote: value }))
                }
                placeholder="内部审核意见、运营建议或拒绝理由"
              />

              <EditorTextArea
                label="AI 亮点"
                value={draft.aiHighlightsText}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, aiHighlightsText: value }))
                }
              />

              <EditorTextArea
                label="标签"
                value={draft.tagsText}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, tagsText: value }))
                }
              />

              {!isCreating ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={handleImportSubmission}
                    disabled={editorBusy || !selectedSubmissionId}
                  >
                    {importMutation.isPending ? "入库中..." : "导入为目录草稿"}
                  </Button>
                  {selectedSubmission?.linkedCatalogGameId ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onImportedGame(selectedSubmission.linkedCatalogGameId!)
                      }
                    >
                      打开关联目录
                    </Button>
                  ) : null}
                </div>
              ) : null}
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
      <TextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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
        className="min-h-24"
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

function formatSourceKind(value: AdminGameSubmission["sourceKind"]) {
  switch (value) {
    case "platform_official":
      return "官方出品";
    case "third_party":
      return "第三方上传";
    case "character_creator":
      return "角色出品";
  }
}

function formatSubmissionStatus(value: AdminGameSubmission["status"]) {
  switch (value) {
    case "pending_review":
      return "待审核";
    case "draft_imported":
      return "已入库草稿";
    case "approved":
      return "已通过";
    case "rejected":
      return "已拒绝";
  }
}

function formatRuntimeMode(value: AdminGameSubmission["runtimeMode"]) {
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

function resolveSourceTone(value: AdminGameSubmission["sourceKind"]) {
  switch (value) {
    case "platform_official":
      return "healthy" as const;
    case "third_party":
      return "muted" as const;
    case "character_creator":
      return "warning" as const;
  }
}

function resolveStatusTone(value: AdminGameSubmission["status"]) {
  switch (value) {
    case "approved":
      return "healthy" as const;
    case "pending_review":
      return "warning" as const;
    case "draft_imported":
    case "rejected":
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
