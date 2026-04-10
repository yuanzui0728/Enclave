import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updateCharacter,
  type BehavioralPatterns,
  type Character,
  type CharacterIdentity,
  type CognitiveBoundaries,
  type MemoryLayers,
  type PersonalityProfile,
  type ReplyLogicActorSnapshot,
  type ReplyLogicCharacterSnapshot,
  type ReplyLogicConstantSummary,
  type ReplyLogicConversationSnapshot,
  type ReplyLogicHistoryItem,
  type ReplyLogicNarrativeArcSummary,
  type ReplyLogicOverview,
  type ReplyLogicPreviewResult,
  type ReplyLogicPromptSection,
  type ReasoningConfig,
  type ReplyLogicStateGateSummary,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  PanelEmpty,
  SectionHeading,
  SelectField,
  SnapshotPanel,
  StatusPill,
  TextAreaField as UiTextAreaField,
  TextField as UiTextField,
  ToggleChip,
  useProviderSetup,
} from "@yinjie/ui";
import { AdminInfoRows, AdminPageHero, AdminSectionNav } from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type InspectorScope = "character" | "conversation";

type EditableProfile = Omit<
  PersonalityProfile,
  | "basePrompt"
  | "systemPrompt"
  | "identity"
  | "behavioralPatterns"
  | "cognitiveBoundaries"
  | "reasoningConfig"
  | "memory"
> & {
  basePrompt: string;
  systemPrompt: string;
  identity: CharacterIdentity;
  behavioralPatterns: BehavioralPatterns;
  cognitiveBoundaries: CognitiveBoundaries;
  reasoningConfig: ReasoningConfig;
  memory: MemoryLayers;
};

type EditableCharacter = Omit<Character, "profile"> & {
  profile: EditableProfile;
};

const ACTIVITY_OPTIONS: Array<{ value: NonNullable<Character["currentActivity"]>; label: string }> = [
  { value: "free", label: "空闲" },
  { value: "working", label: "工作中" },
  { value: "eating", label: "吃饭中" },
  { value: "resting", label: "休息中" },
  { value: "commuting", label: "通勤中" },
  { value: "sleeping", label: "睡觉中" },
];

export function ReplyLogicPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<InspectorScope>("character");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [configuredConversationActorId, setConfiguredConversationActorId] = useState("");
  const [characterDraft, setCharacterDraft] = useState<EditableCharacter | null>(null);
  const [runtimeRulesDraft, setRuntimeRulesDraft] = useState<ReplyLogicConstantSummary | null>(null);
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

  const activeCharacterId = selectedCharacterId || overviewQuery.data?.characters[0]?.id || "";
  const activeConversationId =
    selectedConversationId || overviewQuery.data?.conversations[0]?.id || "";

  const characterSnapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-character", baseUrl, activeCharacterId],
    queryFn: () => adminApi.getReplyLogicCharacterSnapshot(activeCharacterId),
    enabled: scope === "character" && Boolean(activeCharacterId),
  });

  const conversationSnapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-conversation", baseUrl, activeConversationId],
    queryFn: () => adminApi.getReplyLogicConversationSnapshot(activeConversationId),
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
    () => overview?.characters.find((item) => item.id === activeCharacterId) ?? null,
    [activeCharacterId, overview?.characters],
  );
  const selectedConversation = useMemo(
    () => overview?.conversations.find((item) => item.id === activeConversationId) ?? null,
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
      !conversationActorOptions.some((item) => item.id === configuredConversationActorId)
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
    () => (editableCharacterSource ? createEditableCharacter(editableCharacterSource) : null),
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
  const narrativePresentation =
    runtimeRulesDraft?.narrativePresentationTemplates ??
    overview?.constants.narrativePresentationTemplates ??
    null;

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-reply-logic-overview", baseUrl] }),
      queryClient.invalidateQueries({ queryKey: ["admin-reply-logic-character", baseUrl] }),
      queryClient.invalidateQueries({ queryKey: ["admin-reply-logic-conversation", baseUrl] }),
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
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-character-edit", baseUrl] }),
      ]);
    },
  });

  const runtimeRulesSaveMutation = useMutation({
    mutationFn: async (draft: ReplyLogicConstantSummary) => adminApi.setReplyLogicRules(draft),
    onSuccess: async () => {
      await Promise.all([
        refreshAll(),
        queryClient.invalidateQueries({ queryKey: ["admin-reply-logic-overview", baseUrl] }),
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

  useEffect(() => {
    setCharacterDraft(editableCharacterSeed);
    characterSaveMutation.reset();
  }, [editableCharacterSeedSignature]);

  useEffect(() => {
    setRuntimeRulesDraft(overview?.constants ?? null);
    runtimeRulesSaveMutation.reset();
  }, [runtimeRulesSeedSignature]);

  useEffect(() => {
    previewMutation.reset();
  }, [activeCharacterId, activeConversationId, configuredConversationActorId, scope]);

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

  function patchCharacterDraft(updater: (current: EditableCharacter) => EditableCharacter) {
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

  const currentStatusRows = [
    { label: "当前范围", value: scope === "character" ? "角色" : "会话" },
    {
      label: "当前目标",
      value:
        scope === "character"
          ? selectedCharacter?.name ?? "未选择角色"
          : selectedConversation?.title ?? "未选择会话",
    },
    { label: "角色草稿", value: isCharacterDraftDirty ? "未保存" : "已同步" },
    { label: "运行规则", value: isRuntimeRulesDraftDirty ? "未保存" : "已同步" },
  ];
  const targetSummaryRows =
    scope === "character" && selectedCharacter
      ? [
          { label: "角色", value: selectedCharacter.name },
          { label: "活动", value: formatActivity(selectedCharacter.currentActivity) },
          { label: "在线", value: selectedCharacter.isOnline ? "在线" : "离线" },
        ]
      : scope === "conversation" && selectedConversation
        ? [
            { label: "会话", value: selectedConversation.title },
            { label: "来源", value: formatConversationSource(selectedConversation.source) },
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

    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      {overviewQuery.isLoading ? <LoadingBlock label="正在读取回复逻辑总览..." /> : null}
      {overviewQuery.isError && overviewQuery.error instanceof Error ? (
        <ErrorBlock message={overviewQuery.error.message} />
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <AdminPageHero
              eyebrow="回复调试"
              title="先选目标，再看真实快照，最后修改保存。"
              description="这页已经支持同页修改角色配置、候选消息预演、运行规则，以及 Prompt 构建模板。保存后会刷新真实运行快照。"
              actions={
                <>
                  <Button onClick={() => void refreshAll()} variant="secondary" size="lg">
                    刷新快照
                  </Button>
                  <Button
                    onClick={saveRuntimeRulesDraft}
                    variant="primary"
                    size="lg"
                    disabled={!isRuntimeRulesDraftDirty || runtimeRulesSaveMutation.isPending}
                  >
                    {runtimeRulesSaveMutation.isPending ? "保存规则中..." : "保存运行规则"}
                  </Button>
                </>
              }
              metrics={[
                { label: "角色数", value: overview.characters.length },
                { label: "会话数", value: overview.conversations.length },
                { label: "当前模型", value: overview.provider.model },
                { label: "世界上下文", value: overview.worldContext?.text || "暂无快照" },
              ]}
            />

            <AdminInfoRows title="当前状态" rows={currentStatusRows} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_440px]">
            <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
              <AdminSectionNav
                title="段落导航"
                items={[
                  { label: "真实快照", detail: "角色或会话的运行快照", onClick: () => jumpToSection("reply-logic-inspector") },
                  { label: "候选预演", detail: "输入消息并预演生成链路", onClick: () => jumpToSection("reply-logic-preview") },
                  { label: "配置抽屉", detail: "修改角色和实例运行配置", onClick: () => jumpToSection("reply-logic-config") },
                  { label: "运行规则", detail: "维护全局规则与提示语", onClick: () => jumpToSection("reply-logic-rules") },
                ]}
              />

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>工作范围</SectionHeading>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setScope("character")}
                      className={
                        scope === "character"
                          ? "rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-3 text-sm font-medium text-[color:var(--brand-primary)]"
                          : "rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)]"
                      }
                    >
                      按角色查看
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("conversation")}
                      className={
                        scope === "conversation"
                          ? "rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-3 text-sm font-medium text-[color:var(--brand-primary)]"
                          : "rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)]"
                      }
                    >
                      按会话查看
                    </button>
                  </div>

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

              <AdminInfoRows title="当前目标摘要" rows={targetSummaryRows} />

              <AdminInfoRows title="真实运行推理服务" rows={providerSummaryRows} />

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
                  narrativePresentation={narrativePresentation}
                />
              )}
            </div>

            <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
              <div id="reply-logic-preview">
                <ReplyPreviewPanel
                  scope={scope}
                  previewMessage={previewMessage}
                  onPreviewMessageChange={setPreviewMessage}
                  actorOptions={conversationActorOptions}
                  configuredConversationActorId={configuredConversationActorId}
                  onConfiguredConversationActorIdChange={setConfiguredConversationActorId}
                  preview={previewMutation.data}
                  error={previewMutation.error}
                  isPending={previewMutation.isPending}
                  onRunPreview={() => previewMutation.mutate()}
                />
              </div>

              <div id="reply-logic-config">
                <Card className="bg-[color:var(--surface-console)]">
                  <div className="flex items-center justify-between gap-3">
                    <SectionHeading>配置抽屉</SectionHeading>
                    <StatusPill tone={isCharacterDraftDirty ? "warning" : "healthy"}>
                      {characterDraft ? (isCharacterDraftDirty ? "草稿未保存" : "已同步") : "等待目标"}
                    </StatusPill>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <MetricCard label="当前范围" value={scope === "character" ? "角色" : "会话"} />
                    <MetricCard
                      label="配置目标"
                      value={editableCharacterSource?.name ?? (scope === "conversation" ? "先选择会话角色" : "先选择角色")}
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
                    这里改的是实体字段和 `profile` 配置对象。本页不会实时重算草稿提示词，保存后会刷新右侧快照，看到真实生效结果。
                  </InlineNotice>
                </Card>
              </div>

              <Card className="bg-[color:var(--surface-console)]">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading>角色配置</SectionHeading>
                  {editableCharacterSource ? (
                    <StatusPill tone={editableCharacterSource.isOnline ? "healthy" : "muted"}>
                      {editableCharacterSource.isOnline ? "在线" : "离线"}
                    </StatusPill>
                  ) : null}
                </div>

                {!characterDraft ? (
                  scope === "character" && characterSnapshotQuery.isLoading ? (
                    <LoadingBlock className="mt-4" label="正在加载角色配置..." />
                  ) : scope === "conversation" && conversationSnapshotQuery.isLoading ? (
                    <LoadingBlock className="mt-4" label="正在加载会话角色配置..." />
                  ) : (
                    <PanelEmpty message="当前没有可编辑的角色。" />
                  )
                ) : (
                  <>
                    {characterDraft.profile.systemPrompt.trim() ? (
                      <InlineNotice className="mt-4" tone="warning">
                        当前已填写 `systemPrompt`，真实回复时会直接覆盖结构化提示词拼装。你在下面改的身份、语气、边界字段，只有清空 `systemPrompt` 后才会重新体现在最终提示词里。
                      </InlineNotice>
                    ) : null}

                    {characterSaveMutation.isError && characterSaveMutation.error instanceof Error ? (
                      <ErrorBlock message={characterSaveMutation.error.message} />
                    ) : null}
                    {characterSaveMutation.isSuccess ? (
                      <InlineNotice tone="success">角色配置已保存，运行时快照正在刷新。</InlineNotice>
                    ) : null}

                    <div className="mt-4 space-y-6">
                      <ConfigSection title="回复运行">
                        <FieldBlock
                          label="关系描述"
                          value={characterDraft.relationship}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({ ...current, relationship: value }))
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
                              onlineMode: value === "manual" ? "manual" : "auto",
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
                              activityMode: value === "manual" ? "manual" : "auto",
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

                      <ConfigSection title="提示词覆盖与身份">
                        <TextAreaBlock
                          label="系统提示词"
                          value={characterDraft.profile.systemPrompt}
                          placeholder="留空时使用结构化提示词生成器。"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: { ...current.profile, systemPrompt: value },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="基础提示词"
                          value={characterDraft.profile.basePrompt}
                          placeholder="你是……用户的……"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: { ...current.profile, basePrompt: value },
                            }))
                          }
                        />
                        <FieldBlock
                          label="职业"
                          value={characterDraft.profile.identity.occupation}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                identity: { ...current.profile.identity, occupation: value },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="背景"
                          value={characterDraft.profile.identity.background}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                identity: { ...current.profile.identity, background: value },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="核心动机"
                          value={characterDraft.profile.identity.motivation}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                identity: { ...current.profile.identity, motivation: value },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="世界观"
                          value={characterDraft.profile.identity.worldview}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                identity: { ...current.profile.identity, worldview: value },
                              },
                            }))
                          }
                        />
                      </ConfigSection>

                      <ConfigSection title="语气与行为">
                        <FieldBlock
                          label="说话习惯"
                          value={listToCsv(characterDraft.profile.traits.speechPatterns)}
                          placeholder="一句一风格，逗号分隔"
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                traits: {
                                  ...current.profile.traits,
                                  speechPatterns: csvToList(value),
                                },
                              },
                            }))
                          }
                        />
                        <FieldBlock
                          label="口头禅"
                          value={listToCsv(characterDraft.profile.traits.catchphrases)}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                traits: {
                                  ...current.profile.traits,
                                  catchphrases: csvToList(value),
                                },
                              },
                            }))
                          }
                        />
                        <FieldBlock
                          label="情绪基调"
                          value={characterDraft.profile.traits.emotionalTone}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                traits: {
                                  ...current.profile.traits,
                                  emotionalTone: value,
                                },
                              },
                            }))
                          }
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                          <SelectFieldBlock
                            label="回复长度"
                            value={characterDraft.profile.traits.responseLength}
                            onChange={(value) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                profile: {
                                  ...current.profile,
                                  traits: {
                                    ...current.profile.traits,
                                    responseLength: value as Character["profile"]["traits"]["responseLength"],
                                  },
                                },
                              }))
                            }
                            options={[
                              { value: "short", label: "简短" },
                              { value: "medium", label: "适中" },
                              { value: "long", label: "详细" },
                            ]}
                          />
                          <SelectFieldBlock
                            label="表情使用"
                            value={characterDraft.profile.traits.emojiUsage}
                            onChange={(value) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                profile: {
                                  ...current.profile,
                                  traits: {
                                    ...current.profile.traits,
                                    emojiUsage: value as Character["profile"]["traits"]["emojiUsage"],
                                  },
                                },
                              }))
                            }
                            options={[
                              { value: "none", label: "不用" },
                              { value: "occasional", label: "偶尔" },
                              { value: "frequent", label: "频繁" },
                            ]}
                          />
                        </div>
                        <FieldBlock
                          label="工作风格"
                          value={characterDraft.profile.behavioralPatterns.workStyle}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                behavioralPatterns: {
                                  ...current.profile.behavioralPatterns,
                                  workStyle: value,
                                },
                              },
                            }))
                          }
                        />
                        <FieldBlock
                          label="社交风格"
                          value={characterDraft.profile.behavioralPatterns.socialStyle}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                behavioralPatterns: {
                                  ...current.profile.behavioralPatterns,
                                  socialStyle: value,
                                },
                              },
                            }))
                          }
                        />
                        <FieldBlock
                          label="语言禁忌"
                          value={listToCsv(characterDraft.profile.behavioralPatterns.taboos)}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                behavioralPatterns: {
                                  ...current.profile.behavioralPatterns,
                                  taboos: csvToList(value),
                                },
                              },
                            }))
                          }
                        />
                        <FieldBlock
                          label="个人癖好"
                          value={listToCsv(characterDraft.profile.behavioralPatterns.quirks)}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                behavioralPatterns: {
                                  ...current.profile.behavioralPatterns,
                                  quirks: csvToList(value),
                                },
                              },
                            }))
                          }
                        />
                      </ConfigSection>

                      <ConfigSection title="边界、记忆与调试">
                        <TextAreaBlock
                          label="专长描述"
                          value={characterDraft.profile.cognitiveBoundaries.expertiseDescription}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                cognitiveBoundaries: {
                                  ...current.profile.cognitiveBoundaries,
                                  expertiseDescription: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="知识边界"
                          value={characterDraft.profile.cognitiveBoundaries.knowledgeLimits}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                cognitiveBoundaries: {
                                  ...current.profile.cognitiveBoundaries,
                                  knowledgeLimits: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="超界拒绝方式"
                          value={characterDraft.profile.cognitiveBoundaries.refusalStyle}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                cognitiveBoundaries: {
                                  ...current.profile.cognitiveBoundaries,
                                  refusalStyle: value,
                                },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="旧版记忆摘要"
                          value={characterDraft.profile.memorySummary}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: { ...current.profile, memorySummary: value },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="核心记忆"
                          value={characterDraft.profile.memory.coreMemory}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                memory: { ...current.profile.memory, coreMemory: value },
                              },
                            }))
                          }
                        />
                        <TextAreaBlock
                          label="近期摘要"
                          value={characterDraft.profile.memory.recentSummary}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                memory: { ...current.profile.memory, recentSummary: value },
                              },
                            }))
                          }
                        />
                        <FieldBlock
                          label="遗忘曲线"
                          value={characterDraft.profile.memory.forgettingCurve}
                          type="number"
                          min={0}
                          max={100}
                          onChange={(value) =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                memory: {
                                  ...current.profile.memory,
                                  forgettingCurve: parseForgettingCurve(value),
                                },
                              },
                            }))
                          }
                        />
                        <div className="flex flex-wrap gap-3">
                          <ToggleChip
                            label="启用链路推理"
                            checked={characterDraft.profile.reasoningConfig.enableCoT}
                            onChange={(event) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                profile: {
                                  ...current.profile,
                                  reasoningConfig: {
                                    ...current.profile.reasoningConfig,
                                    enableCoT: event.currentTarget.checked,
                                  },
                                },
                              }))
                            }
                          />
                          <ToggleChip
                            label="启用反思"
                            checked={characterDraft.profile.reasoningConfig.enableReflection}
                            onChange={(event) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                profile: {
                                  ...current.profile,
                                  reasoningConfig: {
                                    ...current.profile.reasoningConfig,
                                    enableReflection: event.currentTarget.checked,
                                  },
                                },
                              }))
                            }
                          />
                          <ToggleChip
                            label="启用路由"
                            checked={characterDraft.profile.reasoningConfig.enableRouting}
                            onChange={(event) =>
                              patchCharacterDraft((current) => ({
                                ...current,
                                profile: {
                                  ...current.profile,
                                  reasoningConfig: {
                                    ...current.profile.reasoningConfig,
                                    enableRouting: event.currentTarget.checked,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                      </ConfigSection>

                      <div className="flex flex-wrap gap-3 border-t border-[color:var(--border-faint)] pt-5">
                        <Button variant="secondary" onClick={resetCharacterDraft}>
                          重置草稿
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            patchCharacterDraft((current) => ({
                              ...current,
                              profile: {
                                ...current.profile,
                                systemPrompt: "",
                              },
                            }))
                          }
                        >
                          清空系统提示词
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
                          disabled={!isCharacterDraftDirty || characterSaveMutation.isPending}
                        >
                          {characterSaveMutation.isPending ? "保存中..." : "保存角色配置"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading>回复运行配置</SectionHeading>
                  <StatusPill tone={providerSetup.providerReady ? "healthy" : "warning"}>
                    {providerSetup.providerReady ? "已配置" : "待配置"}
                  </StatusPill>
                </div>

                <div className="mt-4 space-y-4">
                  <FieldBlock
                    label="接口地址"
                    value={providerSetup.providerDraft.endpoint}
                    placeholder="https://api.openai.com/v1"
                    onChange={(value) => providerSetup.updateProviderDraft("endpoint", value)}
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
                      onChange={(value) => providerSetup.updateProviderDraft("model", value)}
                    />
                    <datalist id="reply-logic-available-models">
                      {(providerSetup.availableModelsQuery.data?.models ?? []).map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </div>

                  <FieldBlock
                    label="API 密钥"
                    value={providerSetup.providerDraft.apiKey ?? ""}
                    type="password"
                    placeholder="输入实例级推理服务 API 密钥"
                    onChange={(value) => providerSetup.updateProviderDraft("apiKey", value)}
                  />

                  {providerSetup.providerValidationMessage ? (
                    <InlineNotice tone="warning">
                      {providerSetup.providerValidationMessage}
                    </InlineNotice>
                  ) : null}
                  {providerLoadError ? <ErrorBlock message={providerLoadError} /> : null}
                  {providerActionError ? <ErrorBlock message={providerActionError} /> : null}
                  {providerSetup.providerSaveMutation.isSuccess ? (
                    <InlineNotice tone="success">实例级推理服务已保存，运行时快照正在刷新。</InlineNotice>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={providerSetup.submitProviderProbe}
                      disabled={providerSetup.providerProbeMutation.isPending}
                    >
                      {providerSetup.providerProbeMutation.isPending ? "测试中..." : "测试连接"}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={providerSetup.submitProviderSave}
                      disabled={providerSetup.providerSaveMutation.isPending}
                    >
                      {providerSetup.providerSaveMutation.isPending ? "保存中..." : "保存运行配置"}
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
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onSelect}
            className={
              item.active
                ? "block w-full rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-3 text-left shadow-[var(--shadow-soft)]"
                : "block w-full rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-[color:var(--text-primary)]">{item.title}</div>
                <div className="mt-1 truncate text-sm text-[color:var(--text-secondary)]">{item.subtitle}</div>
              </div>
              <StatusPill tone={item.tone}>{item.status}</StatusPill>
            </div>
          </button>
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
  narrativePresentation: ReplyLogicConstantSummary["narrativePresentationTemplates"] | null;
}) {
  if (!selectedCharacter) {
    return <PanelEmpty message="当前没有可选角色。" />;
  }

  if (query.isLoading) {
    return <LoadingBlock label="正在读取角色回复快照..." />;
  }

  if (query.isError && query.error instanceof Error) {
    return <ErrorBlock message={query.error.message} />;
  }

  if (!query.data) {
    return <PanelEmpty message="角色回复快照暂不可用。" />;
  }

  return (
    <>
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>当前角色</SectionHeading>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="名称" value={query.data.character.name} />
          <MetricCard label="关系" value={formatRelationship(query.data.character.relationship)} />
          <MetricCard label="活动" value={formatActivity(query.data.character.currentActivity)} />
          <MetricCard label="遗忘曲线" value={query.data.actor.forgettingCurve} />
        </div>
      </Card>

      <ActorSnapshotCard actor={query.data.actor} title="单聊回复角色快照" />

      <NarrativeCard
        arcs={query.data.narrativeArc ? [query.data.narrativeArc] : []}
        narrativePresentation={narrativePresentation}
      />

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>备注</SectionHeading>
        <NoteList notes={query.data.notes} className="mt-4" />
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
      <div className="flex items-center justify-between gap-3">
        <SectionHeading>候选消息预演</SectionHeading>
        <StatusPill tone={preview ? "healthy" : "muted"}>
          {preview ? "已生成预演" : "等待预演"}
        </StatusPill>
      </div>

      <InlineNotice className="mt-4" tone="muted">
        这里会按当前角色配置、当前可见历史、当前世界上下文和当前状态门，预演这条用户消息会如何进入模型。
      </InlineNotice>

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
          <Card className="bg-[color:var(--surface-card)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              预演备注
            </div>
            <NoteList notes={preview.notes} className="mt-3" />
          </Card>
        </div>
      ) : null}
    </Card>
  );
}

function ConversationInspectorPanel({
  selectedConversation,
  query,
  narrativePresentation,
}: {
  selectedConversation: ReplyLogicOverview["conversations"][number] | null;
  query: ReturnType<typeof useQuery<ReplyLogicConversationSnapshot>>;
  narrativePresentation: ReplyLogicConstantSummary["narrativePresentationTemplates"] | null;
}) {
  if (!selectedConversation) {
    return <PanelEmpty message="当前没有可选会话。" />;
  }

  if (query.isLoading) {
    return <LoadingBlock label="正在读取会话回复快照..." />;
  }

  if (query.isError && query.error instanceof Error) {
    return <ErrorBlock message={query.error.message} />;
  }

  if (!query.data) {
    return <PanelEmpty message="会话回复快照暂不可用。" />;
  }

  return (
    <>
      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>会话分支</SectionHeading>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="标题" value={query.data.conversation.title} />
          <MetricCard label="类型" value={formatConversationType(query.data.conversation.type)} />
          <MetricCard label="来源" value={formatConversationSource(query.data.conversation.source)} />
          <MetricCard label="参与角色" value={query.data.actors.length} />
        </div>
        <div className="mt-4 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            {formatReplyLogicText(query.data.branchSummary.title)}
          </div>
          <NoteList notes={query.data.branchSummary.notes} className="mt-3" />
        </div>
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <SectionHeading>可见会话历史</SectionHeading>
        <HistoryList className="mt-4" items={query.data.visibleMessages} />
      </Card>

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
            <MetricCard label="API 可用" value={actor.apiAvailable ? "可用" : "不可用"} />
            <MetricCard label="历史窗口" value={actor.historyWindow} />
            <MetricCard label="可见消息数" value={actor.visibleHistoryCount} />
            <MetricCard label="最近聊天时间" value={formatDateTime(actor.lastChatAt)} />
            <MetricCard label="世界上下文" value={actor.worldContextText || "暂无快照"} />
          </div>
          <Card className="bg-[color:var(--surface-card)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              角色备注
            </div>
            <NoteList notes={actor.notes} className="mt-3" />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="bg-[color:var(--surface-card)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              提示词分段
            </div>
            <PromptSectionList className="mt-4" sections={actor.promptSections} />
          </Card>

          <Card className="bg-[color:var(--surface-card)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              最终生效提示词
            </div>
            <CodeBlock className="mt-4" value={actor.effectivePrompt} />
          </Card>

          <Card className="bg-[color:var(--surface-card)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              上下文窗口
            </div>
            <HistoryList className="mt-4" items={actor.windowMessages} />
          </Card>

          <Card className="bg-[color:var(--surface-card)]">
            <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              最终请求消息
            </div>
            <RequestMessageList className="mt-4" items={actor.requestMessages} />
          </Card>
        </div>
      </div>
    </Card>
  );
}

function StateGateCard({ gate }: { gate: ReplyLogicStateGateSummary }) {
  return (
    <Card className="bg-[color:var(--surface-card)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          状态门
        </div>
        <StatusPill tone={toneForGate(gate.mode)}>{formatGateMode(gate.mode)}</StatusPill>
      </div>
      <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
        {formatStateGateReason(gate)}
      </div>
      {gate.activity ? (
        <div className="mt-3 text-xs text-[color:var(--text-muted)]">
          活动：{formatActivity(gate.activity)}
        </div>
      ) : null}
      {gate.delayMs ? (
        <div className="mt-2 text-xs text-[color:var(--text-muted)]">
          延迟：{gate.delayMs.min}ms - {gate.delayMs.max}ms
        </div>
      ) : null}
      {gate.hintMessages.length ? (
        <ul className="mt-3 space-y-2 text-xs leading-6 text-[color:var(--text-muted)]">
          {gate.hintMessages.map((message) => (
            <li
              key={message}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2"
            >
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function PromptSectionList({
  sections,
  className,
}: {
  sections: ReplyLogicPromptSection[];
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="space-y-3">
        {sections.map((section) => (
          <div
            key={section.key}
            className="overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/90"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-faint)] px-4 py-3">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                {formatPromptSectionLabel(section)}
              </div>
              <StatusPill tone={section.active ? "healthy" : "muted"}>
                {section.active ? "生效中" : "未生效"}
              </StatusPill>
            </div>
            <CodeBlock
              className="rounded-none border-0 bg-transparent p-4"
              value={section.content || "当前未注入该分段。"}
            />
          </div>
        ))}
      </div>
    </div>
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
    return <PanelEmpty message="当前没有可见历史消息。" />;
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-[20px] border border-[color:var(--border-faint)] bg-white/90 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={item.includedInWindow ? "healthy" : "muted"}>
                {item.includedInWindow ? "进入窗口" : "仅可见"}
              </StatusPill>
              <StatusPill tone="muted">{formatSenderType(item.senderType)}</StatusPill>
              <StatusPill tone="muted">{formatMessageType(item.type)}</StatusPill>
              {item.attachmentKind ? (
                <StatusPill tone="warning">{formatAttachmentKind(item.attachmentKind)}</StatusPill>
              ) : null}
            </div>
            <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
              {item.senderName} · {formatDateTime(item.createdAt)}
            </div>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {item.text}
            </div>
            <div className="mt-2 text-xs text-[color:var(--text-muted)]">
              {formatReplyLogicText(item.note)}
            </div>
          </div>
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
    return <PanelEmpty message="当前没有可展示的模型请求消息。" />;
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.role}-${index}`}
            className="rounded-[20px] border border-[color:var(--border-faint)] bg-white/90 p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={item.role === "system" ? "warning" : item.role === "assistant" ? "healthy" : "muted"}>
                {formatRequestRole(item.role)}
              </StatusPill>
            </div>
            <CodeBlock className="mt-3" value={item.content} />
          </div>
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
  narrativePresentation: ReplyLogicConstantSummary["narrativePresentationTemplates"] | null;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <SectionHeading>记忆与叙事</SectionHeading>
      {!arcs.length ? (
        <PanelEmpty message="当前没有叙事弧线记录。" />
      ) : (
        <div className="mt-4 space-y-4">
          {arcs.map((arc) => (
            <div
              key={arc.id}
              className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {formatNarrativeTitle(arc.title, narrativePresentation)}
                </div>
                <StatusPill tone={arc.status === "completed" ? "healthy" : "warning"}>
                  {formatNarrativeStatus(arc.status)}
                </StatusPill>
                <StatusPill tone="muted">{arc.progress}%</StatusPill>
              </div>
              <div className="mt-3 text-xs text-[color:var(--text-muted)]">
                创建：{formatDateTime(arc.createdAt)} · 完成：{formatDateTime(arc.completedAt)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {arc.milestones.map((item) => (
                  <StatusPill key={`${arc.id}-${item.label}`} tone="healthy">
                    {formatNarrativeMilestoneLabel(item.label, narrativePresentation)}
                  </StatusPill>
                ))}
              </div>
            </div>
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
  onPatch: (updater: (current: ReplyLogicConstantSummary) => ReplyLogicConstantSummary) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <div className="flex items-center justify-between gap-3">
        <SectionHeading>运行规则配置</SectionHeading>
        <StatusPill tone={isDirty ? "warning" : "healthy"}>
          {draft ? (isDirty ? "草稿未保存" : "已同步") : "等待加载"}
        </StatusPill>
      </div>

      {!draft ? (
        <LoadingBlock className="mt-4" label="正在加载运行规则..." />
      ) : (
        <>
          <InlineNotice className="mt-4" tone="muted">
            这里改的是回复与生活调度的全局运行规则。保存后，角色快照、会话快照和状态门控摘要会按新规则刷新。
          </InlineNotice>
          {error ? <ErrorBlock message={error} /> : null}
          {isSuccess ? <InlineNotice tone="success">运行规则已保存，快照正在刷新。</InlineNotice> : null}

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
                        min: parseNonNegativeInteger(value, current.sleepDelayMs.min),
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
                        max: parseNonNegativeInteger(value, current.sleepDelayMs.max),
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
                        min: parseNonNegativeInteger(value, current.busyDelayMs.min),
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
                        max: parseNonNegativeInteger(value, current.busyDelayMs.max),
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
                        high: parseProbability(value, current.groupReplyChance.high),
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
                        normal: parseProbability(value, current.groupReplyChance.normal),
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
                        low: parseProbability(value, current.groupReplyChance.low),
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
                        min: parseNonNegativeInteger(value, current.groupReplyDelayMs.min),
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
                        max: parseNonNegativeInteger(value, current.groupReplyDelayMs.max),
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
                      momentGenerateChance: parseProbability(value, current.momentGenerateChance),
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
                      channelGenerateChance: parseProbability(value, current.channelGenerateChance),
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
                      sceneFriendRequestChance: parseProbability(value, current.sceneFriendRequestChance),
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
                      activityBaseWeight: parseProbability(value, current.activityBaseWeight),
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
                        parseNonNegativeInteger(value, current.proactiveReminderHour),
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
                  value={draft.defaultCharacterRules.isOnline ? "online" : "offline"}
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
                        parseNonNegativeInteger(value, current.relationshipInitialStrength),
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
                        parseNonNegativeInteger(value, current.relationshipUpdateStep),
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
                        parsePositiveInteger(value, current.relationshipStrengthMax),
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
                        base: parsePositiveInteger(value, current.historyWindow.base),
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
                        range: parseNonNegativeInteger(value, current.historyWindow.range),
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
                value={draft.narrativePresentationTemplates.relationshipArcSuffix}
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
                value={recordToLines(draft.narrativePresentationTemplates.milestoneLabels)}
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
                这里改的是结构化 system prompt 的母版。支持的占位符会直接在标签里标出来，例如{" "}
                <code>{"{{name}}"}</code>、<code>{"{{relationship}}"}</code>、<code>{"{{currentTime}}"}</code>。
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
                这部分会直接影响朋友圈生成、人格提取、意图分类、记忆压缩等 AI 子链路。
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
                      domainLabels: parseKeyValueLines(value, current.semanticLabels.domainLabels),
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
                这里定义世界上下文的生成方式，以及注入到 system prompt 时的拼接模板。
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
                  value={listToLines(draft.worldContextRules.weatherOptions.spring)}
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
                  value={listToLines(draft.worldContextRules.weatherOptions.summer)}
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
                  value={listToLines(draft.worldContextRules.weatherOptions.autumn)}
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
                  value={listToLines(draft.worldContextRules.weatherOptions.winter)}
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
                value={recordToLines(draft.worldContextRules.contextFieldTemplates)}
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
                这部分主要影响后台里“角色视图备注 / 会话分支摘要 / 候选消息预演说明 / 历史窗口注释”这些解释文字。
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
                这里改的是回复逻辑总览里 Provider 差异备注，不影响真实推理请求，只影响后台解释文本。
              </InlineNotice>
              <TextAreaBlock
                label="Provider 备注（key=value）"
                value={recordToLines(draft.providerTemplates)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    providerTemplates: parseKeyValueLines(value, current.providerTemplates),
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
                这里改的是 Scheduler 任务列表里的描述文字，不改 cron 表达式和实际触发频率。
              </InlineNotice>
              <TextAreaBlock
                label="任务名称（key=value）"
                value={recordToLines(draft.schedulerNames)}
                onChange={(value) =>
                  onPatch((current) => ({
                    ...current,
                    schedulerNames: parseKeyValueLines(value, current.schedulerNames),
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
                <code>{"{{count}}"}</code>、<code>{"{{characterCount}}"}</code>、<code>{"{{scene}}"}</code>、<code>{"{{postId}}"}</code>、<code>{"{{activity}}"}</code>、<code>{"{{otherName}}"}</code> 等占位符。
              </InlineNotice>
              <TextAreaBlock
                label="调度事件与摘要（key=value）"
                value={schedulerTextTemplatesToLines(draft.schedulerTextTemplates)}
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
                value={draft.schedulerTextTemplates.proactiveReminderCheckPrompt}
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
              <Button variant="primary" onClick={onSave} disabled={!isDirty || isPending}>
                {isPending ? "保存中..." : "保存运行规则"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function ConfigSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-[color:var(--border-faint)] pt-5 first:border-t-0 first:pt-0">
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{title}</div>
      {children}
    </section>
  );
}

function FieldBlock({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  list,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  list?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <UiTextField
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        min={min}
        max={max}
        list={list}
      />
    </label>
  );
}

function TextAreaBlock({
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
      <UiTextAreaField
        className="min-h-28"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectFieldBlock({
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
    <label className={className}>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <SelectField value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}

function NoteList({
  notes,
  className,
}: {
  notes: string[];
  className?: string;
}) {
  if (!notes.length) {
    return <div className={className} />;
  }

  return (
    <ul className={className ? `${className} space-y-2` : "space-y-2"}>
      {notes.map((note) => (
        <li
          key={note}
          className="rounded-2xl border border-[color:var(--border-faint)] bg-white/80 px-3 py-2 text-sm leading-7 text-[color:var(--text-secondary)]"
        >
          {formatReplyLogicText(note)}
        </li>
      ))}
    </ul>
  );
}

function CodeBlock({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <pre
      className={[
        "overflow-x-auto whitespace-pre-wrap break-words rounded-[20px] border border-[color:var(--border-faint)] bg-white/90 p-4 text-xs leading-6 text-[color:var(--text-secondary)]",
        className ?? "",
      ].join(" ")}
    >
      {value}
    </pre>
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
      basePrompt: source.profile?.basePrompt ?? "",
      systemPrompt: source.profile?.systemPrompt ?? "",
      memorySummary: source.profile?.memorySummary ?? "",
      traits: {
        speechPatterns: source.profile?.traits?.speechPatterns ?? [],
        catchphrases: source.profile?.traits?.catchphrases ?? [],
        topicsOfInterest: source.profile?.traits?.topicsOfInterest ?? [],
        emotionalTone: source.profile?.traits?.emotionalTone ?? "grounded",
        responseLength: source.profile?.traits?.responseLength ?? "medium",
        emojiUsage: source.profile?.traits?.emojiUsage ?? "occasional",
      },
      identity: {
        occupation: source.profile?.identity?.occupation ?? "",
        background: source.profile?.identity?.background ?? "",
        motivation: source.profile?.identity?.motivation ?? "",
        worldview: source.profile?.identity?.worldview ?? "",
      },
      behavioralPatterns: {
        workStyle: source.profile?.behavioralPatterns?.workStyle ?? "",
        socialStyle: source.profile?.behavioralPatterns?.socialStyle ?? "",
        taboos: source.profile?.behavioralPatterns?.taboos ?? [],
        quirks: source.profile?.behavioralPatterns?.quirks ?? [],
      },
      cognitiveBoundaries: {
        expertiseDescription: source.profile?.cognitiveBoundaries?.expertiseDescription ?? "",
        knowledgeLimits: source.profile?.cognitiveBoundaries?.knowledgeLimits ?? "",
        refusalStyle: source.profile?.cognitiveBoundaries?.refusalStyle ?? "",
      },
      reasoningConfig: {
        enableCoT: source.profile?.reasoningConfig?.enableCoT ?? true,
        enableReflection: source.profile?.reasoningConfig?.enableReflection ?? true,
        enableRouting: source.profile?.reasoningConfig?.enableRouting ?? true,
      },
      memory: {
        coreMemory: source.profile?.memory?.coreMemory ?? "",
        recentSummary: source.profile?.memory?.recentSummary ?? "",
        forgettingCurve: source.profile?.memory?.forgettingCurve ?? 70,
      },
    },
  };
}

function normalizeCharacterForSave(draft: EditableCharacter): EditableCharacter {
  const normalized = createEditableCharacter(draft);
  const expertDomains = normalized.expertDomains.map((item) => item.trim()).filter(Boolean);

  return {
    ...normalized,
    name: normalized.name.trim(),
    avatar: normalized.avatar.trim(),
    relationship: normalized.relationship.trim(),
    bio: normalized.bio.trim(),
    onlineMode: normalized.onlineMode === "manual" ? "manual" : "auto",
    expertDomains: expertDomains.length ? expertDomains : ["general"],
    triggerScenes: normalized.triggerScenes?.map((item) => item.trim()).filter(Boolean) ?? [],
    activeHoursStart: normalizeOptionalHour(normalized.activeHoursStart),
    activeHoursEnd: normalizeOptionalHour(normalized.activeHoursEnd),
    currentActivity: normalized.currentActivity?.trim() ? normalized.currentActivity : null,
    activityMode: normalized.activityMode === "manual" ? "manual" : "auto",
    profile: {
      ...normalized.profile,
      characterId: normalized.id,
      name: normalized.name.trim(),
      relationship: normalized.relationship.trim(),
      expertDomains: expertDomains.length ? expertDomains : ["general"],
      basePrompt: normalized.profile.basePrompt.trim(),
      systemPrompt: normalized.profile.systemPrompt.trim(),
      memorySummary: normalized.profile.memorySummary.trim(),
      traits: {
        ...normalized.profile.traits,
        speechPatterns: normalized.profile.traits.speechPatterns.map((item) => item.trim()).filter(Boolean),
        catchphrases: normalized.profile.traits.catchphrases.map((item) => item.trim()).filter(Boolean),
        topicsOfInterest: normalized.profile.traits.topicsOfInterest.map((item) => item.trim()).filter(Boolean),
        emotionalTone: normalized.profile.traits.emotionalTone.trim() || "grounded",
      },
      identity: {
        occupation: normalized.profile.identity.occupation.trim(),
        background: normalized.profile.identity.background.trim(),
        motivation: normalized.profile.identity.motivation.trim(),
        worldview: normalized.profile.identity.worldview.trim(),
      },
      behavioralPatterns: {
        workStyle: normalized.profile.behavioralPatterns.workStyle.trim(),
        socialStyle: normalized.profile.behavioralPatterns.socialStyle.trim(),
        taboos: normalized.profile.behavioralPatterns.taboos.map((item) => item.trim()).filter(Boolean),
        quirks: normalized.profile.behavioralPatterns.quirks.map((item) => item.trim()).filter(Boolean),
      },
      cognitiveBoundaries: {
        expertiseDescription: normalized.profile.cognitiveBoundaries.expertiseDescription.trim(),
        knowledgeLimits: normalized.profile.cognitiveBoundaries.knowledgeLimits.trim(),
        refusalStyle: normalized.profile.cognitiveBoundaries.refusalStyle.trim(),
      },
      reasoningConfig: {
        enableCoT: normalized.profile.reasoningConfig.enableCoT,
        enableReflection: normalized.profile.reasoningConfig.enableReflection,
        enableRouting: normalized.profile.reasoningConfig.enableRouting,
      },
      memory: {
        coreMemory: normalized.profile.memory.coreMemory.trim(),
        recentSummary: normalized.profile.memory.recentSummary.trim(),
        forgettingCurve: clamp(normalized.profile.memory.forgettingCurve, 0, 100),
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

function parseForgettingCurve(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return clamp(Math.round(parsed), 0, 100);
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
    睡眠延迟毫秒: { 最小值: constants.sleepDelayMs.min, 最大值: constants.sleepDelayMs.max },
    忙碌延迟毫秒: { 最小值: constants.busyDelayMs.min, 最大值: constants.busyDelayMs.max },
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
      标签: formatNarrativeMilestoneLabel(item.label, constants.narrativePresentationTemplates),
      进度: item.progress,
    })),
    叙事展示模板: {
      关系弧线标题后缀: constants.narrativePresentationTemplates.relationshipArcSuffix,
      里程碑显示标签: { ...constants.narrativePresentationTemplates.milestoneLabels },
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
      角色视图已找到单聊: constants.inspectorTemplates.characterViewHistoryFound,
      角色视图未找到单聊: constants.inspectorTemplates.characterViewHistoryMissing,
      历史窗口内注释: constants.inspectorTemplates.historyIncludedNote,
      历史窗口外注释: constants.inspectorTemplates.historyExcludedNote,
      StoredGroup标题: constants.inspectorTemplates.storedGroupTitle,
      StoredGroup升级说明: constants.inspectorTemplates.storedGroupUpgradedNote,
      StoredGroup下一步说明: constants.inspectorTemplates.storedGroupNextReplyNote,
      DirectBranch标题: constants.inspectorTemplates.directBranchTitle,
      DirectBranch下一步说明: constants.inspectorTemplates.directBranchNextReplyNote,
      FormalGroup标题: constants.inspectorTemplates.formalGroupTitle,
      FormalGroup状态门说明: constants.inspectorTemplates.formalGroupStateGateNote,
      FormalGroup回复规则说明: constants.inspectorTemplates.formalGroupReplyRuleNote,
      预演角色说明: constants.inspectorTemplates.previewCharacterIntro,
      预演角色有历史: constants.inspectorTemplates.previewCharacterWithHistory,
      预演角色无历史: constants.inspectorTemplates.previewCharacterWithoutHistory,
      预演StoredGroup: constants.inspectorTemplates.previewStoredGroup,
      预演DirectConversation: constants.inspectorTemplates.previewDirectConversation,
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
  const { proactiveReminderCheckPrompt, ...rest } = value;
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
      const [monthText, dayText, labelText] = line.split("|").map((item) => item.trim());
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
      const [thresholdText, labelText, progressText] = line.split("|").map((item) => item.trim());
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

function formatConversationSource(source: ReplyLogicOverview["conversations"][number]["source"]) {
  if (source === "group") {
    return "群聊";
  }

  return "单聊";
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

function formatPromptSectionLabel(section: ReplyLogicPromptSection) {
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
  narrativePresentation?: ReplyLogicConstantSummary["narrativePresentationTemplates"] | null,
) {
  if (title.endsWith(" relationship arc")) {
    const suffix = narrativePresentation?.relationshipArcSuffix ?? "关系弧线";
    return `${title.replace(/ relationship arc$/, "")} ${suffix}`;
  }

  return title;
}

function formatNarrativeMilestoneLabel(
  label: string,
  narrativePresentation?: ReplyLogicConstantSummary["narrativePresentationTemplates"] | null,
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
  if (!value) {
    return "未设置";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
