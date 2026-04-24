import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updateCharacter,
  type Character,
  type MemoryLayers,
  type PersonalityProfile,
  type ScenePrompts,
  type ReplyLogicActorSnapshot,
  type ReplyLogicCharacterSnapshot,
  type ReplyLogicConstantSummary,
  type ReplyLogicConversationSnapshot,
  type ReplyLogicGroupReplyActorDriftSummary,
  type ReplyLogicGroupReplyArchiveActorSummary,
  type ReplyLogicGroupReplyArchiveTrendPoint,
  type ReplyLogicGroupReplyIssueSummary,
  type ReplyLogicGroupReplyRuntimeSummary,
  type ReplyLogicGroupReplySelectionDisposition,
  type ReplyLogicGroupReplyTaskStatus,
  type ReplyLogicGroupReplyTurnSummary,
  type ReplyLogicHistoryItem,
  type ReplyLogicNarrativeArcSummary,
  type ReplyLogicOverview,
  type ReplyLogicPreviewResult,
  type ReplyLogicStateGateSummary,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SectionHeading,
  SnapshotPanel,
  StatusPill,
  ToggleChip,
  useProviderSetup,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCodeBlock,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminFormSection as ConfigSection,
  AdminInfoRow,
  AdminInfoRows,
  AdminNoteList,
  AdminPromptSectionList,
  AdminRecordCard,
  AdminSelectableCard,
  AdminSectionHeader,
  AdminSelectField as SelectFieldBlock,
  AdminSubpanel,
  AdminTextArea as TextAreaBlock,
  AdminTextField as FieldBlock,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import {
  compareAdminText,
  formatAdminDateTime as formatLocalizedDateTime,
} from "../lib/format";

type InspectorScope = "character" | "conversation";

type EditableProfile = Omit<PersonalityProfile, "memory"> & {
  coreLogic: string;
  scenePrompts: ScenePrompts;
  memory: MemoryLayers;
};

type EditableCharacter = Omit<Character, "profile"> & {
  profile: EditableProfile;
};

const ACTIVITY_OPTIONS: Array<{
  value: NonNullable<Character["currentActivity"]>;
  label: string;
}> = [
  { value: "free", label: "空闲" },
  { value: "working", label: "工作中" },
  { value: "eating", label: "吃饭中" },
  { value: "resting", label: "休息中" },
  { value: "commuting", label: "通勤中" },
  { value: "sleeping", label: "睡觉中" },
];

function readInitialReplyLogicFocus() {
  if (typeof window === "undefined") {
    return {
      scope: "character" as InspectorScope,
      characterId: "",
      conversationId: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const conversationId = params.get("conversationId")?.trim() || "";
  const characterId = params.get("characterId")?.trim() || "";
  const scopeParam = params.get("scope");

  return {
    scope:
      scopeParam === "conversation" || conversationId
        ? ("conversation" as InspectorScope)
        : ("character" as InspectorScope),
    characterId,
    conversationId,
  };
}

export function ReplyLogicPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const initialFocus = useMemo(() => readInitialReplyLogicFocus(), []);
  const [scope, setScope] = useState<InspectorScope>(initialFocus.scope);
  const [selectedCharacterId, setSelectedCharacterId] = useState(
    initialFocus.characterId,
  );
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialFocus.conversationId,
  );
  const [configuredConversationActorId, setConfiguredConversationActorId] =
    useState("");
  const [characterDraft, setCharacterDraft] =
    useState<EditableCharacter | null>(null);
  const [runtimeRulesDraft, setRuntimeRulesDraft] =
    useState<ReplyLogicConstantSummary | null>(null);
  const [previewMessage, setPreviewMessage] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["admin-reply-logic-overview", baseUrl],
    queryFn: () => adminApi.getReplyLogicOverview(),
  });
  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }

    if (!selectedCharacterId && overviewQuery.data.characters[0]) {
      setSelectedCharacterId(overviewQuery.data.characters[0].id);
    }

    if (!selectedConversationId && overviewQuery.data.conversations[0]) {
      setSelectedConversationId(overviewQuery.data.conversations[0].id);
    }
  }, [overviewQuery.data, selectedCharacterId, selectedConversationId]);

  const activeCharacterId =
    selectedCharacterId || overviewQuery.data?.characters[0]?.id || "";
  const activeConversationId =
    selectedConversationId || overviewQuery.data?.conversations[0]?.id || "";

  const characterSnapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-character", baseUrl, activeCharacterId],
    queryFn: () => adminApi.getReplyLogicCharacterSnapshot(activeCharacterId),
    enabled: scope === "character" && Boolean(activeCharacterId),
  });

  const conversationSnapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-conversation", baseUrl, activeConversationId],
    queryFn: () =>
      adminApi.getReplyLogicConversationSnapshot(activeConversationId),
    enabled: scope === "conversation" && Boolean(activeConversationId),
  });

  const providerSetup = useProviderSetup({
    baseUrl,
    enabled: Boolean(overviewQuery.data),
    queryKeyPrefix: "reply-logic",
    invalidateOnSave: [
      ["admin-reply-logic-overview", baseUrl],
      ["admin-reply-logic-character", baseUrl],
      ["admin-reply-logic-conversation", baseUrl],
      ["admin-provider-config", baseUrl],
      ["admin-system-status", baseUrl],
      ["admin-setup-system-status", baseUrl],
    ],
  });

  const overview = overviewQuery.data;
  const selectedCharacter = useMemo(
    () =>
      overview?.characters.find((item) => item.id === activeCharacterId) ??
      null,
    [activeCharacterId, overview?.characters],
  );
  const selectedConversation = useMemo(
    () =>
      overview?.conversations.find(
        (item) => item.id === activeConversationId,
      ) ?? null,
    [activeConversationId, overview?.conversations],
  );

  const conversationActorOptions = useMemo(
    () =>
      conversationSnapshotQuery.data?.actors.map((actor) => ({
        id: actor.character.id,
        name: actor.character.name,
        relationship: actor.character.relationship,
      })) ?? [],
    [conversationSnapshotQuery.data?.actors],
  );

  useEffect(() => {
    if (!conversationActorOptions.length) {
      if (configuredConversationActorId) {
        setConfiguredConversationActorId("");
      }
      return;
    }

    if (
      !configuredConversationActorId ||
      !conversationActorOptions.some(
        (item) => item.id === configuredConversationActorId,
      )
    ) {
      setConfiguredConversationActorId(conversationActorOptions[0].id);
    }
  }, [configuredConversationActorId, conversationActorOptions]);

  const editableCharacterSource = useMemo(() => {
    if (scope === "character") {
      return characterSnapshotQuery.data?.character ?? null;
    }

    const actor =
      conversationSnapshotQuery.data?.actors.find(
        (item) => item.character.id === configuredConversationActorId,
      ) ?? conversationSnapshotQuery.data?.actors[0];

    return actor?.character ?? null;
  }, [
    characterSnapshotQuery.data?.character,
    configuredConversationActorId,
    conversationSnapshotQuery.data?.actors,
    scope,
  ]);

  const editableCharacterSeed = useMemo(
    () =>
      editableCharacterSource
        ? createEditableCharacter(editableCharacterSource)
        : null,
    [editableCharacterSource],
  );
  const editableCharacterSeedSignature = useMemo(
    () => (editableCharacterSeed ? JSON.stringify(editableCharacterSeed) : ""),
    [editableCharacterSeed],
  );
  const runtimeRulesSeedSignature = useMemo(
    () => (overview?.constants ? JSON.stringify(overview.constants) : ""),
    [overview?.constants],
  );
  const stableEditableCharacterSeedRef = useRef<EditableCharacter | null>(null);
  const stableEditableCharacterSeedSignatureRef = useRef("");
  if (
    stableEditableCharacterSeedSignatureRef.current !==
    editableCharacterSeedSignature
  ) {
    stableEditableCharacterSeedRef.current = editableCharacterSeed;
    stableEditableCharacterSeedSignatureRef.current =
      editableCharacterSeedSignature;
  }

  const stableRuntimeRulesSeedRef = useRef<ReplyLogicConstantSummary | null>(
    null,
  );
  const stableRuntimeRulesSeedSignatureRef = useRef("");
  if (
    stableRuntimeRulesSeedSignatureRef.current !== runtimeRulesSeedSignature
  ) {
    stableRuntimeRulesSeedRef.current = overview?.constants ?? null;
    stableRuntimeRulesSeedSignatureRef.current = runtimeRulesSeedSignature;
  }

  const stableEditableCharacterSeed = stableEditableCharacterSeedRef.current;
  const stableRuntimeRulesSeed = stableRuntimeRulesSeedRef.current;
  const narrativePresentation =
    runtimeRulesDraft?.narrativePresentationTemplates ??
    overview?.constants.narrativePresentationTemplates ??
    null;

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin-reply-logic-overview", baseUrl],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin-reply-logic-character", baseUrl],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin-reply-logic-conversation", baseUrl],
      }),
    ]);
  }

  const characterSaveMutation = useMutation({
    mutationFn: async (draft: EditableCharacter) => {
      const normalized = normalizeCharacterForSave(draft);
      return updateCharacter(normalized.id, normalized, baseUrl);
    },
    onSuccess: async () => {
      await Promise.all([
        refreshAll(),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-character-edit", baseUrl],
        }),
      ]);
    },
  });

  const runtimeRulesSaveMutation = useMutation({
    mutationFn: async (draft: ReplyLogicConstantSummary) =>
      adminApi.setReplyLogicRules(draft),
    onSuccess: async () => {
      await Promise.all([
        refreshAll(),
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-overview", baseUrl],
        }),
      ]);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const userMessage = previewMessage.trim();
      if (!userMessage) {
        throw new Error("请先输入候选用户消息。");
      }

      if (scope === "character") {
        return adminApi.previewReplyLogicCharacter(activeCharacterId, {
          userMessage,
        });
      }

      return adminApi.previewReplyLogicConversation(activeConversationId, {
        userMessage,
        actorCharacterId: configuredConversationActorId || undefined,
      });
    },
  });

  const resetCharacterSaveMutationRef = useRef(characterSaveMutation.reset);
  const resetRuntimeRulesSaveMutationRef = useRef(
    runtimeRulesSaveMutation.reset,
  );
  const resetPreviewMutationRef = useRef(previewMutation.reset);
  resetCharacterSaveMutationRef.current = characterSaveMutation.reset;
  resetRuntimeRulesSaveMutationRef.current = runtimeRulesSaveMutation.reset;
  resetPreviewMutationRef.current = previewMutation.reset;

  useEffect(() => {
    setCharacterDraft(stableEditableCharacterSeed);
    resetCharacterSaveMutationRef.current();
  }, [stableEditableCharacterSeed]);

  useEffect(() => {
    setRuntimeRulesDraft(stableRuntimeRulesSeed);
    resetRuntimeRulesSaveMutationRef.current();
  }, [stableRuntimeRulesSeed]);

  useEffect(() => {
    resetPreviewMutationRef.current();
  }, [
    activeCharacterId,
    activeConversationId,
    configuredConversationActorId,
    scope,
  ]);

  const isCharacterDraftDirty = useMemo(() => {
    if (!characterDraft || !editableCharacterSeedSignature) {
      return false;
    }

    return JSON.stringify(characterDraft) !== editableCharacterSeedSignature;
  }, [characterDraft, editableCharacterSeedSignature]);
  const isRuntimeRulesDraftDirty = useMemo(() => {
    if (!runtimeRulesDraft || !runtimeRulesSeedSignature) {
      return false;
    }

    return JSON.stringify(runtimeRulesDraft) !== runtimeRulesSeedSignature;
  }, [runtimeRulesDraft, runtimeRulesSeedSignature]);

  const providerLoadError =
    (providerSetup.providerQuery.error instanceof Error &&
      providerSetup.providerQuery.error.message) ||
    (providerSetup.availableModelsQuery.error instanceof Error &&
      providerSetup.availableModelsQuery.error.message) ||
    null;

  const providerActionError =
    (providerSetup.providerProbeMutation.error instanceof Error &&
      providerSetup.providerProbeMutation.error.message) ||
    (providerSetup.providerSaveMutation.error instanceof Error &&
      providerSetup.providerSaveMutation.error.message) ||
    null;

  function patchCharacterDraft(
    updater: (current: EditableCharacter) => EditableCharacter,
  ) {
    setCharacterDraft((current) => {
      if (!current) {
        return current;
      }

      return createEditableCharacter(updater(current));
    });
  }

  function resetCharacterDraft() {
    setCharacterDraft(editableCharacterSeed);
    characterSaveMutation.reset();
  }

  function saveCharacterDraft() {
    if (!characterDraft) {
      return;
    }

    characterSaveMutation.mutate(characterDraft);
  }

  function patchRuntimeRulesDraft(
    updater: (current: ReplyLogicConstantSummary) => ReplyLogicConstantSummary,
  ) {
    setRuntimeRulesDraft((current) => {
      if (!current) {
        return current;
      }

      return updater(current);
    });
  }

  function resetRuntimeRulesDraft() {
    setRuntimeRulesDraft(overview?.constants ?? null);
    runtimeRulesSaveMutation.reset();
  }

  function saveRuntimeRulesDraft() {
    if (!runtimeRulesDraft) {
      return;
    }

    runtimeRulesSaveMutation.mutate(runtimeRulesDraft);
  }

  const providerFooterMessage =
    providerSetup.providerProbeMutation.data?.message ??
    (providerSetup.providerSaveMutation.data
      ? `已保存实例级推理服务：${providerSetup.providerSaveMutation.data.model}`
      : "这里保存的是实例级兜底推理服务；如果世界主人配置了个人 API 密钥，聊天主链路仍会优先使用个人配置。");

  const targetSummaryRows =
    scope === "character" && selectedCharacter
      ? [
          { label: "角色", value: selectedCharacter.name },
          {
            label: "活动",
            value: formatActivity(selectedCharacter.currentActivity),
          },
          {
            label: "在线",
            value: selectedCharacter.isOnline ? "在线" : "离线",
          },
        ]
      : scope === "conversation" && selectedConversation
        ? [
            { label: "会话", value: selectedConversation.title },
            {
              label: "来源",
              value: formatConversationSource(selectedConversation.source),
            },
            {
              label: "参与角色",
              value: selectedConversation.participantNames.join(" / ") || "无",
            },
          ]
        : [{ label: "当前目标", value: "未选择" }];
  const providerSummaryRows = [
    {
      label: "模型",
      value: `${overview?.provider.model ?? "未配置"} (${formatProviderModelSource(overview?.provider.modelSource ?? "")})`,
    },
    {
      label: "接口地址",
      value: `${overview?.provider.endpoint ?? "未配置"} (${formatProviderEndpointSource(overview?.provider.endpointSource ?? "")})`,
    },
    {
      label: "API 密钥",
      value: formatProviderApiKeySource(overview?.provider.apiKeySource ?? ""),
    },
    {
      label: "实例级模型",
      value: overview?.provider.configuredProviderModel ?? "未设置",
    },
    {
      label: "实例级接口地址",
      value: overview?.provider.configuredProviderEndpoint ?? "未设置",
    },
  ];

  function jumpToSection(sectionId: string) {
    if (typeof document === "undefined") {
      return;
    }

    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      {overviewQuery.isLoading ? (
        <LoadingBlock label="正在读取回复逻辑总览..." />
      ) : null}
      {overviewQuery.isError && overviewQuery.error instanceof Error ? (
        <ErrorBlock message={overviewQuery.error.message} />
      ) : null}
      {initialFocus.conversationId || initialFocus.characterId ? (
        <InlineNotice>
          当前已带入
          {initialFocus.conversationId
            ? `会话 ${initialFocus.conversationId}`
            : `角色 ${initialFocus.characterId}`}
          的回复逻辑上下文。
        </InlineNotice>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_440px]">
            <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              {/* Quick actions */}
              <div className="flex gap-2">
                <Button
                  onClick={() => void refreshAll()}
                  variant="secondary"
                  size="sm"
                  className="flex-1 justify-center"
                >
                  刷新快照
                </Button>
                <Button
                  onClick={saveRuntimeRulesDraft}
                  variant="primary"
                  size="sm"
                  className="flex-1 justify-center"
                  disabled={
                    !isRuntimeRulesDraftDirty ||
                    runtimeRulesSaveMutation.isPending
                  }
                >
                  {runtimeRulesSaveMutation.isPending
                    ? "保存中..."
                    : "保存规则"}
                </Button>
              </div>

              {/* Jump links */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "快照", id: "reply-logic-inspector" },
                  { label: "预演", id: "reply-logic-preview" },
                  { label: "配置", id: "reply-logic-config" },
                  { label: "规则", id: "reply-logic-rules" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jumpToSection(item.id)}
                    className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-1 text-xs text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <Card className="bg-[color:var(--surface-console)]">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope("character")}
                    className={
                      scope === "character"
                        ? "rounded-[16px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-3 py-2 text-sm font-medium text-[color:var(--brand-primary)]"
                        : "rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)]"
                    }
                  >
                    按角色
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("conversation")}
                    className={
                      scope === "conversation"
                        ? "rounded-[16px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-3 py-2 text-sm font-medium text-[color:var(--brand-primary)]"
                        : "rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)]"
                    }
                  >
                    按会话
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {scope === "character" ? (
                    <TargetListCard
                      title="角色列表"
                      items={(overview.characters ?? []).map((item) => ({
                        id: item.id,
                        title: item.name,
                        subtitle: formatActivity(item.currentActivity),
                        active: item.id === activeCharacterId,
                        status: item.isOnline ? "在线" : "离线",
                        tone: item.isOnline ? "healthy" : "muted",
                        onSelect: () => setSelectedCharacterId(item.id),
                      }))}
                    />
                  ) : (
                    <TargetListCard
                      title="会话列表"
                      items={(overview.conversations ?? []).map((item) => ({
                        id: item.id,
                        title: item.title,
                        subtitle: formatConversationSource(item.source),
                        active: item.id === activeConversationId,
                        status: item.participantNames.join(" / ") || "无角色",
                        tone: "muted" as const,
                        onSelect: () => setSelectedConversationId(item.id),
                      }))}
                    />
                  )}
                </div>
              </Card>

              <AdminInfoRows title="目标摘要" rows={targetSummaryRows} />

              <AdminInfoRows
                title="真实运行推理服务"
                rows={providerSummaryRows}
              />

              {overview.provider.notes.length ? (
                <Card className="bg-[color:var(--surface-console)]">
                  <SectionHeading>运行备注</SectionHeading>
                  <div className="mt-4 space-y-2">
                    {overview.provider.notes.map((note) => (
                      <InlineNotice key={note} tone="warning">
                        {formatReplyLogicText(note)}
                      </InlineNotice>
                    ))}
                  </div>
                </Card>
              ) : null}

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>运行时常量</SectionHeading>
                <SnapshotPanel
                  className="mt-4"
                  title="当前生效运行时摘要"
                  value={formatRuntimeConstants(overview.constants)}
                />
              </Card>
            </div>

            <div id="reply-logic-inspector" className="space-y-6">
              {scope === "character" ? (
                <CharacterInspectorPanel
                  selectedCharacter={selectedCharacter}
                  query={characterSnapshotQuery}
                  narrativePresentation={narrativePresentation}
                />
              ) : (
                <ConversationInspectorPanel
                  selectedConversation={selectedConversation}
                  query={conversationSnapshotQuery}
                  baseUrl={baseUrl}
                  narrativePresentation={narrativePresentation}
                />
              )}
            </div>

            <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
              <div id="reply-logic-preview">
                <ReplyPreviewPanel
                  scope={scope}
                  previewMessage={previewMessage}
                  onPreviewMessageChange={setPreviewMessage}
                  actorOptions={conversationActorOptions}
                  configuredConversationActorId={configuredConversationActorId}
                  onConfiguredConversationActorIdChange={
                    setConfiguredConversationActorId
                  }
                  preview={previewMutation.data}
                  error={previewMutation.error}
                  isPending={previewMutation.isPending}
                  onRunPreview={() => previewMutation.mutate()}
                />
              </div>

              <div id="reply-logic-config">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader
                    title="配置抽屉"
                    actions={
                      <AdminDraftStatusPill
                        ready={Boolean(characterDraft)}
                        dirty={isCharacterDraftDirty}
                        loadingLabel="等待目标"
                      />
                    }
                  />
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <MetricCard
                      label="当前范围"
                      value={scope === "character" ? "角色" : "会话"}
                    />
                    <MetricCard
                      label="配置目标"
                      value={
                        editableCharacterSource?.name ??
                        (scope === "conversation"
                          ? "先选择会话角色"
                          : "先选择角色")
                      }
                    />
                  </div>

                  {scope === "conversation" ? (
                    <SelectFieldBlock
                      className="mt-4"
                      label="会话内配置角色"
                      value={configuredConversationActorId}
                      onChange={setConfiguredConversationActorId}
                      options={conversationActorOptions.map((item) => ({
                        value: item.id,
                        label: `${item.name} · ${item.relationship}`,
                      }))}
                    />
                  ) : null}

                  <InlineNotice className="mt-4" tone="muted">
                    这里改的是实体字段和 `profile`
                    配置对象。本页不会实时重算草稿提示词，保存后会刷新右侧快照，看到真实生效结果。
                  </InlineNotice>
                </Card>
              </div>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="角色配置"
                  actions={
                    editableCharacterSource ? (
                      <StatusPill
                        tone={
                          editableCharacterSource.isOnline ? "healthy" : "muted"
                        }
                      >
                        {editableCharacterSource.isOnline ? "在线" : "离线"}
                      </StatusPill>
                    ) : null
                  }
                />

                {!characterDraft ? (
                  scope === "character" && characterSnapshotQuery.isLoading ? (
                    <LoadingBlock
                      className="mt-4"
                      label="正在加载角色配置..."
                    />
                  ) : scope === "conversation" &&
                    conversationSnapshotQuery.isLoading ? (
                    <LoadingBlock
                      className="mt-4"
                      label="正在加载会话角色配置..."
                    />
                  ) : (
                    <AdminEmptyState
                      className="mt-4"
                      title="当前没有可编辑角色"
                      description={
                        scope === "conversation"
                          ? "先在会话内选择一个角色，再修改它的运行配置。"
                          : "先在左侧选择一个角色，再开始编辑运行配置。"
                      }
                    />
                  )
                ) : (
                  <>
                    {characterDraft.profile.systemPrompt?.trim() ? (
                      <InlineNotice className="mt-4" tone="warning">
                        当前已填写
                        `systemPrompt`，真实回复时会直接覆盖结构化提示词拼装。你在下面改的身份、语气、边界字段，只有清空
                        `systemPrompt` 后才会重新体现在最终提示词里。
                      </InlineNotice>
                    ) : null}

                    {characterSaveMutation.isError &&
                    characterSaveMutation.error instanceof Error ? (
                      <ErrorBlock
                        message={characterSaveMutation.error.message}
                      />
                    ) : null}
                    {characterSaveMutation.isSuccess ? (
                      <AdminActionFeedback
                        tone="success"
                        title="角色配置已保存"
                        description="运行时快照正在刷新。"
                      />
                    ) : null}

                    <div className="mt-4 space-y-6">
                      <ConfigSection title="回复运行">
                        <FieldBlock
                          label="关系描述"
                          value={characterDraft.relationship}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              relationship: value,
                            }))
                          }
                        />
                        <FieldBlock
                          label="擅长领域"
                          value={listToCsv(characterDraft.expertDomains)}
                          placeholder="法律, 理财, 心理"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              expertDomains: csvToList(value),
                            }))
                          }
                        />
                        <SelectFieldBlock
                          label="在线状态模式"
                          value={characterDraft.onlineMode ?? "auto"}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              onlineMode:
                                value === "manual" ? "manual" : "auto",
                            }))
                          }
                          options={[
                            { value: "auto", label: "自动调度" },
                            { value: "manual", label: "人工锁定" },
                          ]}
                        />
                        <SelectFieldBlock
                          label="当前活动模式"
                          value={characterDraft.activityMode ?? "auto"}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              activityMode:
                                value === "manual" ? "manual" : "auto",
                            }))
                          }
                          options={[
                            { value: "auto", label: "自动调度" },
                            { value: "manual", label: "人工锁定" },
                          ]}
                        />
                        <SelectFieldBlock
                          label="当前活动"
                          value={characterDraft.currentActivity ?? ""}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              currentActivity: value || null,
                            }))
                          }
                          options={[
                            { value: "", label: "未设置 / 交给调度" },
                            ...ACTIVITY_OPTIONS.map((item) => ({
                              value: item.value,
                              label: item.label,
                            })),
                          ]}
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                          <FieldBlock
                            label="活跃开始小时"
                            value={characterDraft.activeHoursStart ?? ""}
                            type="number"
                            min={0}
                            max={23}
                            onChange={(value) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                activeHoursStart: parseOptionalHour(value),
                              }))
                            }
                          />
                          <FieldBlock
                            label="活跃结束小时"
                            value={characterDraft.activeHoursEnd ?? ""}
                            type="number"
                            min={0}
                            max={23}
                            onChange={(value) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                activeHoursEnd: parseOptionalHour(value),
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <ToggleChip
                            label="在线"
                            checked={characterDraft.isOnline}
                            onChange={(event) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                isOnline: event.currentTarget.checked,
                              }))
                            }
                          />
                        </div>
                        {(characterDraft.onlineMode ?? "auto") === "auto" ||
                        (characterDraft.activityMode ?? "auto") === "auto" ? (
                          <InlineNotice tone="warning">
                            处于“自动调度”的字段仍会被定时任务更新；切到“人工锁定”后，后台手动设置的在线状态或当前活动才会持续生效。
                          </InlineNotice>
                        ) : null}
                      </ConfigSection>

                      <ConfigSection title="底层逻辑">
                        <TextAreaBlock
                          label="底层逻辑"
                          value={characterDraft.profile.coreLogic ?? ""}
                          description="所有场景强制注入。描述角色的核心人格、价值观、思维方式。这里写的内容在聊天、发帖、评论等每个场景都会生效。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: { ...current.profile, coreLogic: value },
                            }))
                          }
                        />
                      </ConfigSection>

                      <ConfigSection title="场景提示词 — 主动发布">
                        <TextAreaBlock
                          label="发朋友圈"
                          value={
                            characterDraft.profile.scenePrompts?.moments_post ??
                            ""
                          }
                          description="触发：定时发朋友圈（由发圈频率控制）。无实时上下文。写发圈内容偏好、常见话题、风格规范，以及是否偏好配图/纯文字等倾向。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  moments_post: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="发 Feed 贴文"
                          value={
                            characterDraft.profile.scenePrompts?.feed_post ?? ""
                          }
                          description="触发：定时在广场发贴（由 Feed 频率控制）。无实时上下文。写公开发帖的风格、内容方向、是否引导讨论等。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  feed_post: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="发视频号"
                          value={
                            characterDraft.profile.scenePrompts?.channel_post ??
                            ""
                          }
                          description="触发：定时发视频号内容。无实时上下文。写视频号文案风格、内容结构要求（标题/正文/话题标签等）。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  channel_post: value,
                                },
                              },
                            }))
                          }
                        />
                      </ConfigSection>

                      <ConfigSection title="场景提示词 — 互动响应">
                        <TextAreaBlock
                          label="聊天回复"
                          value={
                            characterDraft.profile.scenePrompts?.chat ?? ""
                          }
                          description="触发：用户发消息时。系统自动注入：当前时间、角色活动状态、距上次聊天时长。写聊天风格、话题偏好、对话节奏，可引导 AI 调整回复长短和语气。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  chat: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="朋友圈评论/回复"
                          value={
                            characterDraft.profile.scenePrompts
                              ?.moments_comment ?? ""
                          }
                          description="触发：角色浏览到用户朋友圈时自动评论。写评论语气、常用开场方式、喜欢哪类内容多互动，不喜欢哪类则少评甚至不评。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  moments_comment: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="Feed 评论"
                          value={
                            characterDraft.profile.scenePrompts?.feed_comment ??
                            ""
                          }
                          description="触发：角色看到用户 Feed 贴文时自动评论。写评论偏好，例如犀利点评 / 鼓励互动 / 专业补充，以及对哪类帖子积极评论。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  feed_comment: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="好友请求/摇一摇问候"
                          value={
                            characterDraft.profile.scenePrompts?.greeting ?? ""
                          }
                          description="触发：角色发起好友申请或摇一摇。只生成一句打招呼的话，建议写简短有特点的开场方式，20 字以内效果最佳。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  greeting: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="主动提醒"
                          value={
                            characterDraft.profile.scenePrompts?.proactive ?? ""
                          }
                          description="触发：定时任务检测角色记忆，决定是否主动给用户发消息。写什么情况下应该主动发（如记得某事想分享），什么情况下保持沉默。不填则由底层逻辑判断。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                scenePrompts: {
                                  ...current.profile.scenePrompts,
                                  proactive: value,
                                },
                              },
                            }))
                          }
                        />
                      </ConfigSection>

                      <ConfigSection title="记忆（当前值）">
                        <p className="text-xs text-[color:var(--text-secondary)]">
                          核心记忆每周一自动更新，近期摘要每日自动更新。在运行台中可查看和手动覆盖当前值。
                        </p>
                        <div className="rounded border border-[color:var(--border-faint)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                          <p>
                            <span className="font-medium text-[color:var(--text-primary)]">
                              核心记忆：
                            </span>
                            {characterDraft.profile.memory.coreMemory ||
                              "（暂无）"}
                          </p>
                          <p className="mt-1">
                            <span className="font-medium text-[color:var(--text-primary)]">
                              近期摘要：
                            </span>
                            {characterDraft.profile.memory.recentSummary ||
                              "（暂无）"}
                          </p>
                        </div>
                      </ConfigSection>

                      <div className="flex flex-wrap gap-3 border-t border-[color:var(--border-faint)] pt-5">
                        <Button
                          variant="secondary"
                          onClick={resetCharacterDraft}
                        >
                          重置草稿
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                coreLogic: "",
                                scenePrompts: {
                                  chat: "",
                                  moments_post: "",
                                  moments_comment: "",
                                  feed_post: "",
                                  channel_post: "",
                                  feed_comment: "",
                                  greeting: "",
                                  proactive: "",
                                },
                              },
                            }))
                          }
                        >
                          清空所有提示词
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                memory: {
                                  ...current.profile.memory,
                                  recentSummary: "",
                                },
                              },
                            }))
                          }
                        >
                          清空近期摘要
                        </Button>
                        <Button
                          variant="primary"
                          onClick={saveCharacterDraft}
                          disabled={
                            !isCharacterDraftDirty ||
                            characterSaveMutation.isPending
                          }
                        >
                          {characterSaveMutation.isPending
                            ? "保存中..."
                            : "保存角色配置"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="回复运行配置"
                  actions={
                    <StatusPill
                      tone={providerSetup.providerReady ? "healthy" : "warning"}
                    >
                      {providerSetup.providerReady ? "已配置" : "待配置"}
                    </StatusPill>
                  }
                />

                <div className="mt-4 space-y-4">
                  <FieldBlock
                    label="接口地址"
                    value={providerSetup.providerDraft.endpoint}
                    placeholder="https://api.openai.com/v1"
                    onChange={(value) =>
                      providerSetup.updateProviderDraft("endpoint", value)
                    }
                  />

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <SelectFieldBlock
                      label="模式"
                      value={providerSetup.providerDraft.mode}
                      onChange={(value) =>
                        providerSetup.updateProviderDraft(
                          "mode",
                          value === "cloud" ? "cloud" : "local-compatible",
                        )
                      }
                      options={[
                        { value: "local-compatible", label: "本地兼容" },
                        { value: "cloud", label: "云端模式" },
                      ]}
                    />
                    <FieldBlock
                      label="模型"
                      value={providerSetup.providerDraft.model}
                      placeholder="gpt-4.1-mini"
                      list="reply-logic-available-models"
                      onChange={(value) =>
                        providerSetup.updateProviderDraft("model", value)
                      }
                    />
                    <datalist id="reply-logic-available-models">
                      {(
                        providerSetup.availableModelsQuery.data?.models ?? []
                      ).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </div>

                  <FieldBlock
                    label="API 密钥"
                    value={providerSetup.providerDraft.apiKey ?? ""}
                    type="password"
                    placeholder="输入实例级推理服务 API 密钥"
                    onChange={(value) =>
                      providerSetup.updateProviderDraft("apiKey", value)
                    }
                  />

                  {providerSetup.providerValidationMessage ? (
                    <InlineNotice tone="warning">
                      {providerSetup.providerValidationMessage}
                    </InlineNotice>
                  ) : null}
                  {providerLoadError ? (
                    <ErrorBlock message={providerLoadError} />
                  ) : null}
                  {providerActionError ? (
                    <ErrorBlock message={providerActionError} />
                  ) : null}
                  {providerSetup.providerSaveMutation.isSuccess ? (
                    <AdminActionFeedback
                      tone="success"
                      title="运行配置已保存"
                      description="实例级推理服务已保存，运行时快照正在刷新。"
                    />
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={providerSetup.submitProviderProbe}
                      disabled={providerSetup.providerProbeMutation.isPending}
                    >
                      {providerSetup.providerProbeMutation.isPending
                        ? "测试中..."
                        : "测试连接"}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={providerSetup.submitProviderSave}
                      disabled={providerSetup.providerSaveMutation.isPending}
                    >
                      {providerSetup.providerSaveMutation.isPending
                        ? "保存中..."
                        : "保存运行配置"}
                    </Button>
                  </div>

                  <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                    {providerFooterMessage}
                  </div>
                </div>
              </Card>

              <div id="reply-logic-rules">
                <RuntimeRulesEditorCard
                  draft={runtimeRulesDraft}
                  isDirty={isRuntimeRulesDraftDirty}
                  isPending={runtimeRulesSaveMutation.isPending}
                  error={
                    runtimeRulesSaveMutation.error instanceof Error
                      ? runtimeRulesSaveMutation.error.message
                      : null
                  }
                  isSuccess={runtimeRulesSaveMutation.isSuccess}
                  onPatch={patchRuntimeRulesDraft}
                  onReset={resetRuntimeRulesDraft}
                  onSave={saveRuntimeRulesDraft}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TargetListCard({
  title,
  items,
}: {
  title: string;
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    active: boolean;
    status: string;
    tone: "healthy" | "warning" | "muted";
    onSelect: () => void;
  }>;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <AdminSelectableCard
            key={item.id}
            onClick={item.onSelect}
            active={item.active}
            title={item.title}
            subtitle={item.subtitle}
            badge={<StatusPill tone={item.tone}>{item.status}</StatusPill>}
          />
        ))}
      </div>
    </div>
  );
}

function CharacterInspectorPanel({
  selectedCharacter,
  query,
  narrativePresentation,
}: {
  selectedCharacter: ReplyLogicOverview["characters"][number] | null;
  query: ReturnType<typeof useQuery<ReplyLogicCharacterSnapshot>>;
  narrativePresentation:
    | ReplyLogicConstantSummary["narrativePresentationTemplates"]
    | null;
}) {
  if (!selectedCharacter) {
    return (
      <AdminEmptyState
        title="当前没有可选角色"
        description="先在左侧角色列表里选中一个角色，再查看真实回复快照。"
      />
    );
  }

  if (query.isLoading) {
    return <LoadingBlock label="正在读取角色回复快照..." />;
  }

  if (query.isError && query.error instanceof Error) {
    return <ErrorBlock message={query.error.message} />;
  }

  if (!query.data) {
    return (
      <AdminEmptyState
        title="角色回复快照暂不可用"
        description="刷新一次快照；如果仍不可用，先检查推理服务配置和角色运行状态。"
      />
    );
  }

  return (
    <>
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>当前角色</SectionHeading>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="名称" value={query.data.character.name} />
          <MetricCard
            label="关系"
            value={formatRelationship(query.data.character.relationship)}
          />
          <MetricCard
            label="活动"
            value={formatActivity(query.data.character.currentActivity)}
          />
          <MetricCard
            label="遗忘曲线"
            value={query.data.actor.forgettingCurve}
          />
        </div>
      </Card>

      <ActorSnapshotCard actor={query.data.actor} title="单聊回复角色快照" />

      <NarrativeCard
        arcs={query.data.narrativeArc ? [query.data.narrativeArc] : []}
        narrativePresentation={narrativePresentation}
      />

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>备注</SectionHeading>
        <AdminNoteList
          className="mt-4"
          items={query.data.notes.map((note) => formatReplyLogicText(note))}
        />
      </Card>
    </>
  );
}

function ReplyPreviewPanel({
  scope,
  previewMessage,
  onPreviewMessageChange,
  actorOptions,
  configuredConversationActorId,
  onConfiguredConversationActorIdChange,
  preview,
  error,
  isPending,
  onRunPreview,
}: {
  scope: InspectorScope;
  previewMessage: string;
  onPreviewMessageChange: (value: string) => void;
  actorOptions: Array<{ id: string; name: string; relationship: string }>;
  configuredConversationActorId: string;
  onConfiguredConversationActorIdChange: (value: string) => void;
  preview?: ReplyLogicPreviewResult;
  error: unknown;
  isPending: boolean;
  onRunPreview: () => void;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="候选消息预演"
        actions={
          <StatusPill tone={preview ? "healthy" : "muted"}>
            {preview ? "已生成预演" : "等待预演"}
          </StatusPill>
        }
      />

      {scope === "conversation" ? (
        <SelectFieldBlock
          className="mt-4"
          label="预演角色"
          value={configuredConversationActorId}
          onChange={onConfiguredConversationActorIdChange}
          options={actorOptions.map((item) => ({
            value: item.id,
            label: `${item.name} · ${item.relationship}`,
          }))}
        />
      ) : null}

      <TextAreaBlock
        label="候选用户消息"
        value={previewMessage}
        placeholder="输入一条你想预演的用户消息。"
        onChange={onPreviewMessageChange}
      />

      {error instanceof Error ? <ErrorBlock message={error.message} /> : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => onPreviewMessageChange("")}>
          清空
        </Button>
        <Button
          variant="primary"
          onClick={onRunPreview}
          disabled={!previewMessage.trim() || isPending}
        >
          {isPending ? "预演中..." : "执行预演"}
        </Button>
      </div>

      {preview ? (
        <div className="mt-6 space-y-6 border-t border-[color:var(--border-faint)] pt-6">
          <ActorSnapshotCard actor={preview.actor} title="候选消息预演快照" />
          <AdminSubpanel title="预演备注" contentClassName="mt-3">
            <AdminNoteList
              items={preview.notes.map((note) => formatReplyLogicText(note))}
            />
          </AdminSubpanel>
        </div>
      ) : null}
    </Card>
  );
}

function ConversationInspectorPanel({
  selectedConversation,
  query,
  baseUrl,
  narrativePresentation,
}: {
  selectedConversation: ReplyLogicOverview["conversations"][number] | null;
  query: ReturnType<typeof useQuery<ReplyLogicConversationSnapshot>>;
  baseUrl: string;
  narrativePresentation:
    | ReplyLogicConstantSummary["narrativePresentationTemplates"]
    | null;
}) {
  if (!selectedConversation) {
    return (
      <AdminEmptyState
        title="当前没有可选会话"
        description="切换到按会话查看后，先在左侧会话列表里选中一个目标。"
      />
    );
  }

  if (query.isLoading) {
    return <LoadingBlock label="正在读取会话回复快照..." />;
  }

  if (query.isError && query.error instanceof Error) {
    return <ErrorBlock message={query.error.message} />;
  }

  if (!query.data) {
    return (
      <AdminEmptyState
        title="会话回复快照暂不可用"
        description="先刷新快照；如果仍不可用，检查该会话是否已有参与角色和可见历史。"
      />
    );
  }

  return (
    <>
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>会话分支</SectionHeading>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="标题" value={query.data.conversation.title} />
          <MetricCard
            label="类型"
            value={formatConversationType(query.data.conversation.type)}
          />
          <MetricCard
            label="来源"
            value={formatConversationSource(query.data.conversation.source)}
          />
          <MetricCard label="参与角色" value={query.data.actors.length} />
        </div>
        <AdminRecordCard
          className="mt-4"
          title={formatReplyLogicText(query.data.branchSummary.title)}
          details={
            <AdminNoteList
              items={query.data.branchSummary.notes.map((note) =>
                formatReplyLogicText(note),
              )}
            />
          }
        />
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>可见会话历史</SectionHeading>
        <HistoryList className="mt-4" items={query.data.visibleMessages} />
      </Card>

      {query.data.groupReplyRuntime ? (
        <GroupReplyRuntimeCard
          baseUrl={baseUrl}
          conversationId={query.data.conversation.id}
          runtime={query.data.groupReplyRuntime}
          visibleMessages={query.data.visibleMessages}
        />
      ) : null}

      <div className="space-y-6">
        {query.data.actors.map((actor) => (
          <ActorSnapshotCard
            key={`${query.data.conversation.id}-${actor.character.id}`}
            actor={actor}
            title={`${actor.character.name} 快照`}
          />
        ))}
      </div>

      <NarrativeCard
        arcs={query.data.narrativeArcs}
        narrativePresentation={narrativePresentation}
      />
    </>
  );
}

function GroupReplyRuntimeCard({
  baseUrl,
  conversationId,
  runtime,
  visibleMessages,
}: {
  baseUrl: string;
  conversationId: string;
  runtime: ReplyLogicGroupReplyRuntimeSummary;
  visibleMessages: ReplyLogicHistoryItem[];
}) {
  const queryClient = useQueryClient();
  const taskSectionRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | ReplyLogicGroupReplyTaskStatus
  >("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [cleanupDays, setCleanupDays] = useState("14");
  const [archiveTrendWindow, setArchiveTrendWindow] = useState("14");
  const visibleMessageMap = new Map(
    visibleMessages.map((item) => [item.id, item]),
  );
  const actorOptions = useMemo(() => {
    const actorMap = new Map<string, string>();
    for (const turn of runtime.recentTurns) {
      for (const task of turn.tasks) {
        actorMap.set(task.actorCharacterId, task.actorName);
      }
      for (const candidate of turn.candidates) {
        actorMap.set(candidate.characterId, candidate.characterName);
      }
    }
    for (const archivedActor of runtime.archiveSummary?.actorSummary ?? []) {
      actorMap.set(archivedActor.actorCharacterId, archivedActor.actorName);
    }

    return [...actorMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => compareAdminText(left.name, right.name));
  }, [runtime.archiveSummary?.actorSummary, runtime.recentTurns]);

  const retryMutation = useMutation({
    mutationFn: async (taskId: string) =>
      adminApi.retryReplyLogicGroupReplyTask(taskId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-conversation", baseUrl, conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-overview", baseUrl],
        }),
      ]);
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () =>
      adminApi.cleanupReplyLogicGroupReplyTasks({
        groupId: conversationId,
        olderThanDays: Number(cleanupDays) || 14,
        statuses: ["sent", "cancelled", "failed"],
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-conversation", baseUrl, conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-overview", baseUrl],
        }),
      ]);
    },
  });

  const retryTurnMutation = useMutation({
    mutationFn: async (turnId: string) =>
      adminApi.retryReplyLogicGroupReplyTurn(turnId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-conversation", baseUrl, conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-reply-logic-overview", baseUrl],
        }),
      ]);
    },
  });

  const filteredTurns = useMemo(() => {
    return runtime.recentTurns
      .map((turn) => {
        const filteredTasks = turn.tasks.filter((task) => {
          if (statusFilter !== "all" && task.status !== statusFilter) {
            return false;
          }
          if (actorFilter !== "all" && task.actorCharacterId !== actorFilter) {
            return false;
          }
          return true;
        });
        const filteredCandidates = turn.candidates.filter((candidate) => {
          if (actorFilter !== "all" && candidate.characterId !== actorFilter) {
            return false;
          }
          return true;
        });
        const matchesStatus =
          statusFilter === "all" ? true : filteredTasks.length > 0;
        const matchesActor =
          actorFilter === "all"
            ? true
            : filteredTasks.length > 0 || filteredCandidates.length > 0;
        if (!matchesStatus || !matchesActor) {
          return null;
        }

        return {
          ...turn,
          tasks: filteredTasks,
          candidates: filteredCandidates,
        };
      })
      .filter((turn): turn is ReplyLogicGroupReplyTurnSummary => Boolean(turn));
  }, [actorFilter, runtime.recentTurns, statusFilter]);
  const visibleIssueSummary = useMemo(() => {
    if (actorFilter === "all" && statusFilter === "all") {
      return runtime.issueSummary;
    }

    return buildVisibleGroupReplyIssueSummary(
      filteredTurns.flatMap((turn) => turn.tasks),
      8,
    );
  }, [actorFilter, filteredTurns, runtime.issueSummary, statusFilter]);
  const visibleActorDrift = useMemo(() => {
    if (actorFilter !== "all") {
      return runtime.actorDriftSummary.filter(
        (actor) => actor.actorCharacterId === actorFilter,
      );
    }

    return runtime.actorDriftSummary
      .filter((actor) => actor.severity !== "stable")
      .slice(0, 6);
  }, [actorFilter, runtime.actorDriftSummary]);
  const selectedArchiveActor = useMemo(() => {
    if (!runtime.archiveSummary || actorFilter === "all") {
      return null;
    }

    return (
      runtime.archiveSummary.actorSummary.find(
        (actor) => actor.actorCharacterId === actorFilter,
      ) ?? null
    );
  }, [actorFilter, runtime.archiveSummary]);
  const visibleArchiveTrend = useMemo(() => {
    if (!runtime.archiveSummary) {
      return [];
    }

    const windowSize = Number(archiveTrendWindow) || 14;
    const trendSource =
      selectedArchiveActor?.trend ?? runtime.archiveSummary.trend;
    return trendSource.slice(-windowSize);
  }, [archiveTrendWindow, runtime.archiveSummary, selectedArchiveActor]);
  const visibleArchiveActors = useMemo(() => {
    if (!runtime.archiveSummary) {
      return [];
    }

    if (selectedArchiveActor) {
      return [selectedArchiveActor];
    }

    return runtime.archiveSummary.actorSummary.slice(0, 8);
  }, [runtime.archiveSummary, selectedArchiveActor]);
  const visibleArchiveIssueSummary = useMemo(() => {
    if (!runtime.archiveSummary) {
      return [];
    }

    return (
      selectedArchiveActor?.issueSummary ?? runtime.archiveSummary.issueSummary
    );
  }, [runtime.archiveSummary, selectedArchiveActor]);
  const selectedActorOption = useMemo(
    () => actorOptions.find((actor) => actor.id === actorFilter) ?? null,
    [actorFilter, actorOptions],
  );
  const archiveMetricStatusCounts = selectedArchiveActor
    ? {
        sent: selectedArchiveActor.sentCount,
        cancelled: selectedArchiveActor.cancelledCount,
        failed: selectedArchiveActor.failedCount,
      }
    : (runtime.archiveSummary?.statusCounts ?? null);
  const hasActiveTaskFilter = actorFilter !== "all" || statusFilter !== "all";
  const taskFilterSummary = [
    `角色：${selectedActorOption?.name ?? "全部角色"}`,
    `状态：${statusFilter === "all" ? "全部状态" : formatGroupReplyTaskStatus(statusFilter)}`,
  ].join(" · ");

  function scrollToTaskSection() {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      taskSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function focusFilteredTasks(
    nextActorFilter: string,
    nextStatusFilter: "all" | ReplyLogicGroupReplyTaskStatus,
  ) {
    setActorFilter(nextActorFilter);
    setStatusFilter(nextStatusFilter);
    scrollToTaskSection();
  }

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="群聊回复任务"
        actions={
          <div className="flex flex-wrap gap-3">
            <SelectFieldBlock
              label="状态筛选"
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | ReplyLogicGroupReplyTaskStatus)
              }
              options={[
                { value: "all", label: "全部状态" },
                { value: "pending", label: "待执行" },
                { value: "processing", label: "处理中" },
                { value: "failed", label: "失败" },
                { value: "cancelled", label: "已取消" },
                { value: "sent", label: "已发送" },
              ]}
            />
            <SelectFieldBlock
              label="角色筛选"
              value={actorFilter}
              onChange={setActorFilter}
              options={[
                { value: "all", label: "全部角色" },
                ...actorOptions.map((actor) => ({
                  value: actor.id,
                  label: actor.name,
                })),
              ]}
            />
            <SelectFieldBlock
              label="清理保留期"
              value={cleanupDays}
              onChange={setCleanupDays}
              options={[
                { value: "3", label: "保留 3 天" },
                { value: "7", label: "保留 7 天" },
                { value: "14", label: "保留 14 天" },
                { value: "30", label: "保留 30 天" },
              ]}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
              className="self-end"
            >
              {cleanupMutation.isPending ? "清理中..." : "清理终态任务"}
            </Button>
          </div>
        }
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="待执行" value={runtime.pendingTaskCount} />
        <MetricCard label="处理中" value={runtime.processingTaskCount} />
        <MetricCard label="失败" value={runtime.failedTaskCount} />
        <MetricCard label="匹配轮次" value={filteredTurns.length} />
      </div>

      <AdminNoteList
        className="mt-4"
        items={runtime.notes.map((note) => formatReplyLogicText(note))}
      />
      {cleanupMutation.isError && cleanupMutation.error instanceof Error ? (
        <ErrorBlock message={cleanupMutation.error.message} />
      ) : null}
      {retryMutation.isError && retryMutation.error instanceof Error ? (
        <ErrorBlock message={retryMutation.error.message} />
      ) : null}
      {retryTurnMutation.isError && retryTurnMutation.error instanceof Error ? (
        <ErrorBlock message={retryTurnMutation.error.message} />
      ) : null}
      {cleanupMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="终态任务已清理"
          description={cleanupMutation.data.note}
        />
      ) : null}
      {retryMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="失败任务已重新入队"
          description={retryMutation.data.note}
        />
      ) : null}
      {retryTurnMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="整轮任务已重新入队"
          description={retryTurnMutation.data.note}
        />
      ) : null}

      <AdminSubpanel title="问题聚合" contentClassName="mt-4">
        {!visibleIssueSummary.length ? (
          <AdminEmptyState
            title="最近没有失败或取消集中点"
            description={
              actorFilter === "all" && statusFilter === "all"
                ? "当前任务执行比较稳定，最近轮次里没有显著的失败/取消原因聚合。"
                : "当前筛选条件下，没有发现明显的失败或取消原因聚合。"
            }
          />
        ) : (
          <div className="space-y-3">
            {visibleIssueSummary.map((issue) => (
              <AdminRecordCard
                key={issue.key}
                title={issue.label}
                badges={
                  <>
                    <StatusPill
                      tone={issue.status === "failed" ? "warning" : "muted"}
                    >
                      {issue.status === "failed" ? "失败" : "取消"}
                    </StatusPill>
                    <StatusPill tone="muted">
                      {issue.source === "error_message" ? "错误" : "取消原因"}
                    </StatusPill>
                    <StatusPill tone="warning">{issue.count} 次</StatusPill>
                  </>
                }
                description={describeGroupReplyIssue(issue)}
                className="bg-white/90"
              />
            ))}
          </div>
        )}
      </AdminSubpanel>

      <AdminSubpanel title="近期恶化角色" contentClassName="mt-4">
        {!visibleActorDrift.length ? (
          <AdminEmptyState
            title={
              actorFilter === "all"
                ? "最近没有明显恶化角色"
                : "当前角色最近没有异常抬头"
            }
            description={
              actorFilter === "all"
                ? "这里对比最近 8 轮终态任务和历史基线，只展示近期失败率或取消率明显抬高的角色。"
                : "该角色最近 8 轮没有足够的终态样本，或者它的失败/取消率还没有明显高于历史基线。"
            }
          />
        ) : (
          <div className="space-y-3">
            {visibleActorDrift.map((actor) => (
              <AdminRecordCard
                key={`drift-${actor.actorCharacterId}`}
                title={actor.actorName}
                badges={
                  <>
                    <StatusPill
                      tone={toneForGroupReplyActorDriftSeverity(actor.severity)}
                    >
                      {formatGroupReplyActorDriftSeverity(actor.severity)}
                    </StatusPill>
                    <StatusPill tone="muted">
                      最近 {actor.recentTaskCount} 任务
                    </StatusPill>
                    <StatusPill tone="muted">
                      {actor.recentTurnCount} 轮
                    </StatusPill>
                    <StatusPill tone="warning">
                      异常率 {(actor.recentIssueRate * 100).toFixed(1)}%
                    </StatusPill>
                    <StatusPill
                      tone={actor.issueRateDelta > 0 ? "warning" : "muted"}
                    >
                      {formatRateDelta(actor.issueRateDelta)}
                    </StatusPill>
                  </>
                }
                description={describeGroupReplyActorDrift(actor)}
                details={
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone="healthy">
                        发送 {actor.recentSentCount}
                      </StatusPill>
                      <StatusPill tone="muted">
                        取消 {actor.recentCancelledCount}
                      </StatusPill>
                      <StatusPill tone="warning">
                        失败 {actor.recentFailedCount}
                      </StatusPill>
                      {actor.openTaskCount > 0 ? (
                        <StatusPill tone="muted">
                          未落定 {actor.openTaskCount}
                        </StatusPill>
                      ) : null}
                    </div>
                    <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                      基线来源：
                      {formatGroupReplyActorDriftBaselineSource(
                        actor.baselineSource,
                      )}
                      {" · "}
                      基线异常率 {(actor.baselineIssueRate * 100).toFixed(1)}%
                      {" · "}
                      失败率偏移 {formatRateDelta(actor.failureRateDelta)}
                      {" · "}
                      取消率偏移 {formatRateDelta(actor.cancelRateDelta)}
                    </div>
                    {actor.issueSummary.length ? (
                      <AdminNoteList
                        items={actor.issueSummary.map(
                          (issue) =>
                            `${issue.label} · ${issue.count} 次 · ${
                              issue.status === "failed" ? "失败" : "取消"
                            }`,
                        )}
                      />
                    ) : null}
                  </div>
                }
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        focusFilteredTasks(actor.actorCharacterId, "all")
                      }
                    >
                      查看该角色轮次
                    </Button>
                    {actor.recentFailedCount > 0 ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          focusFilteredTasks(actor.actorCharacterId, "failed")
                        }
                      >
                        筛到失败任务
                      </Button>
                    ) : null}
                    {actor.recentCancelledCount > 0 ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          focusFilteredTasks(
                            actor.actorCharacterId,
                            "cancelled",
                          )
                        }
                      >
                        筛到取消任务
                      </Button>
                    ) : null}
                  </>
                }
                className="bg-white/90"
              />
            ))}
          </div>
        )}
      </AdminSubpanel>

      <AdminSubpanel title="历史归档" contentClassName="mt-4">
        {!runtime.archiveSummary ? (
          <AdminEmptyState
            title="还没有归档统计"
            description="终态任务尚未进入清理窗口，或者这组数据还没有被归档。"
          />
        ) : (
          <div className="space-y-4">
            {actorFilter !== "all" ? (
              selectedArchiveActor ? (
                <InlineNotice tone="muted">
                  历史归档已按角色过滤：{selectedArchiveActor.actorName}。
                </InlineNotice>
              ) : (
                <AdminEmptyState
                  title="当前角色还没有归档数据"
                  description={`实时任务里能看到 ${selectedActorOption?.name ?? "该角色"}，但历史归档中暂时还没有它的终态统计。`}
                />
              )
            ) : null}

            {actorFilter !== "all" && !selectedArchiveActor ? null : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="已归档任务"
                    value={
                      selectedArchiveActor?.taskCount ??
                      runtime.archiveSummary.archivedTaskCount
                    }
                  />
                  <MetricCard
                    label="已归档轮次"
                    value={
                      selectedArchiveActor?.turnCount ??
                      runtime.archiveSummary.archivedTurnCount
                    }
                  />
                  <MetricCard
                    label="历史失败率"
                    value={`${(
                      (selectedArchiveActor?.failureRate ??
                        runtime.archiveSummary.failureRate) * 100
                    ).toFixed(1)}%`}
                  />
                  <MetricCard
                    label="历史取消率"
                    value={`${(
                      (selectedArchiveActor?.cancelRate ??
                        runtime.archiveSummary.cancelRate) * 100
                    ).toFixed(1)}%`}
                  />
                </div>

                <AdminRecordCard
                  title={
                    selectedArchiveActor
                      ? `归档状态分布 · ${selectedArchiveActor.actorName}`
                      : "归档状态分布"
                  }
                  badges={
                    <>
                      <StatusPill tone="healthy">
                        已发送 {archiveMetricStatusCounts?.sent ?? 0}
                      </StatusPill>
                      <StatusPill tone="muted">
                        已取消 {archiveMetricStatusCounts?.cancelled ?? 0}
                      </StatusPill>
                      <StatusPill tone="warning">
                        失败 {archiveMetricStatusCounts?.failed ?? 0}
                      </StatusPill>
                    </>
                  }
                  meta={`最近归档：${formatDateTime(runtime.archiveSummary.lastArchivedAt)} · 归档截止：${formatDateTime(runtime.archiveSummary.lastCutoff)}`}
                  description={
                    selectedArchiveActor
                      ? "这些统计只看当前角色已经归档的终态任务，用来判断它是否在长期上持续恶化。"
                      : "这些统计来自已经被清理出任务表的历史终态任务，用来保留长期运行趋势。"
                  }
                  className="bg-white/90"
                />

                <AdminSubpanel title="按天趋势">
                  <div className="mb-4 max-w-[220px]">
                    <SelectFieldBlock
                      label="时间范围"
                      value={archiveTrendWindow}
                      onChange={setArchiveTrendWindow}
                      options={[
                        { value: "7", label: "最近 7 天" },
                        { value: "14", label: "最近 14 天" },
                        { value: "30", label: "最近 30 天" },
                      ]}
                    />
                  </div>
                  {!visibleArchiveTrend.length ? (
                    <AdminEmptyState
                      title="当前时间范围没有归档趋势"
                      description="要么还没形成足够归档数据，要么所选窗口内暂无历史清理记录。"
                    />
                  ) : (
                    <div className="space-y-3">
                      {visibleArchiveTrend.map((point) => (
                        <AdminRecordCard
                          key={point.date}
                          title={formatArchiveTrendDate(point.date)}
                          badges={
                            <>
                              <StatusPill tone="muted">
                                {point.taskCount} 任务
                              </StatusPill>
                              <StatusPill tone="muted">
                                {point.turnCount} 轮
                              </StatusPill>
                              <StatusPill tone="warning">
                                失败率 {(point.failureRate * 100).toFixed(1)}%
                              </StatusPill>
                              <StatusPill tone="muted">
                                取消率 {(point.cancelRate * 100).toFixed(1)}%
                              </StatusPill>
                            </>
                          }
                          description={describeArchiveTrendPoint(point)}
                          className="bg-white/90"
                        />
                      ))}
                    </div>
                  )}
                </AdminSubpanel>

                <AdminSubpanel title="角色异常率">
                  {!visibleArchiveActors.length ? (
                    <AdminEmptyState
                      title="还没有角色归档画像"
                      description="当前归档数据还不足以形成角色级长期统计。"
                    />
                  ) : (
                    <div className="space-y-3">
                      {visibleArchiveActors.map((actor) => (
                        <AdminRecordCard
                          key={actor.actorCharacterId}
                          title={actor.actorName}
                          badges={
                            <>
                              <StatusPill tone="muted">
                                {actor.taskCount} 任务
                              </StatusPill>
                              <StatusPill tone="muted">
                                {actor.turnCount} 轮
                              </StatusPill>
                              <StatusPill tone="warning">
                                异常率 {(actor.issueRate * 100).toFixed(1)}%
                              </StatusPill>
                              <StatusPill tone="warning">
                                失败率 {(actor.failureRate * 100).toFixed(1)}%
                              </StatusPill>
                              <StatusPill tone="muted">
                                取消率 {(actor.cancelRate * 100).toFixed(1)}%
                              </StatusPill>
                            </>
                          }
                          description={describeArchiveActorSummary(actor)}
                          className="bg-white/90"
                        />
                      ))}
                    </div>
                  )}
                </AdminSubpanel>

                {!visibleArchiveIssueSummary.length ? (
                  <AdminEmptyState
                    title="归档里没有异常热点"
                    description={
                      selectedArchiveActor
                        ? "当前角色的已归档历史里，没有形成显著的失败或取消原因聚合。"
                        : "已归档的历史任务里，当前没有形成显著的失败/取消原因聚合。"
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleArchiveIssueSummary.map((issue) => (
                      <AdminRecordCard
                        key={`archived-${issue.key}`}
                        title={issue.label}
                        badges={
                          <>
                            <StatusPill
                              tone={
                                issue.status === "failed" ? "warning" : "muted"
                              }
                            >
                              {issue.status === "failed" ? "失败" : "取消"}
                            </StatusPill>
                            <StatusPill tone="muted">
                              {issue.source === "error_message"
                                ? "归档错误"
                                : "归档取消原因"}
                            </StatusPill>
                            <StatusPill tone="warning">
                              {issue.count} 次
                            </StatusPill>
                          </>
                        }
                        description={describeArchivedGroupReplyIssue(issue)}
                        className="bg-white/90"
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </AdminSubpanel>

      <div ref={taskSectionRef} className="mt-4 space-y-4">
        {hasActiveTaskFilter ? (
          <AdminRecordCard
            title="当前任务筛选"
            description="这里显示的是最近轮次里与当前筛选条件匹配的任务和对应轮次。"
            badges={
              <>
                <StatusPill tone="muted">{taskFilterSummary}</StatusPill>
                <StatusPill tone="warning">
                  {filteredTurns.length} 轮命中
                </StatusPill>
              </>
            }
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => focusFilteredTasks("all", "all")}
              >
                清空筛选
              </Button>
            }
            className="bg-white/90"
          />
        ) : null}

        {!filteredTurns.length ? (
          <AdminEmptyState
            title="当前筛选下没有匹配任务"
            description="可以放宽状态或角色筛选，或者先让群聊实际跑几轮。"
          />
        ) : (
          <div className="space-y-4">
            {filteredTurns.map((turn) => {
              const triggerMessage = visibleMessageMap.get(
                turn.triggerMessageId,
              );
              return (
                <AdminSubpanel
                  key={turn.turnId}
                  title={`轮次 ${turn.turnId.slice(0, 8)}`}
                  contentClassName="mt-4"
                >
                  <AdminRecordCard
                    title={
                      triggerMessage
                        ? `触发消息 · ${triggerMessage.senderName}`
                        : `触发消息 ${turn.triggerMessageId.slice(0, 8)}`
                    }
                    meta={`触发时间：${formatDateTime(turn.triggerMessageCreatedAt)} · 最近更新：${formatDateTime(turn.updatedAt)}`}
                    description={
                      triggerMessage?.text ||
                      "这条触发消息已不在当前可见窗口内。"
                    }
                    badges={
                      <>
                        <StatusPill tone="warning">
                          最多 {turn.maxSpeakers} 人
                        </StatusPill>
                        {turn.explicitInterest ? (
                          <StatusPill tone="healthy">有明确指向</StatusPill>
                        ) : (
                          <StatusPill tone="muted">无明确指向</StatusPill>
                        )}
                        {turn.hasMentionAll ? (
                          <StatusPill tone="warning">@所有人</StatusPill>
                        ) : null}
                      </>
                    }
                    details={
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <StatusPill
                            tone={toneForGroupReplyTaskStatus("pending")}
                          >
                            待执行 {turn.statusCounts.pending}
                          </StatusPill>
                          <StatusPill
                            tone={toneForGroupReplyTaskStatus("processing")}
                          >
                            处理中 {turn.statusCounts.processing}
                          </StatusPill>
                          <StatusPill
                            tone={toneForGroupReplyTaskStatus("sent")}
                          >
                            已发送 {turn.statusCounts.sent}
                          </StatusPill>
                          <StatusPill
                            tone={toneForGroupReplyTaskStatus("cancelled")}
                          >
                            已取消 {turn.statusCounts.cancelled}
                          </StatusPill>
                          <StatusPill
                            tone={toneForGroupReplyTaskStatus("failed")}
                          >
                            失败 {turn.statusCounts.failed}
                          </StatusPill>
                        </div>
                        {turn.mentionTargets.length ||
                        turn.replyTargetCharacterId ? (
                          <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                            {turn.mentionTargets.length
                              ? `提及：${turn.mentionTargets.join("、")}`
                              : "未显式提及角色"}
                            {turn.replyTargetCharacterId
                              ? ` · 回复目标：${turn.replyTargetCharacterId}`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    }
                    className="bg-white/90"
                    actions={
                      turn.tasks.some(
                        (task) =>
                          task.status === "failed" ||
                          task.status === "cancelled",
                      ) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => retryTurnMutation.mutate(turn.turnId)}
                          disabled={retryTurnMutation.isPending}
                        >
                          {retryTurnMutation.isPending &&
                          retryTurnMutation.variables === turn.turnId
                            ? "整轮重试中..."
                            : "重试本轮未完成任务"}
                        </Button>
                      ) : null
                    }
                  />

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <AdminSubpanel title="候选决策">
                      {!turn.candidates.length ? (
                        <AdminEmptyState
                          title="没有候选快照"
                          description="该轮次是在老数据写入前产生的，所以只保留了任务结果。"
                        />
                      ) : (
                        <div className="space-y-3">
                          {turn.candidates.map((candidate) => (
                            <AdminRecordCard
                              key={`${turn.turnId}-${candidate.characterId}`}
                              title={candidate.characterName}
                              meta={formatGroupReplyCandidateMeta(
                                candidate.recentSpeakerIndex,
                              )}
                              badges={
                                <>
                                  <StatusPill
                                    tone={toneForGroupReplyDisposition(
                                      candidate.selectionDisposition,
                                    )}
                                  >
                                    {formatGroupReplyDisposition(
                                      candidate.selectionDisposition,
                                    )}
                                  </StatusPill>
                                  <StatusPill tone="muted">
                                    分数 {candidate.score.toFixed(1)}
                                  </StatusPill>
                                  {candidate.isReplyTarget ? (
                                    <StatusPill tone="healthy">
                                      回复目标
                                    </StatusPill>
                                  ) : null}
                                  {candidate.isExplicitTarget ? (
                                    <StatusPill tone="warning">
                                      被提及
                                    </StatusPill>
                                  ) : null}
                                  <StatusPill
                                    tone={
                                      candidate.randomPassed
                                        ? "healthy"
                                        : "muted"
                                    }
                                  >
                                    {candidate.randomPassed
                                      ? "概率通过"
                                      : "概率未过"}
                                  </StatusPill>
                                </>
                              }
                              description={describeGroupReplyDisposition(
                                candidate.selectionDisposition,
                              )}
                              className="bg-white/90"
                            />
                          ))}
                        </div>
                      )}
                    </AdminSubpanel>

                    <AdminSubpanel title="任务执行">
                      <div className="space-y-3">
                        {turn.tasks.map((task) => (
                          <AdminRecordCard
                            key={task.id}
                            title={`${task.sequenceIndex + 1}. ${task.actorName}`}
                            meta={`计划执行：${formatDateTime(task.executeAfter)}`}
                            badges={
                              <>
                                <StatusPill
                                  tone={toneForGroupReplyTaskStatus(
                                    task.status,
                                  )}
                                >
                                  {formatGroupReplyTaskStatus(task.status)}
                                </StatusPill>
                                <StatusPill
                                  tone={toneForGroupReplyDisposition(
                                    task.selectionDisposition,
                                  )}
                                >
                                  {formatGroupReplyDisposition(
                                    task.selectionDisposition,
                                  )}
                                </StatusPill>
                              </>
                            }
                            description={describeGroupReplyTask(task)}
                            details={
                              <div className="space-y-2 text-xs leading-6 text-[color:var(--text-muted)]">
                                <div>分数：{task.score.toFixed(1)}</div>
                                <div>
                                  概率门：
                                  {task.randomPassed ? "通过" : "未通过"} ·
                                  被提及：
                                  {task.isExplicitTarget ? "是" : "否"} ·
                                  回复目标：
                                  {task.isReplyTarget ? "是" : "否"}
                                </div>
                                {task.errorMessage ? (
                                  <div>错误：{task.errorMessage}</div>
                                ) : null}
                                {task.cancelReason ? (
                                  <div>
                                    取消原因：
                                    {formatGroupReplyCancelReason(
                                      task.cancelReason,
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            }
                            actions={
                              task.status === "failed" ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => retryMutation.mutate(task.id)}
                                  disabled={retryMutation.isPending}
                                >
                                  {retryMutation.isPending &&
                                  retryMutation.variables === task.id
                                    ? "重试中..."
                                    : "重新入队"}
                                </Button>
                              ) : null
                            }
                            className="bg-white/90"
                          />
                        ))}
                      </div>
                    </AdminSubpanel>
                  </div>
                </AdminSubpanel>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function ActorSnapshotCard({
  actor,
  title,
}: {
  actor: ReplyLogicActorSnapshot;
  title: string;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <SectionHeading>{title}</SectionHeading>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <StateGateCard gate={actor.stateGate} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
            <MetricCard label="模型" value={actor.model} />
            <MetricCard
              label="API 可用"
              value={actor.apiAvailable ? "可用" : "不可用"}
            />
            <MetricCard label="历史窗口" value={actor.historyWindow} />
            <MetricCard label="可见消息数" value={actor.visibleHistoryCount} />
            <MetricCard
              label="最近聊天时间"
              value={formatDateTime(actor.lastChatAt)}
            />
            <MetricCard
              label="世界上下文"
              value={actor.worldContextText || "暂无快照"}
            />
          </div>
          <AdminSubpanel title="角色备注" contentClassName="mt-3">
            <AdminNoteList
              items={actor.notes.map((note) => formatReplyLogicText(note))}
            />
          </AdminSubpanel>
        </div>

        <div className="space-y-4">
          <AdminSubpanel title="提示词分段">
            <AdminPromptSectionList
              sections={actor.promptSections.map((section) => ({
                key: section.key,
                label: formatPromptSectionLabel(section),
                active: section.active,
                content: section.content,
              }))}
            />
          </AdminSubpanel>

          <AdminSubpanel title="最终生效提示词">
            <AdminCodeBlock value={actor.effectivePrompt} />
          </AdminSubpanel>

          <AdminSubpanel title="上下文窗口">
            <HistoryList items={actor.windowMessages} />
          </AdminSubpanel>

          <AdminSubpanel title="最终请求消息">
            <RequestMessageList items={actor.requestMessages} />
          </AdminSubpanel>
        </div>
      </div>
    </Card>
  );
}

function StateGateCard({ gate }: { gate: ReplyLogicStateGateSummary }) {
  return (
    <AdminSubpanel title="状态门" contentClassName="mt-3">
      <div className="flex justify-end">
        <StatusPill tone={toneForGate(gate.mode)}>
          {formatGateMode(gate.mode)}
        </StatusPill>
      </div>
      <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
        {formatStateGateReason(gate)}
      </div>
      {gate.activity || gate.delayMs ? (
        <div className="mt-3 space-y-2">
          {gate.activity ? (
            <AdminInfoRow
              label="活动"
              value={formatActivity(gate.activity)}
              className="bg-white/80 px-3 py-2.5"
            />
          ) : null}
          {gate.delayMs ? (
            <AdminInfoRow
              label="延迟"
              value={`${gate.delayMs.min}ms - ${gate.delayMs.max}ms`}
              className="bg-white/80 px-3 py-2.5"
            />
          ) : null}
        </div>
      ) : null}
      {gate.hintMessages.length ? (
        <AdminNoteList
          className="mt-3"
          itemClassName="text-xs leading-6 text-[color:var(--text-muted)]"
          items={gate.hintMessages}
        />
      ) : null}
    </AdminSubpanel>
  );
}

function HistoryList({
  items,
  className,
}: {
  items: ReplyLogicHistoryItem[];
  className?: string;
}) {
  if (!items.length) {
    return (
      <AdminEmptyState
        title="当前没有可见历史消息"
        description="这通常表示上下文窗口还没形成，或者当前会话暂时没有纳入可见历史。"
      />
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((item) => (
          <AdminRecordCard
            key={item.id}
            title={item.senderName}
            badges={
              <>
                <StatusPill tone={item.includedInWindow ? "healthy" : "muted"}>
                  {item.includedInWindow ? "进入窗口" : "仅可见"}
                </StatusPill>
                <StatusPill tone="muted">
                  {formatSenderType(item.senderType)}
                </StatusPill>
                <StatusPill tone="muted">
                  {formatMessageType(item.type)}
                </StatusPill>
                {item.attachmentKind ? (
                  <StatusPill tone="warning">
                    {formatAttachmentKind(item.attachmentKind)}
                  </StatusPill>
                ) : null}
              </>
            }
            meta={formatDateTime(item.createdAt)}
            description={item.text}
            details={
              item.note ? (
                <div className="text-xs text-[color:var(--text-muted)]">
                  {formatReplyLogicText(item.note)}
                </div>
              ) : undefined
            }
            className="bg-white/90"
          />
        ))}
      </div>
    </div>
  );
}

function RequestMessageList({
  items,
  className,
}: {
  items: ReplyLogicActorSnapshot["requestMessages"];
  className?: string;
}) {
  if (!items.length) {
    return (
      <AdminEmptyState
        title="当前没有模型请求消息"
        description="先执行一次候选消息预演，或等待真实运行后再回来查看请求消息。"
      />
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((item, index) => (
          <AdminRecordCard
            key={`${item.role}-${index}`}
            title={formatRequestRole(item.role)}
            badges={
              <StatusPill
                tone={
                  item.role === "system"
                    ? "warning"
                    : item.role === "assistant"
                      ? "healthy"
                      : "muted"
                }
              >
                {formatRequestRole(item.role)}
              </StatusPill>
            }
            details={<AdminCodeBlock value={item.content} />}
            className="bg-white/90"
          />
        ))}
      </div>
    </div>
  );
}

function NarrativeCard({
  arcs,
  narrativePresentation,
}: {
  arcs: ReplyLogicNarrativeArcSummary[];
  narrativePresentation:
    | ReplyLogicConstantSummary["narrativePresentationTemplates"]
    | null;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <SectionHeading>记忆与叙事</SectionHeading>
      {!arcs.length ? (
        <AdminEmptyState
          className="mt-4"
          title="当前没有叙事弧线记录"
          description="这说明该角色或会话还没有形成可观测的叙事推进，先查看运行历史或等待后续互动。"
        />
      ) : (
        <div className="mt-4 space-y-4">
          {arcs.map((arc) => (
            <AdminRecordCard
              key={arc.id}
              title={formatNarrativeTitle(arc.title, narrativePresentation)}
              badges={
                <>
                  <StatusPill
                    tone={arc.status === "completed" ? "healthy" : "warning"}
                  >
                    {formatNarrativeStatus(arc.status)}
                  </StatusPill>
                  <StatusPill tone="muted">{arc.progress}%</StatusPill>
                </>
              }
              meta={`创建：${formatDateTime(arc.createdAt)} · 完成：${formatDateTime(arc.completedAt)}`}
              details={
                <div className="flex flex-wrap gap-2">
                  {arc.milestones.map((item) => (
                    <StatusPill key={`${arc.id}-${item.label}`} tone="healthy">
                      {formatNarrativeMilestoneLabel(
                        item.label,
                        narrativePresentation,
                      )}
                    </StatusPill>
                  ))}
                </div>
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function RuntimeRulesEditorCard({
  draft,
  isDirty,
  isPending,
  error,
  isSuccess,
  onPatch,
  onReset,
  onSave,
}: {
  draft: ReplyLogicConstantSummary | null;
  isDirty: boolean;
  isPending: boolean;
  error: string | null;
  isSuccess: boolean;
  onPatch: (
    updater: (current: ReplyLogicConstantSummary) => ReplyLogicConstantSummary,
  ) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="运行规则配置"
        actions={
          <AdminDraftStatusPill ready={Boolean(draft)} dirty={isDirty} />
        }
      />

      {!draft ? (
        <LoadingBlock className="mt-4" label="正在加载运行规则..." />
      ) : (
        <>
          <InlineNotice className="mt-4" tone="muted">
            这里改的是回复与生活调度的全局运行规则。保存后，角色快照、会话快照和状态门控摘要会按新规则刷新。
          </InlineNotice>
          {error ? <ErrorBlock message={error} /> : null}
          {isSuccess ? (
            <AdminActionFeedback
              tone="success"
              title="运行规则已保存"
              description="相关快照正在按新规则刷新。"
            />
          ) : null}

          <div className="mt-4 space-y-6">
            <ConfigSection title="提示语与延迟">
              <TextAreaBlock
                label="睡眠提示语"
                value={listToLines(draft.sleepHintMessages)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    sleepHintMessages: linesToList(value),
                  }))
                }
              />
              <TextAreaBlock
                label="工作中提示语"
                value={listToLines(draft.busyHintMessages.working)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    busyHintMessages: {
                      ...current.busyHintMessages,
                      working: linesToList(value),
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="通勤中提示语"
                value={listToLines(draft.busyHintMessages.commuting)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    busyHintMessages: {
                      ...current.busyHintMessages,
                      commuting: linesToList(value),
                    },
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="睡眠延迟最小值"
                  value={draft.sleepDelayMs.min}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      sleepDelayMs: {
                        ...current.sleepDelayMs,
                        min: parseNonNegativeInteger(
                          value,
                          current.sleepDelayMs.min,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="睡眠延迟最大值"
                  value={draft.sleepDelayMs.max}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      sleepDelayMs: {
                        ...current.sleepDelayMs,
                        max: parseNonNegativeInteger(
                          value,
                          current.sleepDelayMs.max,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="忙碌延迟最小值"
                  value={draft.busyDelayMs.min}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      busyDelayMs: {
                        ...current.busyDelayMs,
                        min: parseNonNegativeInteger(
                          value,
                          current.busyDelayMs.min,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="忙碌延迟最大值"
                  value={draft.busyDelayMs.max}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      busyDelayMs: {
                        ...current.busyDelayMs,
                        max: parseNonNegativeInteger(
                          value,
                          current.busyDelayMs.max,
                        ),
                      },
                    }))
                  }
                />
              </div>
            </ConfigSection>

            <ConfigSection title="群聊与记忆">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                <FieldBlock
                  label="高频角色回复概率"
                  value={draft.groupReplyChance.high}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      groupReplyChance: {
                        ...current.groupReplyChance,
                        high: parseProbability(
                          value,
                          current.groupReplyChance.high,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="中频角色回复概率"
                  value={draft.groupReplyChance.normal}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      groupReplyChance: {
                        ...current.groupReplyChance,
                        normal: parseProbability(
                          value,
                          current.groupReplyChance.normal,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="低频角色回复概率"
                  value={draft.groupReplyChance.low}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      groupReplyChance: {
                        ...current.groupReplyChance,
                        low: parseProbability(
                          value,
                          current.groupReplyChance.low,
                        ),
                      },
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="群聊延迟最小值"
                  value={draft.groupReplyDelayMs.min}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      groupReplyDelayMs: {
                        ...current.groupReplyDelayMs,
                        min: parseNonNegativeInteger(
                          value,
                          current.groupReplyDelayMs.min,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="群聊延迟最大值"
                  value={draft.groupReplyDelayMs.max}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      groupReplyDelayMs: {
                        ...current.groupReplyDelayMs,
                        max: parseNonNegativeInteger(
                          value,
                          current.groupReplyDelayMs.max,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="记忆压缩间隔"
                  value={draft.memoryCompressionEveryMessages}
                  type="number"
                  min={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      memoryCompressionEveryMessages: parsePositiveInteger(
                        value,
                        current.memoryCompressionEveryMessages,
                      ),
                    }))
                  }
                />
              </div>
            </ConfigSection>

            <ConfigSection title="生活调度">
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="朋友圈生成概率"
                  value={draft.momentGenerateChance}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      momentGenerateChance: parseProbability(
                        value,
                        current.momentGenerateChance,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="视频号生成概率"
                  value={draft.channelGenerateChance}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      channelGenerateChance: parseProbability(
                        value,
                        current.channelGenerateChance,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="场景加好友概率"
                  value={draft.sceneFriendRequestChance}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      sceneFriendRequestChance: parseProbability(
                        value,
                        current.sceneFriendRequestChance,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="基础活动权重"
                  value={draft.activityBaseWeight}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      activityBaseWeight: parseProbability(
                        value,
                        current.activityBaseWeight,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="主动提醒小时"
                  value={draft.proactiveReminderHour}
                  type="number"
                  min={0}
                  max={23}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      proactiveReminderHour: clamp(
                        parseNonNegativeInteger(
                          value,
                          current.proactiveReminderHour,
                        ),
                        0,
                        23,
                      ),
                    }))
                  }
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="睡眠时段（0-23，逗号分隔）"
                  value={hourListToCsv(draft.activityScheduleHours.sleeping)}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      activityScheduleHours: {
                        ...current.activityScheduleHours,
                        sleeping: parseHourCsv(
                          value,
                          current.activityScheduleHours.sleeping,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="通勤时段（0-23，逗号分隔）"
                  value={hourListToCsv(draft.activityScheduleHours.commuting)}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      activityScheduleHours: {
                        ...current.activityScheduleHours,
                        commuting: parseHourCsv(
                          value,
                          current.activityScheduleHours.commuting,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="工作时段（0-23，逗号分隔）"
                  value={hourListToCsv(draft.activityScheduleHours.working)}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      activityScheduleHours: {
                        ...current.activityScheduleHours,
                        working: parseHourCsv(
                          value,
                          current.activityScheduleHours.working,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="吃饭时段（0-23，逗号分隔）"
                  value={hourListToCsv(draft.activityScheduleHours.eating)}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      activityScheduleHours: {
                        ...current.activityScheduleHours,
                        eating: parseHourCsv(
                          value,
                          current.activityScheduleHours.eating,
                        ),
                      },
                    }))
                  }
                />
              </div>
              <TextAreaBlock
                label="随机活动候选池（每行一个 activity）"
                value={listToLines(draft.activityRandomPool)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    activityRandomPool: linesToList(value),
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <SelectFieldBlock
                  label="默认角色在线状态"
                  value={
                    draft.defaultCharacterRules.isOnline ? "online" : "offline"
                  }
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      defaultCharacterRules: {
                        ...current.defaultCharacterRules,
                        isOnline: value === "online",
                      },
                    }))
                  }
                  options={[
                    { value: "online", label: "在线" },
                    { value: "offline", label: "离线" },
                  ]}
                />
                <SelectFieldBlock
                  label="默认角色活动"
                  value={draft.defaultCharacterRules.activity}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      defaultCharacterRules: {
                        ...current.defaultCharacterRules,
                        activity: value,
                      },
                    }))
                  }
                  options={ACTIVITY_OPTIONS.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                />
              </div>
              <TextAreaBlock
                label="场景加好友候选（每行一个）"
                value={listToLines(draft.sceneFriendRequestScenes)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    sceneFriendRequestScenes: linesToList(value),
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="AI 关系初始类型"
                  value={draft.relationshipInitialType}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      relationshipInitialType: value,
                    }))
                  }
                />
                <FieldBlock
                  label="AI 关系初始强度"
                  value={draft.relationshipInitialStrength}
                  type="number"
                  min={0}
                  max={100}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      relationshipInitialStrength: clamp(
                        parseNonNegativeInteger(
                          value,
                          current.relationshipInitialStrength,
                        ),
                        0,
                        100,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="AI 关系增长概率"
                  value={draft.relationshipUpdateChance}
                  type="number"
                  min={0}
                  max={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      relationshipUpdateChance: parseProbability(
                        value,
                        current.relationshipUpdateChance,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="AI 关系增长步长"
                  value={draft.relationshipUpdateStep}
                  type="number"
                  min={0}
                  max={100}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      relationshipUpdateStep: clamp(
                        parseNonNegativeInteger(
                          value,
                          current.relationshipUpdateStep,
                        ),
                        0,
                        100,
                      ),
                    }))
                  }
                />
                <FieldBlock
                  label="AI 关系强度上限"
                  value={draft.relationshipStrengthMax}
                  type="number"
                  min={1}
                  max={100}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      relationshipStrengthMax: clamp(
                        parsePositiveInteger(
                          value,
                          current.relationshipStrengthMax,
                        ),
                        1,
                        100,
                      ),
                    }))
                  }
                />
              </div>
              <TextAreaBlock
                label="AI 关系初始背景模板（{{leftName}} / {{rightName}}）"
                value={draft.relationshipInitialBackstory}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    relationshipInitialBackstory: value,
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="窗口与叙事">
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="历史窗口基础值"
                  value={draft.historyWindow.base}
                  type="number"
                  min={1}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      historyWindow: {
                        ...current.historyWindow,
                        base: parsePositiveInteger(
                          value,
                          current.historyWindow.base,
                        ),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="历史窗口浮动范围"
                  value={draft.historyWindow.range}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      historyWindow: {
                        ...current.historyWindow,
                        range: parseNonNegativeInteger(
                          value,
                          current.historyWindow.range,
                        ),
                      },
                    }))
                  }
                />
              </div>
              <TextAreaBlock
                label="叙事里程碑"
                value={narrativeMilestonesToLines(draft.narrativeMilestones)}
                placeholder="每行一个：threshold|label|progress"
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    narrativeMilestones: parseNarrativeMilestones(
                      value,
                      current.narrativeMilestones,
                    ),
                  }))
                }
              />
              <FieldBlock
                label="关系弧线标题后缀"
                value={
                  draft.narrativePresentationTemplates.relationshipArcSuffix
                }
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    narrativePresentationTemplates: {
                      ...current.narrativePresentationTemplates,
                      relationshipArcSuffix: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="里程碑显示标签（key=value）"
                value={recordToLines(
                  draft.narrativePresentationTemplates.milestoneLabels,
                )}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    narrativePresentationTemplates: {
                      ...current.narrativePresentationTemplates,
                      milestoneLabels: parseKeyValueLines(
                        value,
                        current.narrativePresentationTemplates.milestoneLabels,
                      ),
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="System Prompt 模板">
              <InlineNotice tone="muted">
                这里改的是结构化 system prompt
                的母版。支持的占位符会直接在标签里标出来，例如{" "}
                <code>{"{{name}}"}</code>、<code>{"{{relationship}}"}</code>、
                <code>{"{{currentTime}}"}</code>。
              </InlineNotice>
              <TextAreaBlock
                label="身份兜底模板（{{name}} / {{relationship}}）"
                value={draft.promptTemplates.identityFallback}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      identityFallback: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="链路推理提示"
                value={draft.promptTemplates.chainOfThoughtInstruction}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      chainOfThoughtInstruction: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="反思提示"
                value={draft.promptTemplates.reflectionInstruction}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      reflectionInstruction: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="协作路由提示"
                value={draft.promptTemplates.collaborationRouting}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      collaborationRouting: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="空记忆提示"
                value={draft.promptTemplates.emptyMemory}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      emptyMemory: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="行为指导提示"
                value={draft.promptTemplates.behavioralGuideline}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      behavioralGuideline: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="群聊提示"
                value={draft.promptTemplates.groupChatInstruction}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      groupChatInstruction: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="基础规则列表（{{name}} / {{relationship}} / {{currentTime}}）"
                value={listToLines(draft.promptTemplates.baseRules)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      baseRules: linesToList(value),
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="生成器 Prompt 模板">
              <InlineNotice tone="muted">
                这部分会直接影响朋友圈生成、人格提取、意图分类、记忆压缩等 AI
                子链路。
              </InlineNotice>
              <TextAreaBlock
                label="朋友圈生成模板（{{name}} / {{relationship}} / {{dayOfWeek}} / {{timeOfDay}} / {{clockTime}} / {{emotionalTone}} / {{topicsHint}}）"
                value={draft.promptTemplates.momentPrompt}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      momentPrompt: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="人格提取模板（{{personName}} / {{chatSample}}）"
                value={draft.promptTemplates.personalityExtractionPrompt}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      personalityExtractionPrompt: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="意图分类模板（{{userMessage}} / {{characterName}} / {{characterDomains}}）"
                value={draft.promptTemplates.intentClassificationPrompt}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      intentClassificationPrompt: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="记忆压缩模板（{{name}} / {{chatHistory}}）"
                value={draft.promptTemplates.memoryCompressionPrompt}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      memoryCompressionPrompt: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="拉群说明模板（{{triggerCharName}} / {{invitedCharNames}} / {{topic}}）"
                value={draft.promptTemplates.groupCoordinatorPrompt}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    promptTemplates: {
                      ...current.promptTemplates,
                      groupCoordinatorPrompt: value,
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="语义标签">
              <InlineNotice tone="muted">
                这里定义回复链路里会被拼进 Prompt 的专长、活动、星期和时段标签。
              </InlineNotice>
              <TextAreaBlock
                label="专长标签（key=value）"
                value={recordToLines(draft.semanticLabels.domainLabels)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    semanticLabels: {
                      ...current.semanticLabels,
                      domainLabels: parseKeyValueLines(
                        value,
                        current.semanticLabels.domainLabels,
                      ),
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="活动标签（key=value）"
                value={recordToLines(draft.semanticLabels.activityLabels)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    semanticLabels: {
                      ...current.semanticLabels,
                      activityLabels: parseKeyValueLines(
                        value,
                        current.semanticLabels.activityLabels,
                      ),
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="星期标签（每行一个，按周日到周六）"
                value={listToLines(draft.semanticLabels.weekdayLabels)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    semanticLabels: {
                      ...current.semanticLabels,
                      weekdayLabels: parseWeekdayLabels(
                        value,
                        current.semanticLabels.weekdayLabels,
                      ),
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="时段标签（key=value）"
                value={recordToLines(draft.semanticLabels.timeOfDayLabels)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    semanticLabels: {
                      ...current.semanticLabels,
                      timeOfDayLabels: parseKeyValueLines(
                        value,
                        current.semanticLabels.timeOfDayLabels,
                      ),
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="观测说明模板">
              <InlineNotice tone="muted">
                这部分主要影响后台快照里的状态门和链路备注文案；忙碌/睡眠状态支持{" "}
                <code>{"{{activity}}"}</code> 占位符。
              </InlineNotice>
              <TextAreaBlock
                label="睡眠状态门说明"
                value={draft.observabilityTemplates.stateGateSleeping}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      stateGateSleeping: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="忙碌状态门说明"
                value={draft.observabilityTemplates.stateGateBusy}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      stateGateBusy: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="立即回复说明"
                value={draft.observabilityTemplates.stateGateImmediate}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      stateGateImmediate: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="未应用状态门说明"
                value={draft.observabilityTemplates.stateGateNotApplied}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      stateGateNotApplied: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="可用 API Key 备注"
                value={draft.observabilityTemplates.actorNoteApiAvailable}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      actorNoteApiAvailable: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="无 API Key 备注"
                value={draft.observabilityTemplates.actorNoteApiUnavailable}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      actorNoteApiUnavailable: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="群聊上下文备注"
                value={draft.observabilityTemplates.actorNoteGroupContext}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      actorNoteGroupContext: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="单聊上下文备注"
                value={draft.observabilityTemplates.actorNoteDirectContext}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    observabilityTemplates: {
                      ...current.observabilityTemplates,
                      actorNoteDirectContext: value,
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="世界快照规则">
              <InlineNotice tone="muted">
                这里定义世界上下文的生成方式，以及注入到 system prompt
                时的拼接模板。
              </InlineNotice>
              <TextAreaBlock
                label="季节标签（key=value）"
                value={recordToLines(draft.worldContextRules.seasonLabels)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    worldContextRules: {
                      ...current.worldContextRules,
                      seasonLabels: parseKeyValueLines(
                        value,
                        current.worldContextRules.seasonLabels,
                      ),
                    },
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaBlock
                  label="春季天气候选"
                  value={listToLines(
                    draft.worldContextRules.weatherOptions.spring,
                  )}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      worldContextRules: {
                        ...current.worldContextRules,
                        weatherOptions: {
                          ...current.worldContextRules.weatherOptions,
                          spring: linesToList(value),
                        },
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label="夏季天气候选"
                  value={listToLines(
                    draft.worldContextRules.weatherOptions.summer,
                  )}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      worldContextRules: {
                        ...current.worldContextRules,
                        weatherOptions: {
                          ...current.worldContextRules.weatherOptions,
                          summer: linesToList(value),
                        },
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label="秋季天气候选"
                  value={listToLines(
                    draft.worldContextRules.weatherOptions.autumn,
                  )}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      worldContextRules: {
                        ...current.worldContextRules,
                        weatherOptions: {
                          ...current.worldContextRules.weatherOptions,
                          autumn: linesToList(value),
                        },
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label="冬季天气候选"
                  value={listToLines(
                    draft.worldContextRules.weatherOptions.winter,
                  )}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      worldContextRules: {
                        ...current.worldContextRules,
                        weatherOptions: {
                          ...current.worldContextRules.weatherOptions,
                          winter: linesToList(value),
                        },
                      },
                    }))
                  }
                />
              </div>
              <TextAreaBlock
                label="节日规则（month|day|label）"
                value={holidayRulesToLines(draft.worldContextRules.holidays)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    worldContextRules: {
                      ...current.worldContextRules,
                      holidays: parseHolidayRules(
                        value,
                        current.worldContextRules.holidays,
                      ),
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="本地时间模板（{{timeOfDay}} / {{hour}} / {{minute}}）"
                value={draft.worldContextRules.localTimeTemplate}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    worldContextRules: {
                      ...current.worldContextRules,
                      localTimeTemplate: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="上下文字段模板（key=value）"
                value={recordToLines(
                  draft.worldContextRules.contextFieldTemplates,
                )}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    worldContextRules: {
                      ...current.worldContextRules,
                      contextFieldTemplates: parseKeyValueLines(
                        value,
                        current.worldContextRules.contextFieldTemplates,
                      ),
                    },
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="上下文分隔符"
                  value={draft.worldContextRules.contextSeparator}
                  onChange={(value) =>
                    onPatch((current) => ({
                      ...current,
                      worldContextRules: {
                        ...current.worldContextRules,
                        contextSeparator: value,
                      },
                    }))
                  }
                />
              </div>
              <TextAreaBlock
                label="Prompt 注入模板（{{context}}）"
                value={draft.worldContextRules.promptContextTemplate}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    worldContextRules: {
                      ...current.worldContextRules,
                      promptContextTemplate: value,
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="链路解释模板">
              <InlineNotice tone="muted">
                这部分主要影响后台里“角色视图备注 / 会话分支摘要 /
                候选消息预演说明 / 历史窗口注释”这些解释文字。
              </InlineNotice>
              <TextAreaBlock
                label="角色视图总说明"
                value={draft.inspectorTemplates.characterViewIntro}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      characterViewIntro: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="角色视图-已找到单聊"
                value={draft.inspectorTemplates.characterViewHistoryFound}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      characterViewHistoryFound: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="角色视图-未找到单聊"
                value={draft.inspectorTemplates.characterViewHistoryMissing}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      characterViewHistoryMissing: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="历史窗口内注释"
                value={draft.inspectorTemplates.historyIncludedNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      historyIncludedNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="历史窗口外注释"
                value={draft.inspectorTemplates.historyExcludedNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      historyExcludedNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Stored Group 标题"
                value={draft.inspectorTemplates.storedGroupTitle}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      storedGroupTitle: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Stored Group-升级说明"
                value={draft.inspectorTemplates.storedGroupUpgradedNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      storedGroupUpgradedNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Stored Group-下一步说明"
                value={draft.inspectorTemplates.storedGroupNextReplyNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      storedGroupNextReplyNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Direct Branch 标题"
                value={draft.inspectorTemplates.directBranchTitle}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      directBranchTitle: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Direct Branch-下一步说明"
                value={draft.inspectorTemplates.directBranchNextReplyNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      directBranchNextReplyNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Formal Group 标题"
                value={draft.inspectorTemplates.formalGroupTitle}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      formalGroupTitle: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Formal Group-状态门说明"
                value={draft.inspectorTemplates.formalGroupStateGateNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      formalGroupStateGateNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="Formal Group-回复规则说明"
                value={draft.inspectorTemplates.formalGroupReplyRuleNote}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      formalGroupReplyRuleNote: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-角色说明"
                value={draft.inspectorTemplates.previewCharacterIntro}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewCharacterIntro: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-角色有历史"
                value={draft.inspectorTemplates.previewCharacterWithHistory}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewCharacterWithHistory: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-角色无历史"
                value={draft.inspectorTemplates.previewCharacterWithoutHistory}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewCharacterWithoutHistory: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-Stored Group"
                value={draft.inspectorTemplates.previewStoredGroup}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewStoredGroup: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-Direct Conversation"
                value={draft.inspectorTemplates.previewDirectConversation}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewDirectConversation: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-Formal Group"
                value={draft.inspectorTemplates.previewFormalGroup}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewFormalGroup: value,
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="预演-默认用户消息"
                value={draft.inspectorTemplates.previewDefaultUserMessage}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    inspectorTemplates: {
                      ...current.inspectorTemplates,
                      previewDefaultUserMessage: value,
                    },
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="Provider 备注模板">
              <InlineNotice tone="muted">
                这里改的是回复逻辑总览里 Provider
                差异备注，不影响真实推理请求，只影响后台解释文本。
              </InlineNotice>
              <TextAreaBlock
                label="Provider 备注（key=value）"
                value={recordToLines(draft.providerTemplates)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    providerTemplates: parseKeyValueLines(
                      value,
                      current.providerTemplates,
                    ),
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="角色运行备注模板">
              <InlineNotice tone="muted">
                这部分会出现在角色运行逻辑台的生活逻辑观测里，用来解释为什么某些调度会跳过角色。
              </InlineNotice>
              <TextAreaBlock
                label="角色运行备注（key=value）"
                value={recordToLines(draft.runtimeNoteTemplates)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    runtimeNoteTemplates: parseKeyValueLines(
                      value,
                      current.runtimeNoteTemplates,
                    ),
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="调度器任务说明">
              <InlineNotice tone="muted">
                这里改的是 Scheduler 任务列表里的描述文字，不改 cron
                表达式和实际触发频率。
              </InlineNotice>
              <TextAreaBlock
                label="任务名称（key=value）"
                value={recordToLines(draft.schedulerNames)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    schedulerNames: parseKeyValueLines(
                      value,
                      current.schedulerNames,
                    ),
                  }))
                }
              />
              <TextAreaBlock
                label="任务说明（key=value）"
                value={recordToLines(draft.schedulerDescriptions)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    schedulerDescriptions: parseKeyValueLines(
                      value,
                      current.schedulerDescriptions,
                    ),
                  }))
                }
              />
              <TextAreaBlock
                label="下一次执行提示（key=value）"
                value={recordToLines(draft.schedulerNextRunHints)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    schedulerNextRunHints: parseKeyValueLines(
                      value,
                      current.schedulerNextRunHints,
                    ),
                  }))
                }
              />
            </ConfigSection>

            <ConfigSection title="调度事件与摘要模板">
              <InlineNotice tone="muted">
                这里改的是调度执行结果、生活事件和主动提醒子链路里的文本模板。支持{" "}
                <code>{"{{count}}"}</code>、<code>{"{{characterCount}}"}</code>
                、<code>{"{{scene}}"}</code>、<code>{"{{postId}}"}</code>、
                <code>{"{{activity}}"}</code>、<code>{"{{otherName}}"}</code>{" "}
                等占位符。
              </InlineNotice>
              <TextAreaBlock
                label="调度事件与摘要（key=value）"
                value={schedulerTextTemplatesToLines(
                  draft.schedulerTextTemplates,
                )}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    schedulerTextTemplates: parseSchedulerTextTemplateLines(
                      value,
                      current.schedulerTextTemplates,
                    ),
                  }))
                }
              />
              <TextAreaBlock
                label="主动提醒检查 Prompt（{{characterName}} / {{memoryText}} / {{today}}）"
                value={
                  draft.schedulerTextTemplates.proactiveReminderCheckPrompt
                }
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    schedulerTextTemplates: {
                      ...current.schedulerTextTemplates,
                      proactiveReminderCheckPrompt: value,
                    },
                  }))
                }
              />
            </ConfigSection>

            <div className="flex flex-wrap gap-3 border-t border-[color:var(--border-faint)] pt-5">
              <Button variant="secondary" onClick={onReset}>
                重置运行规则
              </Button>
              <Button
                variant="primary"
                onClick={onSave}
                disabled={!isDirty || isPending}
              >
                {isPending ? "保存中..." : "保存运行规则"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function createEditableCharacter(source: Character): EditableCharacter {
  const expertDomains = source.expertDomains?.length
    ? [...source.expertDomains]
    : source.profile?.expertDomains?.length
      ? [...source.profile.expertDomains]
      : ["general"];

  return {
    ...source,
    avatar: source.avatar ?? "",
    bio: source.bio ?? "",
    onlineMode: source.onlineMode ?? "auto",
    expertDomains,
    triggerScenes: source.triggerScenes?.filter(Boolean) ?? [],
    currentActivity: source.currentActivity ?? "free",
    activityMode: source.activityMode ?? "auto",
    profile: {
      characterId: source.id,
      name: source.name ?? "",
      relationship: source.relationship ?? "",
      expertDomains,
      coreLogic: source.profile?.coreLogic ?? "",
      scenePrompts: {
        chat: source.profile?.scenePrompts?.chat ?? "",
        moments_post: source.profile?.scenePrompts?.moments_post ?? "",
        moments_comment: source.profile?.scenePrompts?.moments_comment ?? "",
        feed_post: source.profile?.scenePrompts?.feed_post ?? "",
        channel_post: source.profile?.scenePrompts?.channel_post ?? "",
        feed_comment: source.profile?.scenePrompts?.feed_comment ?? "",
        greeting: source.profile?.scenePrompts?.greeting ?? "",
        proactive: source.profile?.scenePrompts?.proactive ?? "",
      },
      memorySummary: source.profile?.memorySummary ?? "",
      traits: {
        speechPatterns: source.profile?.traits?.speechPatterns ?? [],
        catchphrases: source.profile?.traits?.catchphrases ?? [],
        topicsOfInterest: source.profile?.traits?.topicsOfInterest ?? [],
        emotionalTone: source.profile?.traits?.emotionalTone ?? "grounded",
        responseLength: source.profile?.traits?.responseLength ?? "medium",
        emojiUsage: source.profile?.traits?.emojiUsage ?? "occasional",
      },
      memory: {
        coreMemory: source.profile?.memory?.coreMemory ?? "",
        recentSummary: source.profile?.memory?.recentSummary ?? "",
        forgettingCurve: source.profile?.memory?.forgettingCurve ?? 70,
        recentSummaryPrompt: source.profile?.memory?.recentSummaryPrompt,
        coreMemoryPrompt: source.profile?.memory?.coreMemoryPrompt,
      },
    },
  };
}

function normalizeCharacterForSave(
  draft: EditableCharacter,
): EditableCharacter {
  const normalized = createEditableCharacter(draft);
  const expertDomains = normalized.expertDomains
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    ...normalized,
    name: normalized.name.trim(),
    avatar: normalized.avatar.trim(),
    relationship: normalized.relationship.trim(),
    bio: normalized.bio.trim(),
    onlineMode: normalized.onlineMode === "manual" ? "manual" : "auto",
    expertDomains: expertDomains.length ? expertDomains : ["general"],
    triggerScenes:
      normalized.triggerScenes?.map((item) => item.trim()).filter(Boolean) ??
      [],
    activeHoursStart: normalizeOptionalHour(normalized.activeHoursStart),
    activeHoursEnd: normalizeOptionalHour(normalized.activeHoursEnd),
    currentActivity: normalized.currentActivity?.trim()
      ? normalized.currentActivity
      : null,
    activityMode: normalized.activityMode === "manual" ? "manual" : "auto",
    profile: {
      ...normalized.profile,
      characterId: normalized.id,
      name: normalized.name.trim(),
      relationship: normalized.relationship.trim(),
      expertDomains: expertDomains.length ? expertDomains : ["general"],
      coreLogic: normalized.profile.coreLogic?.trim() ?? "",
      scenePrompts: {
        chat: normalized.profile.scenePrompts?.chat?.trim() ?? "",
        moments_post:
          normalized.profile.scenePrompts?.moments_post?.trim() ?? "",
        moments_comment:
          normalized.profile.scenePrompts?.moments_comment?.trim() ?? "",
        feed_post: normalized.profile.scenePrompts?.feed_post?.trim() ?? "",
        channel_post:
          normalized.profile.scenePrompts?.channel_post?.trim() ?? "",
        feed_comment:
          normalized.profile.scenePrompts?.feed_comment?.trim() ?? "",
        greeting: normalized.profile.scenePrompts?.greeting?.trim() ?? "",
        proactive: normalized.profile.scenePrompts?.proactive?.trim() ?? "",
      },
      memorySummary: normalized.profile.memorySummary?.trim() ?? "",
      traits: {
        ...normalized.profile.traits,
        speechPatterns: normalized.profile.traits.speechPatterns
          .map((item) => item.trim())
          .filter(Boolean),
        catchphrases: normalized.profile.traits.catchphrases
          .map((item) => item.trim())
          .filter(Boolean),
        topicsOfInterest: normalized.profile.traits.topicsOfInterest
          .map((item) => item.trim())
          .filter(Boolean),
        emotionalTone:
          normalized.profile.traits.emotionalTone.trim() || "grounded",
      },
      memory: {
        coreMemory: normalized.profile.memory.coreMemory.trim(),
        recentSummary: normalized.profile.memory.recentSummary.trim(),
        forgettingCurve: clamp(
          normalized.profile.memory.forgettingCurve,
          0,
          100,
        ),
        recentSummaryPrompt:
          normalized.profile.memory.recentSummaryPrompt?.trim(),
        coreMemoryPrompt: normalized.profile.memory.coreMemoryPrompt?.trim(),
      },
    },
  };
}

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(items?: string[] | null) {
  return items?.join(", ") ?? "";
}

function hourListToCsv(items?: number[] | null) {
  return items?.join(", ") ?? "";
}

function parseHourCsv(value: string, fallback: number[]) {
  const next = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => !Number.isNaN(item))
    .map((item) => clamp(Math.round(item), 0, 23))
    .filter((item, index, list) => list.indexOf(item) === index)
    .sort((left, right) => left - right);

  return next.length ? next : fallback;
}

function parseOptionalHour(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return clamp(Math.round(parsed), 0, 23);
}

function normalizeOptionalHour(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return clamp(Math.round(value), 0, 23);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toneForGate(mode: ReplyLogicStateGateSummary["mode"]) {
  if (mode === "immediate") {
    return "healthy";
  }

  if (mode === "not_applied") {
    return "muted";
  }

  return "warning";
}

function formatGateMode(mode: ReplyLogicStateGateSummary["mode"]) {
  if (mode === "immediate") {
    return "立即回复";
  }

  if (mode === "not_applied") {
    return "未应用";
  }

  return "延迟回复";
}

function formatStateGateReason(gate: ReplyLogicStateGateSummary) {
  return gate.reason;
}

function formatNarrativeStatus(status: string) {
  if (status === "completed") {
    return "已完成";
  }

  if (status === "active") {
    return "进行中";
  }

  return status;
}

function formatProviderModelSource(source: string) {
  switch (source) {
    case "system_config_ai_model":
      return "系统配置 ai_model";
    case "env_ai_model":
      return "环境变量 AI_MODEL";
    case "deepseek_default":
      return "DeepSeek 默认模型";
    default:
      return source;
  }
}

function formatProviderEndpointSource(source: string) {
  switch (source) {
    case "owner_custom_base":
      return "世界主人自定义地址";
    case "env_default":
      return "环境变量 OPENAI_BASE_URL";
    case "deepseek_default":
      return "DeepSeek 默认地址";
    default:
      return source;
  }
}

function formatProviderApiKeySource(source: string) {
  switch (source) {
    case "owner_custom":
      return "世界主人自定义密钥";
    case "env_default":
      return "环境变量默认密钥";
    case "missing":
      return "未配置";
    default:
      return source;
  }
}

function formatRequestRole(role: "system" | "user" | "assistant") {
  switch (role) {
    case "system":
      return "System";
    case "assistant":
      return "Assistant";
    case "user":
      return "User";
    default:
      return role;
  }
}

function formatRuntimeConstants(constants: ReplyLogicOverview["constants"]) {
  return {
    睡眠提示语: [...constants.sleepHintMessages],
    忙碌提示语: {
      工作中: [...constants.busyHintMessages.working],
      通勤中: [...constants.busyHintMessages.commuting],
    },
    睡眠延迟毫秒: {
      最小值: constants.sleepDelayMs.min,
      最大值: constants.sleepDelayMs.max,
    },
    忙碌延迟毫秒: {
      最小值: constants.busyDelayMs.min,
      最大值: constants.busyDelayMs.max,
    },
    群聊回复概率: {
      高频角色: constants.groupReplyChance.high,
      中频角色: constants.groupReplyChance.normal,
      低频角色: constants.groupReplyChance.low,
    },
    群聊回复延迟毫秒: {
      最小值: constants.groupReplyDelayMs.min,
      最大值: constants.groupReplyDelayMs.max,
    },
    记忆压缩间隔消息数: constants.memoryCompressionEveryMessages,
    生活调度: {
      朋友圈生成概率: constants.momentGenerateChance,
      视频号生成概率: constants.channelGenerateChance,
      场景加好友概率: constants.sceneFriendRequestChance,
      基础活动时段: {
        sleeping: [...constants.activityScheduleHours.sleeping],
        commuting: [...constants.activityScheduleHours.commuting],
        working: [...constants.activityScheduleHours.working],
        eating: [...constants.activityScheduleHours.eating],
      },
      随机活动候选池: [...constants.activityRandomPool],
      默认角色规则: {
        在线状态: constants.defaultCharacterRules.isOnline ? "在线" : "离线",
        活动: constants.defaultCharacterRules.activity,
      },
      场景加好友候选: [...constants.sceneFriendRequestScenes],
      AI关系初始类型: constants.relationshipInitialType,
      AI关系初始强度: constants.relationshipInitialStrength,
      AI关系增长概率: constants.relationshipUpdateChance,
      AI关系增长步长: constants.relationshipUpdateStep,
      AI关系强度上限: constants.relationshipStrengthMax,
      基础活动权重: constants.activityBaseWeight,
      主动提醒小时: constants.proactiveReminderHour,
      AI关系初始背景模板: constants.relationshipInitialBackstory,
    },
    历史窗口: {
      基础值: constants.historyWindow.base,
      浮动范围: constants.historyWindow.range,
      最小值: constants.historyWindow.min,
      最大值: constants.historyWindow.max,
    },
    叙事里程碑: constants.narrativeMilestones.map((item) => ({
      阈值: item.threshold,
      标签: formatNarrativeMilestoneLabel(
        item.label,
        constants.narrativePresentationTemplates,
      ),
      进度: item.progress,
    })),
    叙事展示模板: {
      关系弧线标题后缀:
        constants.narrativePresentationTemplates.relationshipArcSuffix,
      里程碑显示标签: {
        ...constants.narrativePresentationTemplates.milestoneLabels,
      },
    },
    Prompt模板: {
      身份兜底: constants.promptTemplates.identityFallback,
      链路推理提示: constants.promptTemplates.chainOfThoughtInstruction,
      反思提示: constants.promptTemplates.reflectionInstruction,
      协作路由提示: constants.promptTemplates.collaborationRouting,
      空记忆提示: constants.promptTemplates.emptyMemory,
      行为指导提示: constants.promptTemplates.behavioralGuideline,
      群聊提示: constants.promptTemplates.groupChatInstruction,
      基础规则: [...constants.promptTemplates.baseRules],
      朋友圈生成模板: constants.promptTemplates.momentPrompt,
      人格提取模板: constants.promptTemplates.personalityExtractionPrompt,
      意图分类模板: constants.promptTemplates.intentClassificationPrompt,
      记忆压缩模板: constants.promptTemplates.memoryCompressionPrompt,
      拉群说明模板: constants.promptTemplates.groupCoordinatorPrompt,
    },
    语义标签: {
      专长标签: { ...constants.semanticLabels.domainLabels },
      活动标签: { ...constants.semanticLabels.activityLabels },
      星期标签: [...constants.semanticLabels.weekdayLabels],
      时段标签: { ...constants.semanticLabels.timeOfDayLabels },
    },
    观测说明模板: {
      睡眠状态门: constants.observabilityTemplates.stateGateSleeping,
      忙碌状态门: constants.observabilityTemplates.stateGateBusy,
      立即回复: constants.observabilityTemplates.stateGateImmediate,
      未应用状态门: constants.observabilityTemplates.stateGateNotApplied,
      可用APIKey备注: constants.observabilityTemplates.actorNoteApiAvailable,
      无APIKey备注: constants.observabilityTemplates.actorNoteApiUnavailable,
      群聊上下文备注: constants.observabilityTemplates.actorNoteGroupContext,
      单聊上下文备注: constants.observabilityTemplates.actorNoteDirectContext,
    },
    世界快照规则: {
      季节标签: { ...constants.worldContextRules.seasonLabels },
      天气候选: {
        春季: [...constants.worldContextRules.weatherOptions.spring],
        夏季: [...constants.worldContextRules.weatherOptions.summer],
        秋季: [...constants.worldContextRules.weatherOptions.autumn],
        冬季: [...constants.worldContextRules.weatherOptions.winter],
      },
      节日规则: constants.worldContextRules.holidays.map((item) => ({
        月份: item.month,
        日期: item.day,
        标签: item.label,
      })),
      本地时间模板: constants.worldContextRules.localTimeTemplate,
      上下文字段模板: { ...constants.worldContextRules.contextFieldTemplates },
      上下文分隔符: constants.worldContextRules.contextSeparator,
      Prompt注入模板: constants.worldContextRules.promptContextTemplate,
    },
    链路解释模板: {
      角色视图总说明: constants.inspectorTemplates.characterViewIntro,
      角色视图已找到单聊:
        constants.inspectorTemplates.characterViewHistoryFound,
      角色视图未找到单聊:
        constants.inspectorTemplates.characterViewHistoryMissing,
      历史窗口内注释: constants.inspectorTemplates.historyIncludedNote,
      历史窗口外注释: constants.inspectorTemplates.historyExcludedNote,
      StoredGroup标题: constants.inspectorTemplates.storedGroupTitle,
      StoredGroup升级说明: constants.inspectorTemplates.storedGroupUpgradedNote,
      StoredGroup下一步说明:
        constants.inspectorTemplates.storedGroupNextReplyNote,
      DirectBranch标题: constants.inspectorTemplates.directBranchTitle,
      DirectBranch下一步说明:
        constants.inspectorTemplates.directBranchNextReplyNote,
      FormalGroup标题: constants.inspectorTemplates.formalGroupTitle,
      FormalGroup状态门说明:
        constants.inspectorTemplates.formalGroupStateGateNote,
      FormalGroup回复规则说明:
        constants.inspectorTemplates.formalGroupReplyRuleNote,
      预演角色说明: constants.inspectorTemplates.previewCharacterIntro,
      预演角色有历史: constants.inspectorTemplates.previewCharacterWithHistory,
      预演角色无历史:
        constants.inspectorTemplates.previewCharacterWithoutHistory,
      预演StoredGroup: constants.inspectorTemplates.previewStoredGroup,
      预演DirectConversation:
        constants.inspectorTemplates.previewDirectConversation,
      预演FormalGroup: constants.inspectorTemplates.previewFormalGroup,
      预演默认用户消息: constants.inspectorTemplates.previewDefaultUserMessage,
    },
    Provider备注模板: { ...constants.providerTemplates },
    角色运行备注模板: { ...constants.runtimeNoteTemplates },
    调度器任务配置: {
      任务名称: { ...constants.schedulerNames },
      任务说明: { ...constants.schedulerDescriptions },
      下一次执行提示: { ...constants.schedulerNextRunHints },
    },
    调度器文本模板: {
      ...schedulerTextTemplatesSummary(constants.schedulerTextTemplates),
    },
  } as Record<string, unknown>;
}

function listToLines(items?: string[] | null) {
  return items?.join("\n") ?? "";
}

function linesToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function recordToLines<T extends object>(record: T) {
  return Object.entries(record as Record<string, string>)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function parseKeyValueLines<T extends object>(value: string, fallback: T): T {
  const entries = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim();
      const content = line.slice(separatorIndex + 1).trim();
      if (!key || !content) {
        return null;
      }

      return [key, content] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  const next = { ...(fallback as Record<string, string>) };
  for (const [key, content] of entries) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      next[key] = content;
    }
  }

  return next as T;
}

function schedulerTextTemplatesSummary(
  value: ReplyLogicConstantSummary["schedulerTextTemplates"],
) {
  const { proactiveReminderCheckPrompt, ...rest } = value;
  return {
    ...rest,
    proactiveReminderCheckPrompt,
  };
}

function schedulerTextTemplatesToLines(
  value: ReplyLogicConstantSummary["schedulerTextTemplates"],
) {
  const { ...rest } = value;
  return recordToLines(rest);
}

function parseSchedulerTextTemplateLines(
  value: string,
  fallback: ReplyLogicConstantSummary["schedulerTextTemplates"],
) {
  const { proactiveReminderCheckPrompt, ...rest } = fallback;
  return {
    ...parseKeyValueLines(value, rest),
    proactiveReminderCheckPrompt,
  };
}

function parseWeekdayLabels(value: string, fallback: string[]) {
  const parsed = linesToList(value);
  return fallback.map((item, index) => parsed[index] ?? item);
}

function holidayRulesToLines(
  holidays: ReplyLogicConstantSummary["worldContextRules"]["holidays"],
) {
  return holidays
    .map((item) => `${item.month}|${item.day}|${item.label}`)
    .join("\n");
}

function parseHolidayRules(
  value: string,
  fallback: ReplyLogicConstantSummary["worldContextRules"]["holidays"],
) {
  const next = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [monthText, dayText, labelText] = line
        .split("|")
        .map((item) => item.trim());
      const month = Number(monthText);
      const day = Number(dayText);
      if (!labelText || Number.isNaN(month) || Number.isNaN(day)) {
        return null;
      }

      return {
        month: Math.min(Math.max(Math.round(month), 1), 12),
        day: Math.min(Math.max(Math.round(day), 1), 31),
        label: labelText,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return next.length ? next : fallback;
}

function parseNonNegativeInteger(value: string, fallback: number) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsed));
}

function parsePositiveInteger(value: string, fallback: number) {
  return Math.max(1, parseNonNegativeInteger(value, fallback));
}

function parseProbability(value: string, fallback: number) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 0), 1);
}

function narrativeMilestonesToLines(
  milestones: ReplyLogicConstantSummary["narrativeMilestones"],
) {
  return milestones
    .map((item) => `${item.threshold}|${item.label}|${item.progress}`)
    .join("\n");
}

function parseNarrativeMilestones(
  value: string,
  fallback: ReplyLogicConstantSummary["narrativeMilestones"],
) {
  const next = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [thresholdText, labelText, progressText] = line
        .split("|")
        .map((item) => item.trim());
      const threshold = Number(thresholdText);
      const progress = Number(progressText);
      if (!labelText || Number.isNaN(threshold) || Number.isNaN(progress)) {
        return null;
      }

      return {
        threshold: Math.max(1, Math.round(threshold)),
        label: labelText,
        progress: Math.min(Math.max(Math.round(progress), 0), 100),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return next.length ? next : fallback;
}

function formatConversationType(type: string) {
  if (type === "group") {
    return "群聊";
  }

  return "单聊";
}

function formatConversationSource(
  source: ReplyLogicOverview["conversations"][number]["source"],
) {
  if (source === "group") {
    return "群聊";
  }

  return "单聊";
}

function formatGroupReplyTaskStatus(status: ReplyLogicGroupReplyTaskStatus) {
  switch (status) {
    case "pending":
      return "待执行";
    case "processing":
      return "处理中";
    case "sent":
      return "已发送";
    case "cancelled":
      return "已取消";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

function toneForGroupReplyTaskStatus(status: ReplyLogicGroupReplyTaskStatus) {
  switch (status) {
    case "pending":
      return "warning" as const;
    case "processing":
      return "warning" as const;
    case "sent":
      return "healthy" as const;
    case "cancelled":
      return "muted" as const;
    case "failed":
      return "warning" as const;
    default:
      return "muted" as const;
  }
}

function formatGroupReplyDisposition(
  disposition: ReplyLogicGroupReplySelectionDisposition,
) {
  switch (disposition) {
    case "selected_targeted":
      return "选中：明确指向";
    case "selected_fallback":
      return "选中：兜底最高分";
    case "selected_followup":
      return "选中：补充回复";
    case "skipped_not_targeted":
      return "跳过：未命中";
    case "skipped_random_gate":
      return "跳过：概率未过";
    case "skipped_without_explicit_interest":
      return "跳过：无扩散资格";
    case "skipped_max_speakers":
      return "跳过：人数已满";
    default:
      return disposition;
  }
}

function toneForGroupReplyDisposition(
  disposition: ReplyLogicGroupReplySelectionDisposition,
) {
  if (disposition.startsWith("selected_")) {
    return "healthy" as const;
  }
  if (disposition === "skipped_max_speakers") {
    return "warning" as const;
  }
  return "muted" as const;
}

function describeGroupReplyDisposition(
  disposition: ReplyLogicGroupReplySelectionDisposition,
) {
  switch (disposition) {
    case "selected_targeted":
      return "被回复目标或显式提及时，planner 会优先把他放进本轮发言名单。";
    case "selected_fallback":
      return "这轮没有明显命中对象时，planner 会让分数最高的角色兜底接话。";
    case "selected_followup":
      return "主答之外的补充位，需要同时满足扩散条件和概率门控。";
    case "skipped_not_targeted":
      return "这一轮没有明确指向到该角色，也没有进入补充回复条件。";
    case "skipped_random_gate":
      return "该角色进入候选池了，但活动频率概率门没有通过。";
    case "skipped_without_explicit_interest":
      return "当前消息没有明确提及，也不是 @所有人，所以不会额外扩散到其他角色。";
    case "skipped_max_speakers":
      return "这一轮允许发言的人数已满，即使命中条件也不再继续排入。";
    default:
      return disposition;
  }
}

function describeGroupReplyIssue(issue: ReplyLogicGroupReplyIssueSummary) {
  if (issue.source === "cancel_reason") {
    return `最近群聊任务里，这个取消原因共出现 ${issue.count} 次，通常说明旧轮次被更新的用户消息覆盖，或者执行前角色上下文已经失效。`;
  }

  return `最近群聊任务里，这类执行错误共出现 ${issue.count} 次。优先看失败任务明细里的原始错误，再决定是重新入队还是修运行环境。`;
}

function describeArchivedGroupReplyIssue(
  issue: ReplyLogicGroupReplyIssueSummary,
) {
  if (issue.source === "cancel_reason") {
    return `这是已经归档的历史取消热点，累计出现 ${issue.count} 次，适合用来判断长期是否存在过度取消或轮次过时问题。`;
  }

  return `这是已经归档的历史失败热点，累计出现 ${issue.count} 次，适合用来判断某类 provider 或上下文错误是否反复出现。`;
}

function toneForGroupReplyActorDriftSeverity(
  severity: ReplyLogicGroupReplyActorDriftSummary["severity"],
) {
  switch (severity) {
    case "warning":
      return "warning" as const;
    case "watch":
      return "muted" as const;
    default:
      return "healthy" as const;
  }
}

function formatGroupReplyActorDriftSeverity(
  severity: ReplyLogicGroupReplyActorDriftSummary["severity"],
) {
  switch (severity) {
    case "warning":
      return "异常抬升";
    case "watch":
      return "需要关注";
    default:
      return "稳定";
  }
}

function formatGroupReplyActorDriftBaselineSource(
  source: ReplyLogicGroupReplyActorDriftSummary["baselineSource"],
) {
  switch (source) {
    case "actor_archive":
      return "角色历史";
    case "group_archive":
      return "群聊整体历史";
    default:
      return "暂无历史基线";
  }
}

function describeGroupReplyActorDrift(
  actor: ReplyLogicGroupReplyActorDriftSummary,
) {
  if (actor.baselineSource === "none") {
    return `最近 8 轮里，这个角色已有 ${actor.recentTaskCount} 条终态任务；因为还没有足够历史基线，所以先按绝对异常率 ${(actor.recentIssueRate * 100).toFixed(1)}% 做兜底监控。`;
  }

  return `最近 ${actor.recentTurnCount} 轮里，这个角色的异常率是 ${(actor.recentIssueRate * 100).toFixed(1)}%，相对${formatGroupReplyActorDriftBaselineSource(actor.baselineSource)}抬高了 ${formatRateDelta(actor.issueRateDelta)}。`;
}

function formatRateDelta(value: number) {
  const percentage = Math.abs(value * 100).toFixed(1);
  if (value > 0) {
    return `+${percentage} pt`;
  }
  if (value < 0) {
    return `-${percentage} pt`;
  }
  return "0.0 pt";
}

function buildVisibleGroupReplyIssueSummary(
  tasks: ReplyLogicGroupReplyTurnSummary["tasks"],
  limit = 8,
): ReplyLogicGroupReplyIssueSummary[] {
  const issueCounts = new Map<string, ReplyLogicGroupReplyIssueSummary>();

  for (const task of tasks) {
    if (task.status === "cancelled" && task.cancelReason) {
      const key = `cancel:${task.cancelReason}`;
      const existing = issueCounts.get(key);
      issueCounts.set(key, {
        key,
        label: formatGroupReplyIssueLabel("cancel_reason", task.cancelReason),
        source: "cancel_reason",
        status: "cancelled",
        count: (existing?.count ?? 0) + 1,
      });
    }

    if (task.status === "failed" && task.errorMessage) {
      const normalizedError = normalizeGroupReplyErrorMessage(
        task.errorMessage,
      );
      const key = `error:${normalizedError}`;
      const existing = issueCounts.get(key);
      issueCounts.set(key, {
        key,
        label: formatGroupReplyIssueLabel("error_message", normalizedError),
        source: "error_message",
        status: "failed",
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return [...issueCounts.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

function normalizeGroupReplyErrorMessage(message: string) {
  return message.trim().slice(0, 80) || "unknown_error";
}

function formatGroupReplyIssueLabel(
  source: ReplyLogicGroupReplyIssueSummary["source"],
  value: string,
) {
  if (source === "cancel_reason") {
    if (value === "superseded_by_new_user_message") {
      return "新用户消息覆盖了旧轮任务";
    }
    if (value === "actor_missing") {
      return "角色缺失或画像不可用";
    }
  }

  return value;
}

function formatArchiveTrendDate(date: string) {
  return formatLocalizedDateTime(
    date ? `${date}T00:00:00` : date,
    {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    },
    "未记录日期",
  );
}

function describeArchiveTrendPoint(
  point: ReplyLogicGroupReplyArchiveTrendPoint,
) {
  return `当天共归档 ${point.taskCount} 条终态任务，涉及 ${point.turnCount} 轮；其中已发送 ${point.sentCount} 条、已取消 ${point.cancelledCount} 条、失败 ${point.failedCount} 条。`;
}

function describeArchiveActorSummary(
  actor: ReplyLogicGroupReplyArchiveActorSummary,
) {
  return `长期归档里，这个角色累计参与 ${actor.taskCount} 条任务；成功发送 ${actor.sentCount} 条，取消 ${actor.cancelledCount} 条，失败 ${actor.failedCount} 条。`;
}

function formatGroupReplyCandidateMeta(recentSpeakerIndex: number) {
  if (recentSpeakerIndex < 0) {
    return "最近发言惩罚：未触发";
  }

  return `最近发言惩罚：窗口内第 ${recentSpeakerIndex + 1} 位`;
}

function describeGroupReplyTask(
  task: ReplyLogicGroupReplyTurnSummary["tasks"][number],
) {
  if (task.status === "sent") {
    return `已发出，发送时间 ${formatDateTime(task.sentAt)}。`;
  }
  if (task.status === "processing") {
    return `任务已开始执行，上次尝试时间 ${formatDateTime(task.lastAttemptAt)}。`;
  }
  if (task.status === "pending") {
    return "任务仍在排队，等待到达计划执行时间。";
  }
  if (task.status === "cancelled") {
    return `任务已取消，原因：${formatGroupReplyCancelReason(task.cancelReason)}。`;
  }
  return `任务失败${task.errorMessage ? `：${task.errorMessage}` : "。"} `;
}

function formatGroupReplyCancelReason(reason?: string | null) {
  switch (reason) {
    case "superseded_by_new_user_message":
      return "同群出现了更新的用户消息";
    case "actor_missing":
      return "角色已不存在或画像不可用";
    default:
      return reason || "未记录";
  }
}

function formatRelationship(value?: string | null) {
  if (!value) {
    return "未设置";
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "self":
      return "自己";
    case "family":
      return "家人";
    case "friend":
      return "朋友";
    case "expert":
      return "专家";
    case "mentor":
      return "导师";
    case "acquaintance":
      return "熟人";
    default:
      return value;
  }
}

function formatActivity(activity?: string | null) {
  const matched = ACTIVITY_OPTIONS.find((item) => item.value === activity);
  return matched?.label ?? "未设置";
}

function formatSenderType(senderType: ReplyLogicHistoryItem["senderType"]) {
  switch (senderType) {
    case "user":
      return "世界主人";
    case "character":
      return "角色";
    case "system":
      return "系统";
    default:
      return senderType;
  }
}

function formatMessageType(type: string) {
  switch (type) {
    case "text":
      return "文本";
    case "system":
      return "系统";
    case "proactive":
      return "主动消息";
    case "image":
      return "图片";
    case "file":
      return "文件";
    case "contact_card":
      return "名片";
    case "location_card":
      return "位置卡片";
    case "sticker":
      return "表情包";
    case "article_card":
      return "文章卡片";
    default:
      return type;
  }
}

function formatAttachmentKind(kind: string) {
  return formatMessageType(kind);
}

function formatPromptSectionLabel(
  section: ReplyLogicActorSnapshot["promptSections"][number],
) {
  switch (section.key) {
    case "identity":
      return "身份设定";
    case "personality_and_tone":
      return "语气与风格";
    case "behavioral_patterns":
      return "行为模式";
    case "cognitive_boundaries":
      return "认知边界";
    case "internal_reasoning":
      return "内部推理";
    case "collaboration_routing":
      return "协作路由";
    case "memory":
      return "记忆";
    case "current_context":
      return "当前上下文";
    case "group_chat":
      return "群聊上下文";
    case "rules":
      return "规则";
    default:
      return section.label;
  }
}

function formatNarrativeTitle(
  title: string,
  narrativePresentation?:
    | ReplyLogicConstantSummary["narrativePresentationTemplates"]
    | null,
) {
  if (title.endsWith(" relationship arc")) {
    const suffix = narrativePresentation?.relationshipArcSuffix ?? "关系弧线";
    return `${title.replace(/ relationship arc$/, "")} ${suffix}`;
  }

  return title;
}

function formatNarrativeMilestoneLabel(
  label: string,
  narrativePresentation?:
    | ReplyLogicConstantSummary["narrativePresentationTemplates"]
    | null,
) {
  const milestoneLabels = narrativePresentation?.milestoneLabels;
  const mapped =
    milestoneLabels && label in milestoneLabels
      ? milestoneLabels[label as keyof typeof milestoneLabels]
      : undefined;
  if (mapped) {
    return mapped;
  }

  switch (label) {
    case "connected":
      return "已建立连接";
    case "first_breakthrough":
      return "首次突破";
    case "shared_context":
      return "共享语境";
    case "growing_trust":
      return "信任增长";
    case "inner_circle":
      return "进入内圈";
    case "story_complete":
      return "关系完成";
    default:
      return label;
  }
}

function formatReplyLogicText(value: string) {
  return value;
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "notSet",
  );
}
