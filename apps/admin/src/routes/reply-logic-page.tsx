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
  AppHeader,
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

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="回复运行控制台"
        title="AI回复逻辑"
        description="在一个页面里同时查看真实回复链路、最终提示词、上下文窗口，并直接修改当前会生效的角色与推理服务配置。"
        actions={
          <Button onClick={() => void refreshAll()} variant="secondary" size="lg">
            刷新快照
          </Button>
        }
      />

      <InlineNotice tone="muted">
        这一版已经支持同页修改角色配置、候选消息预演、运行规则，以及 Prompt 构建模板。右侧保存后会刷新运行时快照。
      </InlineNotice>

      {overviewQuery.isLoading ? <LoadingBlock label="正在读取回复逻辑总览..." /> : null}
      {overviewQuery.isError && overviewQuery.error instanceof Error ? (
        <ErrorBlock message={overviewQuery.error.message} />
      ) : null}

      {overview ? (
        <>
          <OverviewMetrics overview={overview} />

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>查看范围</SectionHeading>
                <div className="mt-4 space-y-4">
                  <SelectFieldBlock
                    label="范围"
                    value={scope}
                    onChange={(value) => setScope(value as InspectorScope)}
                    options={[
                      { value: "character", label: "角色" },
                      { value: "conversation", label: "会话" },
                    ]}
                  />

                  {scope === "character" ? (
                    <SelectFieldBlock
                      label="角色"
                      value={activeCharacterId}
                      onChange={setSelectedCharacterId}
                      options={(overview.characters ?? []).map((item) => ({
                        value: item.id,
                        label: `${item.name} · ${formatActivity(item.currentActivity)}`,
                      }))}
                    />
                  ) : (
                    <SelectFieldBlock
                      label="会话"
                      value={activeConversationId}
                      onChange={setSelectedConversationId}
                      options={(overview.conversations ?? []).map((item) => ({
                        value: item.id,
                        label: `${item.title} · ${formatConversationSource(item.source)}`,
                      }))}
                    />
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>真实运行推理服务</SectionHeading>
                <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
                  <StaticRow
                    label="模型"
                    value={`${overview.provider.model} (${formatProviderModelSource(overview.provider.modelSource)})`}
                  />
                  <StaticRow
                    label="接口地址"
                    value={`${overview.provider.endpoint} (${formatProviderEndpointSource(overview.provider.endpointSource)})`}
                  />
                  <StaticRow
                    label="API 密钥"
                    value={formatProviderApiKeySource(overview.provider.apiKeySource)}
                  />
                  <StaticRow
                    label="实例级模型"
                    value={overview.provider.configuredProviderModel ?? "未设置"}
                  />
                  <StaticRow
                    label="实例级接口地址"
                    value={overview.provider.configuredProviderEndpoint ?? "未设置"}
                  />
                </div>
                {overview.provider.notes.length ? (
                  <div className="mt-4 space-y-2">
                    {overview.provider.notes.map((note) => (
                      <InlineNotice key={note} tone="warning">
                        {formatReplyLogicText(note)}
                      </InlineNotice>
                    ))}
                  </div>
                ) : null}
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>运行时常量</SectionHeading>
                <SnapshotPanel
                  className="mt-4"
                  title="当前生效运行时摘要"
                  value={formatRuntimeConstants(overview.constants)}
                />
              </Card>
            </div>

            <div className="space-y-6">
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
              {scope === "character" ? (
                <CharacterInspectorPanel
                  selectedCharacter={selectedCharacter}
                  query={characterSnapshotQuery}
                />
              ) : (
                <ConversationInspectorPanel
                  selectedConversation={selectedConversation}
                  query={conversationSnapshotQuery}
                />
              )}
            </div>

            <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
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
        </>
      ) : null}
    </div>
  );
}

function OverviewMetrics({ overview }: { overview: ReplyLogicOverview }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="角色数" value={overview.characters.length} />
      <MetricCard label="会话数" value={overview.conversations.length} />
      <MetricCard label="当前模型" value={overview.provider.model} />
      <MetricCard label="世界上下文" value={overview.worldContext?.text || "暂无快照"} />
    </div>
  );
}

function CharacterInspectorPanel({
  selectedCharacter,
  query,
}: {
  selectedCharacter: ReplyLogicOverview["characters"][number] | null;
  query: ReturnType<typeof useQuery<ReplyLogicCharacterSnapshot>>;
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

      <NarrativeCard arcs={query.data.narrativeArc ? [query.data.narrativeArc] : []} />

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
}: {
  selectedConversation: ReplyLogicOverview["conversations"][number] | null;
  query: ReturnType<typeof useQuery<ReplyLogicConversationSnapshot>>;
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

      <NarrativeCard arcs={query.data.narrativeArcs} />
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

function NarrativeCard({ arcs }: { arcs: ReplyLogicNarrativeArcSummary[] }) {
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
                  {formatNarrativeTitle(arc.title)}
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
                    {formatNarrativeMilestoneLabel(item.label)}
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

function StaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="break-all text-sm leading-7 text-[color:var(--text-primary)]">{value}</div>
    </div>
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
  if (gate.mode === "sleep_hint_delay") {
    return "当前活动为睡觉中，会先发送系统提示，再进入延迟回复。";
  }

  if (gate.mode === "busy_hint_delay") {
    return `当前活动为${formatActivity(gate.activity)}，会先发送忙碌提示，再进入延迟回复。`;
  }

  if (gate.mode === "not_applied") {
    return "当前链路不经过单聊状态门控。";
  }

  return "当前状态不会触发额外系统提示，下一条消息会直接进入回复链。";
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
      基础活动权重: constants.activityBaseWeight,
      主动提醒小时: constants.proactiveReminderHour,
    },
    历史窗口: {
      基础值: constants.historyWindow.base,
      浮动范围: constants.historyWindow.range,
      最小值: constants.historyWindow.min,
      最大值: constants.historyWindow.max,
    },
    叙事里程碑: constants.narrativeMilestones.map((item) => ({
      阈值: item.threshold,
      标签: formatNarrativeMilestoneLabel(item.label),
      进度: item.progress,
    })),
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

function formatNarrativeTitle(title: string) {
  if (title.endsWith(" relationship arc")) {
    return `${title.replace(/ relationship arc$/, "")} 关系弧线`;
  }

  return title;
}

function formatNarrativeMilestoneLabel(label: string) {
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
  switch (value) {
    case "系统 Provider Endpoint 已配置，但当前聊天主链路仍优先使用世界主人自定义 Base 或环境变量 OPENAI_BASE_URL。":
      return "系统接口地址已配置，但当前聊天主链路仍优先使用世界主人的自定义地址或环境变量 OPENAI_BASE_URL。";
    case "Provider Model 与聊天主链路实际使用的 ai_model 不一致，页面展示的是当前 generateReply() 真正会拿到的模型。":
      return "系统配置模型与聊天主链路实际使用的 ai_model 不一致，页面展示的是当前 generateReply() 实际会拿到的模型。";
    case "当前实例存在可用 API Key，预览使用真实生成链的 prompt 组装结果。":
      return "当前实例存在可用 API 密钥，预览使用真实生成链的提示词组装结果。";
    case "当前实例没有可用 API Key，实际聊天会返回“先配置 API Key”的兜底提示。":
      return "当前实例没有可用 API 密钥，实际聊天会返回“先配置 API 密钥”的兜底提示。";
    case "群聊 prompt 不会注入单聊 lastChatAt/currentActivity 的行为上下文。":
      return "群聊提示词不会注入单聊的上次聊天时间和当前活动上下文。";
    case "单聊 prompt 会注入 currentActivity 和距离上次聊天时间。":
      return "单聊提示词会注入当前活动以及距离上次聊天的时间。";
    case "临时群聊已转为 stored conversation":
      return "临时群聊已转为持久化会话";
    case "当前会话来自 conversations 表，但类型已经升级为 group。":
      return "当前会话来自 conversations 表，但类型已经升级为群聊。";
    case "下一次用户消息会直接按 group 分支让所有参与角色回复。":
      return "下一次用户消息会直接按群聊分支，让所有参与角色回复。";
    default:
      return value;
  }
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
