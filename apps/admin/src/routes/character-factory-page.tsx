import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import type {
  CharacterBlueprintRecipe,
  CharacterBlueprintRevision,
  CharacterFactorySnapshot,
} from "@yinjie/contracts";
import { getSystemStatus, isCustomRelationshipType } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  InlineNotice,
  MetricCard,
  SectionHeading,
  StatusPill,
  ToggleChip,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminActionFeedback,
  AdminCodeBlock as CodeBlock,
  AdminErrorState,
  AdminInfoRows,
  AdminPanelEmpty,
  AdminPageHero,
  AdminRecordCard,
  AdminSectionHeader,
  AdminSkeletonCard,
  AdminTabs,
  AdminSelectField as SelectFieldBlock,
  AdminTextArea as TextAreaBlock,
  AdminTextField as FieldBlock,
  AdminValueCard as ValueSnapshot,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";
import { CharacterWorkspaceNav } from "../components/character-workspace-nav";

const ACTIVITY_LABEL_MESSAGES: Record<string, ReturnType<typeof msg>> = {
  "": msg`未设置`,
  free: msg`空闲`,
  working: msg`工作中`,
  eating: msg`吃饭中`,
  resting: msg`休息中`,
  commuting: msg`通勤中`,
  sleeping: msg`睡觉中`,
};

function buildActivityOptions(): Array<{ value: string; label: string }> {
  return Object.entries(ACTIVITY_LABEL_MESSAGES).map(([value, message]) => ({
    value,
    label: translateRuntimeMessage(message),
  }));
}

const FACTORY_TABS: Array<{ key: string; label: ReturnType<typeof msg> }> = [
  { key: "ai", label: msg`AI 辅助` },
  { key: "identity", label: msg`身份关系` },
  { key: "expertise", label: msg`能力边界` },
  { key: "tone", label: msg`语气与场景提示词` },
  { key: "memory", label: msg`记忆策略` },
  { key: "publish", label: msg`推理发布` },
  { key: "versions", label: msg`版本 Diff` },
];

const SCENE_PROMPT_SECTIONS: Array<{
  title: ReturnType<typeof msg>;
  items: Array<{
    key: keyof CharacterBlueprintRecipe["prompting"]["scenePrompts"];
    label: ReturnType<typeof msg>;
  }>;
}> = [
  {
    title: msg`底层与聊天`,
    items: [{ key: "chat", label: msg`聊天场景提示词` }],
  },
  {
    title: msg`主动发布`,
    items: [
      { key: "moments_post", label: msg`发朋友圈` },
      { key: "feed_post", label: msg`发 Feed 贴文` },
      { key: "channel_post", label: msg`发视频号内容` },
    ],
  },
  {
    title: msg`互动响应`,
    items: [
      { key: "moments_comment", label: msg`朋友圈评论 / 回复` },
      { key: "feed_comment", label: msg`Feed 评论` },
      { key: "greeting", label: msg`好友请求 / 摇一摇问候` },
      { key: "proactive", label: msg`主动提醒` },
    ],
  },
];

export function CharacterFactoryPage() {
  const t = translateRuntimeMessage;
  const { characterId } = useParams({
    from: "/characters/$characterId/factory",
  });
  const queryClient = useQueryClient();
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [draft, setDraft] = useState<CharacterBlueprintRecipe | null>(null);
  const [publishSummary, setPublishSummary] = useState("");
  const [generationPersonName, setGenerationPersonName] = useState("");
  const [generationSample, setGenerationSample] = useState("");
  const [activeTab, setActiveTab] = useState("identity");
  const activityOptions = useMemo(buildActivityOptions, []);

  const factoryQuery = useQuery({
    queryKey: ["admin-character-factory", characterId],
    queryFn: () => adminApi.getCharacterFactory(characterId),
  });
  const revisionsQuery = useQuery({
    queryKey: ["admin-character-factory-revisions", characterId],
    queryFn: () => adminApi.listCharacterFactoryRevisions(characterId),
  });
  const systemStatusQuery = useQuery({
    queryKey: ["admin-character-factory-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });
  const draftRecipe = factoryQuery.data?.blueprint.draftRecipe ?? null;
  const lastGeneratedPersonName =
    factoryQuery.data?.blueprint.lastAiGeneration?.personName ?? "";

  const seedSignature = useMemo(
    () => (draftRecipe ? JSON.stringify(draftRecipe) : ""),
    [draftRecipe],
  );

  useEffect(() => {
    setDraft(draftRecipe);
  }, [draftRecipe]);

  useEffect(() => {
    setGenerationPersonName(
      lastGeneratedPersonName || draftRecipe?.identity.name || "",
    );
  }, [draftRecipe?.identity.name, lastGeneratedPersonName]);

  const isDirty = useMemo(() => {
    if (!draft || !seedSignature) {
      return false;
    }
    return JSON.stringify(draft) !== seedSignature;
  }, [draft, seedSignature]);

  // 选了「自定义」关系类型但没填字符串（或停留在字面 "custom" 哨兵值）→ 禁止保存
  const relationshipTypeValid = (() => {
    const v = draft?.identity.relationshipType ?? "";
    if (!isCustomRelationshipType(v)) return true;
    return v !== "" && v !== "custom";
  })();

  async function invalidateFactory() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin-character-factory", characterId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin-character-factory-revisions", characterId],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin-characters-crud"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-characters"] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: CharacterBlueprintRecipe) =>
      adminApi.updateCharacterFactory(
        characterId,
        payload as unknown as Record<string, unknown>,
      ),
    onSuccess: async () => {
      await invalidateFactory();
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () =>
      adminApi.publishCharacterFactory(characterId, publishSummary),
    onSuccess: async () => {
      setPublishSummary("");
      await invalidateFactory();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (revisionId: string) =>
      adminApi.restoreCharacterFactoryRevision(characterId, revisionId),
    onSuccess: async () => {
      await invalidateFactory();
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async () =>
      adminApi.generateCharacterFactoryDraft(characterId, {
        personName: generationPersonName.trim() || null,
        chatSample: generationSample,
      }),
    onSuccess: async () => {
      await invalidateFactory();
    },
  });

  function patchDraft(
    updater: (current: CharacterBlueprintRecipe) => CharacterBlueprintRecipe,
  ) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  if (factoryQuery.isLoading) {
    return <AdminSkeletonCard rows={6} showAction />;
  }

  if (factoryQuery.isError && factoryQuery.error instanceof Error) {
    return (
      <AdminErrorState
        title={t(msg`角色工厂加载失败`)}
        detail={factoryQuery.error.message}
        onRetry={() => factoryQuery.refetch()}
      />
    );
  }

  if (!factoryQuery.data || !draft) {
    return (
      <AdminErrorState
        title={t(msg`角色工厂数据暂不可用`)}
        detail={t(msg`未能从远程获取到工厂快照。`)}
        onRetry={() => factoryQuery.refetch()}
      />
    );
  }

  const snapshot = factoryQuery.data;
  const revisions = revisionsQuery.data ?? [];
  const driftFieldCount = snapshot.fieldSources.filter(
    (item) => item.status === "runtime_drift",
  ).length;
  const changedPublishItems = snapshot.publishDiff.items.filter(
    (item) => item.changed,
  );
  const digitalHumanSummary = buildDigitalHumanAdminSummary(
    systemStatusQuery.data?.digitalHumanGateway,
  );

  return (
    <div className="space-y-6">
      <CharacterWorkspaceNav characterId={characterId} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminPageHero
          eyebrow={t(msg`角色工厂`)}
          title={snapshot.character.name}
          description={t(msg`在这里定义角色配方、查看发布版本、对比草稿差异，并把制造阶段的设定发布到运行时实体。`)}
          actions={
            <>
              <Link to="/characters">
                <Button variant="secondary" size="lg">
                  {t(msg`返回角色中心`)}
                </Button>
              </Link>
              <Link to="/characters/$characterId" params={{ characterId }}>
                <Button variant="secondary" size="lg">
                  {t(msg`基础资料`)}
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  setDraft(factoryQuery.data?.blueprint.draftRecipe ?? null)
                }
                disabled={!isDirty}
              >
                {t(msg`重置草稿`)}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => draft && saveMutation.mutate(draft)}
                disabled={
                  !isDirty || !relationshipTypeValid || saveMutation.isPending
                }
                title={
                  !relationshipTypeValid
                    ? t(
                        msg`选择「自定义」关系类型时需要填入具体值（≤ 15 字）`,
                      )
                    : undefined
                }
              >
                {saveMutation.isPending ? t(msg`保存中...`) : t(msg`保存草稿`)}
              </Button>
            </>
          }
          metrics={[
            {
              label: t(msg`来源`),
              value: formatSourceType(snapshot.blueprint.sourceType),
            },
            { label: t(msg`状态`), value: formatStatus(snapshot.blueprint.status) },
            {
              label: t(msg`已发布版本`),
              value: snapshot.blueprint.publishedVersion || 0,
            },
            {
              label: t(msg`未发布变更`),
              value: snapshot.diffSummary.hasUnpublishedChanges ? t(msg`有`) : t(msg`无`),
            },
          ]}
        />

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>{t(msg`当前状态`)}</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label={t(msg`运行态漂移字段`)} value={driftFieldCount} />
            <MetricCard
              label={t(msg`发布将覆盖字段`)}
              value={snapshot.publishDiff.changedCount}
            />
            <MetricCard
              label={t(msg`草稿变更字段`)}
              value={snapshot.diffSummary.changedFields.length}
            />
            <MetricCard label={t(msg`版本记录`)} value={revisions.length} />
          </div>
        </Card>
      </div>

      <AdminCallout
        tone={digitalHumanSummary.ready ? "success" : "warning"}
        title={
          digitalHumanSummary.ready
            ? t(msg`数字人链路已进入可联调状态`)
            : t(msg`数字人当前阻塞：${digitalHumanSummary.statusLabel}`)
        }
        description={t(msg`${digitalHumanSummary.description} ${digitalHumanSummary.nextStep}`)}
      />

      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`保存草稿失败`)}
          detail={saveMutation.error.message}
          onRetry={() => saveMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {publishMutation.isError && publishMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`发布到运行时失败`)}
          detail={publishMutation.error.message}
          onRetry={() => publishMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {restoreMutation.isError && restoreMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`恢复版本失败`)}
          detail={restoreMutation.error.message}
          onRetry={() => restoreMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}
      {aiGenerateMutation.isError &&
      aiGenerateMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`AI 生成失败`)}
          detail={aiGenerateMutation.error.message}
          onRetry={() => aiGenerateMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}

      <InlineNotice tone="muted">
        {t(msg`工厂页改的是角色配方。只有点击"发布到运行时"后，配方才会映射到当前 \`Character\` 实体并影响真实对话与生活逻辑。`)}
      </InlineNotice>

      {/* Tab 导航 */}
      <AdminTabs
        tabs={FACTORY_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {/* Tab: AI 辅助 */}
          {activeTab === "ai" ? (
            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeading>{t(msg`AI 辅助制造`)}</SectionHeading>
              <InlineNotice className="mt-4" tone="muted">
                {t(msg`输入一段角色聊天样本后，后台会走人格提取链，把可结构化的语气、口头禅、兴趣、情绪基调和记忆摘要写回工厂草稿。`)}
              </InlineNotice>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label={t(msg`样本人名`)}
                  value={generationPersonName}
                  onChange={setGenerationPersonName}
                  placeholder={t(msg`角色名字`)}
                />
              </div>
              <TextAreaBlock
                label={t(msg`聊天样本`)}
                value={generationSample}
                onChange={setGenerationSample}
                placeholder={t(msg`贴一段足够体现说话风格的聊天样本。`)}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setGenerationSample("")}
                  disabled={!generationSample.trim()}
                >
                  {t(msg`清空样本`)}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => aiGenerateMutation.mutate()}
                  disabled={
                    !generationSample.trim() || aiGenerateMutation.isPending
                  }
                >
                  {aiGenerateMutation.isPending
                    ? t(msg`生成中...`)
                    : t(msg`生成并写入草稿`)}
                </Button>
              </div>
              {snapshot.blueprint.lastAiGeneration ? (
                <div className="mt-6 space-y-4">
                  <SectionHeading>{t(msg`最近一次 AI 制造链路`)}</SectionHeading>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ValueSnapshot
                      label={t(msg`样本人名`)}
                      value={snapshot.blueprint.lastAiGeneration.personName}
                    />
                    <ValueSnapshot
                      label={t(msg`生成时间`)}
                      value={formatDateTime(
                        snapshot.blueprint.lastAiGeneration.requestedAt,
                      )}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {snapshot.blueprint.lastAiGeneration.appliedFields.map(
                      (field) => (
                        <StatusPill key={field} tone="warning">
                          {field}
                        </StatusPill>
                      ),
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {t(msg`聊天样本`)}
                    </div>
                    <CodeBlock
                      value={snapshot.blueprint.lastAiGeneration.chatSample}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {t(msg`提取 Prompt`)}
                    </div>
                    <CodeBlock
                      value={snapshot.blueprint.lastAiGeneration.prompt}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {t(msg`结构化结果`)}
                    </div>
                    <CodeBlock
                      value={JSON.stringify(
                        snapshot.blueprint.lastAiGeneration.extractedProfile,
                        null,
                        2,
                      )}
                    />
                  </div>
                </div>
              ) : (
                <InlineNotice className="mt-4" tone="muted">
                  {t(msg`当前还没有 AI 辅助制造记录。`)}
                </InlineNotice>
              )}
            </Card>
          ) : null}

          {/* Tab: 身份关系 */}
          {activeTab === "identity" ? (
            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeading>{t(msg`身份与关系`)}</SectionHeading>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label={t(msg`名称`)}
                  value={draft.identity.name}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      identity: { ...current.identity, name: value },
                    }))
                  }
                />
                <FieldBlock
                  label={t(msg`关系描述`)}
                  value={draft.identity.relationship}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      identity: { ...current.identity, relationship: value },
                    }))
                  }
                />
                <div className="space-y-2">
                  <SelectFieldBlock
                    label={t(msg`关系类型`)}
                    value={
                      isCustomRelationshipType(draft.identity.relationshipType)
                        ? "custom"
                        : draft.identity.relationshipType
                    }
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        identity: {
                          ...current.identity,
                          // 选「自定义」清空 relationshipType，等待用户在下方输入框填具体值
                          relationshipType: value === "custom" ? "" : value,
                        },
                      }))
                    }
                    options={[
                      { value: "family", label: t(msg`家人`) },
                      { value: "friend", label: t(msg`朋友`) },
                      { value: "expert", label: t(msg`专家`) },
                      { value: "mentor", label: t(msg`导师`) },
                      { value: "custom", label: t(msg`自定义`) },
                      { value: "self", label: t(msg`自己`) },
                    ]}
                  />
                  {isCustomRelationshipType(draft.identity.relationshipType) && (
                    <FieldBlock
                      label={t(msg`自定义关系类型`)}
                      placeholder={t(msg`例如 师傅 / 房东 / 邻居`)}
                      maxLength={15}
                      value={
                        draft.identity.relationshipType === "custom"
                          ? ""
                          : draft.identity.relationshipType
                      }
                      onChange={(value) =>
                        patchDraft((current) => ({
                          ...current,
                          identity: {
                            ...current.identity,
                            relationshipType: value,
                          },
                        }))
                      }
                    />
                  )}
                </div>
                <FieldBlock
                  label={t(msg`头像`)}
                  value={draft.identity.avatar}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      identity: { ...current.identity, avatar: value },
                    }))
                  }
                />
                <FieldBlock
                  label={t(msg`职业`)}
                  value={draft.identity.occupation}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      identity: { ...current.identity, occupation: value },
                    }))
                  }
                />
              </div>
              <TextAreaBlock
                label={t(msg`简介`)}
                value={draft.identity.bio}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, bio: value },
                  }))
                }
              />
              <TextAreaBlock
                label={t(msg`背景`)}
                value={draft.identity.background}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, background: value },
                  }))
                }
              />
              <TextAreaBlock
                label={t(msg`核心动机`)}
                value={draft.identity.motivation}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, motivation: value },
                  }))
                }
              />
              <TextAreaBlock
                label={t(msg`世界观`)}
                value={draft.identity.worldview}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, worldview: value },
                  }))
                }
              />
            </Card>
          ) : null}

          {/* Tab: 能力边界 */}
          {activeTab === "expertise" ? (
            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeading>{t(msg`能力域与边界`)}</SectionHeading>
              <div className="mt-4 space-y-4">
                <FieldBlock
                  label={t(msg`擅长领域`)}
                  value={listToCsv(draft.expertise.expertDomains)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      expertise: {
                        ...current.expertise,
                        expertDomains: csvToList(value),
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`专长描述`)}
                  value={draft.expertise.expertiseDescription}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      expertise: {
                        ...current.expertise,
                        expertiseDescription: value,
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`知识边界`)}
                  value={draft.expertise.knowledgeLimits}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      expertise: {
                        ...current.expertise,
                        knowledgeLimits: value,
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`超界拒绝方式`)}
                  value={draft.expertise.refusalStyle}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      expertise: { ...current.expertise, refusalStyle: value },
                    }))
                  }
                />
              </div>
            </Card>
          ) : null}

          {/* Tab: 语气行为 */}
          {activeTab === "tone" ? (
            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeading>{t(msg`语气、底层逻辑与场景提示词`)}</SectionHeading>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock
                    label={t(msg`情绪基调`)}
                    value={draft.tone.emotionalTone}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: { ...current.tone, emotionalTone: value },
                      }))
                    }
                  />
                  <SelectFieldBlock
                    label={t(msg`回复长度`)}
                    value={draft.tone.responseLength}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: {
                          ...current.tone,
                          responseLength:
                            value as CharacterBlueprintRecipe["tone"]["responseLength"],
                        },
                      }))
                    }
                    options={[
                      { value: "short", label: t(msg`简短`) },
                      { value: "medium", label: t(msg`适中`) },
                      { value: "long", label: t(msg`详细`) },
                    ]}
                  />
                  <SelectFieldBlock
                    label={t(msg`表情使用`)}
                    value={draft.tone.emojiUsage}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: {
                          ...current.tone,
                          emojiUsage:
                            value as CharacterBlueprintRecipe["tone"]["emojiUsage"],
                        },
                      }))
                    }
                    options={[
                      { value: "none", label: t(msg`不用`) },
                      { value: "occasional", label: t(msg`偶尔`) },
                      { value: "frequent", label: t(msg`频繁`) },
                    ]}
                  />
                  <FieldBlock
                    label={t(msg`工作风格`)}
                    value={draft.tone.workStyle}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: { ...current.tone, workStyle: value },
                      }))
                    }
                  />
                  <FieldBlock
                    label={t(msg`社交风格`)}
                    value={draft.tone.socialStyle}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: { ...current.tone, socialStyle: value },
                      }))
                    }
                  />
                </div>
                <FieldBlock
                  label={t(msg`说话习惯`)}
                  value={listToCsv(draft.tone.speechPatterns)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: {
                        ...current.tone,
                        speechPatterns: csvToList(value),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label={t(msg`口头禅`)}
                  value={listToCsv(draft.tone.catchphrases)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: { ...current.tone, catchphrases: csvToList(value) },
                    }))
                  }
                />
                <FieldBlock
                  label={t(msg`兴趣话题`)}
                  value={listToCsv(draft.tone.topicsOfInterest)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: {
                        ...current.tone,
                        topicsOfInterest: csvToList(value),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label={t(msg`语言禁忌`)}
                  value={listToCsv(draft.tone.taboos)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: { ...current.tone, taboos: csvToList(value) },
                    }))
                  }
                />
                <FieldBlock
                  label={t(msg`个人癖好`)}
                  value={listToCsv(draft.tone.quirks)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: { ...current.tone, quirks: csvToList(value) },
                    }))
                  }
                />
              </div>
              <div className="mt-6 border-t border-[color:var(--border-faint)] pt-5 space-y-6">
                <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  {t(msg`新提示词架构`)}
                </div>
                <InlineNotice tone="muted">
                  {t(msg`角色工厂现在优先维护 \`coreLogic + scenePrompts\`。这些字段会直接进入真实回复、发帖、评论和主动提醒链路。`)}
                </InlineNotice>
                <TextAreaBlock
                  label={t(msg`底层逻辑`)}
                  value={draft.prompting.coreLogic}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      prompting: { ...current.prompting, coreLogic: value },
                    }))
                  }
                />
                {SCENE_PROMPT_SECTIONS.map((section) => (
                  <div key={section.title.id} className="space-y-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                      {t(section.title)}
                    </div>
                    {section.items.map((item) => (
                      <TextAreaBlock
                        key={item.key}
                        label={t(item.label)}
                        value={draft.prompting.scenePrompts[item.key]}
                        onChange={(value) =>
                          patchDraft((current) => ({
                            ...current,
                            prompting: {
                              ...current.prompting,
                              scenePrompts: {
                                ...current.prompting.scenePrompts,
                                [item.key]: value,
                              },
                            },
                          }))
                        }
                      />
                    ))}
                  </div>
                ))}
                <div className="space-y-4 border-t border-[color:var(--border-faint)] pt-5">
                  <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                    {t(msg`兼容字段`)}
                  </div>
                  <InlineNotice tone="muted">
                    {t(msg`以下字段仅用于兼容旧角色和旧提示词链路。新角色默认以新提示词架构为主。`)}
                  </InlineNotice>
                  <TextAreaBlock
                    label={t(msg`行动纲领（兼容）`)}
                    value={draft.tone.coreDirective ?? ""}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: { ...current.tone, coreDirective: value },
                      }))
                    }
                  />
                  <TextAreaBlock
                    label={t(msg`基础提示词（兼容）`)}
                    value={draft.tone.basePrompt}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: { ...current.tone, basePrompt: value },
                      }))
                    }
                  />
                  <TextAreaBlock
                    label={t(msg`系统提示词（兼容）`)}
                    value={draft.tone.systemPrompt}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        tone: { ...current.tone, systemPrompt: value },
                      }))
                    }
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {/* Tab: 记忆策略 */}
          {activeTab === "memory" ? (
            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeading>{t(msg`记忆底稿与生活策略`)}</SectionHeading>
              <div className="mt-4 space-y-4">
                <TextAreaBlock
                  label={t(msg`记忆摘要`)}
                  value={draft.memorySeed.memorySummary}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      memorySeed: {
                        ...current.memorySeed,
                        memorySummary: value,
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`核心记忆`)}
                  value={draft.memorySeed.coreMemory}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      memorySeed: { ...current.memorySeed, coreMemory: value },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`近期摘要初始值`)}
                  value={draft.memorySeed.recentSummarySeed}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      memorySeed: {
                        ...current.memorySeed,
                        recentSummarySeed: value,
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`近期摘要提取提示词`)}
                  value={draft.memorySeed.recentSummaryPrompt}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      memorySeed: {
                        ...current.memorySeed,
                        recentSummaryPrompt: value,
                      },
                    }))
                  }
                />
                <TextAreaBlock
                  label={t(msg`核心记忆提取提示词`)}
                  value={draft.memorySeed.coreMemoryPrompt}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      memorySeed: {
                        ...current.memorySeed,
                        coreMemoryPrompt: value,
                      },
                    }))
                  }
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldBlock
                    label={t(msg`遗忘曲线`)}
                    value={draft.memorySeed.forgettingCurve}
                    type="number"
                    min={0}
                    max={100}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        memorySeed: {
                          ...current.memorySeed,
                          forgettingCurve: parseIntWithFallback(
                            value,
                            current.memorySeed.forgettingCurve,
                          ),
                        },
                      }))
                    }
                  />
                  <SelectFieldBlock
                    label={t(msg`活动频率`)}
                    value={draft.lifeStrategy.activityFrequency}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        lifeStrategy: {
                          ...current.lifeStrategy,
                          activityFrequency: value,
                        },
                      }))
                    }
                    options={[
                      { value: "high", label: t(msg`高频`) },
                      { value: "normal", label: t(msg`中频`) },
                      { value: "low", label: t(msg`低频`) },
                    ]}
                  />
                  <FieldBlock
                    label={t(msg`朋友圈频率`)}
                    value={draft.lifeStrategy.momentsFrequency}
                    type="number"
                    min={0}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        lifeStrategy: {
                          ...current.lifeStrategy,
                          momentsFrequency: parseIntWithFallback(
                            value,
                            current.lifeStrategy.momentsFrequency,
                          ),
                        },
                      }))
                    }
                  />
                  <FieldBlock
                    label={t(msg`视频号频率`)}
                    value={draft.lifeStrategy.feedFrequency}
                    type="number"
                    min={0}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        lifeStrategy: {
                          ...current.lifeStrategy,
                          feedFrequency: parseIntWithFallback(
                            value,
                            current.lifeStrategy.feedFrequency,
                          ),
                        },
                      }))
                    }
                  />
                  <FieldBlock
                    label={t(msg`活跃开始小时`)}
                    value={draft.lifeStrategy.activeHoursStart ?? ""}
                    type="number"
                    min={0}
                    max={23}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        lifeStrategy: {
                          ...current.lifeStrategy,
                          activeHoursStart: parseOptionalHour(value),
                        },
                      }))
                    }
                  />
                  <FieldBlock
                    label={t(msg`活跃结束小时`)}
                    value={draft.lifeStrategy.activeHoursEnd ?? ""}
                    type="number"
                    min={0}
                    max={23}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        lifeStrategy: {
                          ...current.lifeStrategy,
                          activeHoursEnd: parseOptionalHour(value),
                        },
                      }))
                    }
                  />
                </div>
                <FieldBlock
                  label={t(msg`触发场景`)}
                  value={listToCsv(draft.lifeStrategy.triggerScenes)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      lifeStrategy: {
                        ...current.lifeStrategy,
                        triggerScenes: csvToList(value),
                      },
                    }))
                  }
                />
              </div>
            </Card>
          ) : null}

          {/* Tab: 推理发布 */}
          {activeTab === "publish" ? (
            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>{t(msg`推理与路由`)}</SectionHeading>
                <InlineNotice className="mt-4" tone="muted">
                  {t(msg`这里定义发布后角色默认带上的推理开关，而不是运行时临时覆盖值。`)}
                </InlineNotice>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ToggleChip
                    label={t(msg`启用链路推理`)}
                    checked={draft.reasoning.enableCoT}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        reasoning: {
                          ...current.reasoning,
                          enableCoT: event.currentTarget.checked,
                        },
                      }))
                    }
                  />
                  <ToggleChip
                    label={t(msg`启用反思`)}
                    checked={draft.reasoning.enableReflection}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        reasoning: {
                          ...current.reasoning,
                          enableReflection: event.currentTarget.checked,
                        },
                      }))
                    }
                  />
                  <ToggleChip
                    label={t(msg`启用路由`)}
                    checked={draft.reasoning.enableRouting}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        reasoning: {
                          ...current.reasoning,
                          enableRouting: event.currentTarget.checked,
                        },
                      }))
                    }
                  />
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>{t(msg`发布映射`)}</SectionHeading>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <SelectFieldBlock
                    label={t(msg`在线模式默认值`)}
                    value={draft.publishMapping.onlineModeDefault}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        publishMapping: {
                          ...current.publishMapping,
                          onlineModeDefault:
                            value === "manual" ? "manual" : "auto",
                        },
                      }))
                    }
                    options={[
                      { value: "auto", label: t(msg`自动调度`) },
                      { value: "manual", label: t(msg`人工锁定`) },
                    ]}
                  />
                  <SelectFieldBlock
                    label={t(msg`活动模式默认值`)}
                    value={draft.publishMapping.activityModeDefault}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        publishMapping: {
                          ...current.publishMapping,
                          activityModeDefault:
                            value === "manual" ? "manual" : "auto",
                        },
                      }))
                    }
                    options={[
                      { value: "auto", label: t(msg`自动调度`) },
                      { value: "manual", label: t(msg`人工锁定`) },
                    ]}
                  />
                  <FieldBlock
                    label={t(msg`初始在线状态`)}
                    value={draft.publishMapping.initialOnline ? t(msg`在线`) : t(msg`离线`)}
                    disabled
                    onChange={() => undefined}
                  />
                  <SelectFieldBlock
                    label={t(msg`初始活动`)}
                    value={draft.publishMapping.initialActivity ?? ""}
                    onChange={(value) =>
                      patchDraft((current) => ({
                        ...current,
                        publishMapping: {
                          ...current.publishMapping,
                          initialActivity: value || null,
                        },
                      }))
                    }
                    options={activityOptions}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ToggleChip
                    label={t(msg`作为模板发布`)}
                    checked={draft.publishMapping.isTemplate}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        publishMapping: {
                          ...current.publishMapping,
                          isTemplate: event.currentTarget.checked,
                        },
                      }))
                    }
                  />
                  <ToggleChip
                    label={t(msg`发布后初始在线`)}
                    checked={draft.publishMapping.initialOnline}
                    onChange={(event) =>
                      patchDraft((current) => ({
                        ...current,
                        publishMapping: {
                          ...current.publishMapping,
                          initialOnline: event.currentTarget.checked,
                        },
                      }))
                    }
                  />
                </div>
              </Card>
            </div>
          ) : null}

          {/* Tab: 版本 Diff */}
          {activeTab === "versions" ? (
            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>{t(msg`草稿差异`)}</SectionHeading>
                {snapshot.diffSummary.changedFields.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {snapshot.diffSummary.changedFields.map((field) => (
                      <StatusPill key={field} tone="warning">
                        {field}
                      </StatusPill>
                    ))}
                  </div>
                ) : (
                  <AdminActionFeedback
                    className="mt-4"
                    tone="success"
                    title={t(msg`当前草稿已同步`)}
                    description={t(msg`当前草稿与已发布版本一致。`)}
                  />
                )}
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="bg-[color:var(--surface-console)]">
                  <SectionHeading>{t(msg`字段来源`)}</SectionHeading>
                  <InlineNotice
                    className="mt-4"
                    tone={driftFieldCount > 0 ? "warning" : "muted"}
                  >
                    {t(msg`这里展示运行时 \`Character\` 字段来自哪个配方字段，以及当前运行态是否已经偏离上次发布结果。`)}
                  </InlineNotice>
                  <div className="mt-4 space-y-3">
                    {snapshot.fieldSources.map((item) => (
                      <AdminRecordCard
                        key={`${item.targetField}-${item.recipeField}`}
                        title={item.label}
                        badges={
                          <StatusPill
                            tone={
                              item.status === "runtime_drift"
                                ? "warning"
                                : item.status === "draft_only"
                                  ? "muted"
                                  : "healthy"
                            }
                          >
                            {formatFieldSourceStatus(item.status)}
                          </StatusPill>
                        }
                        meta={
                          <>
                            {item.targetField} ← {item.recipeField}
                          </>
                        }
                        description={item.note}
                        details={
                          <div className="grid gap-3 md:grid-cols-3">
                            <ValueSnapshot
                              label={t(msg`运行时`)}
                              value={item.runtimeValue}
                            />
                            <ValueSnapshot
                              label={t(msg`已发布`)}
                              value={item.publishedValue}
                            />
                            <ValueSnapshot
                              label={t(msg`草稿`)}
                              value={item.draftValue}
                            />
                          </div>
                        }
                      />
                    ))}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <SectionHeading>{t(msg`发布映射 Diff`)}</SectionHeading>
                  <InlineNotice
                    className="mt-4"
                    tone={changedPublishItems.length ? "warning" : "success"}
                  >
                    {changedPublishItems.length
                      ? t(msg`当前草稿一旦发布，会覆盖 ${changedPublishItems.length} 个运行时字段。`)
                      : t(msg`当前运行时与草稿发布结果一致，发布不会改动角色实体。`)}
                  </InlineNotice>
                  <div className="mt-4 space-y-3">
                    {changedPublishItems.map((item) => (
                      <AdminRecordCard
                        key={`${item.targetField}-${item.recipeField}`}
                        title={item.label}
                        badges={
                          <StatusPill tone="warning">{t(msg`发布后变更`)}</StatusPill>
                        }
                        meta={
                          <>
                            {item.targetField} ← {item.recipeField}
                          </>
                        }
                        details={
                          <div className="grid gap-3 md:grid-cols-2">
                            <ValueSnapshot
                              label={t(msg`当前运行时`)}
                              value={item.currentValue}
                            />
                            <ValueSnapshot
                              label={t(msg`发布后`)}
                              value={item.nextValue}
                            />
                          </div>
                        }
                      />
                    ))}
                    {changedPublishItems.length === 0 ? (
                      <AdminPanelEmpty message={t(msg`当前没有需要覆盖的运行态字段。`)} />
                    ) : null}
                    {snapshot.publishDiff.items.length >
                    changedPublishItems.length ? (
                      <div className="text-sm text-[color:var(--text-muted)]">
                        {t(msg`其余 ${snapshot.publishDiff.items.length - changedPublishItems.length} 个字段发布后保持不变。`)}
                      </div>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>{t(msg`版本记录`)}</SectionHeading>
                {revisionsQuery.isLoading ? (
                  <AdminSkeletonCard className="mt-4" rows={3} />
                ) : null}
                {revisionsQuery.isError &&
                revisionsQuery.error instanceof Error ? (
                  <AdminErrorState
                    className="mt-4"
                    title={t(msg`加载版本失败`)}
                    detail={revisionsQuery.error.message}
                    onRetry={() => revisionsQuery.refetch()}
                  />
                ) : null}
                <div className="mt-4 space-y-4">
                  {revisions.map((revision) => (
                    <AdminRecordCard
                      key={revision.id}
                      title={revision.summary?.trim() || t(msg`无发布说明`)}
                      badges={
                        <>
                          <StatusPill tone="muted">
                            v{revision.version}
                          </StatusPill>
                          <StatusPill tone="muted">
                            {formatChangeSource(revision.changeSource)}
                          </StatusPill>
                        </>
                      }
                      meta={formatDateTime(revision.createdAt)}
                      actions={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => restoreMutation.mutate(revision.id)}
                          disabled={
                            restoreMutation.isPending &&
                            restoreMutation.variables === revision.id
                          }
                        >
                          {restoreMutation.isPending &&
                          restoreMutation.variables === revision.id
                            ? t(msg`恢复中...`)
                            : t(msg`恢复到草稿`)}
                        </Button>
                      }
                    />
                  ))}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <SectionHeading>{t(msg`已发布快照`)}</SectionHeading>
                <CodeBlock
                  className="mt-4"
                  value={JSON.stringify(
                    snapshot.blueprint.publishedRecipe ?? {},
                    null,
                    2,
                  )}
                />
              </Card>
            </div>
          ) : null}
        </div>

        {/* 右侧：发布操作 & 状态（始终可见） */}
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`发布操作`)}
              actions={
                <StatusPill
                  tone={publishMutation.isPending ? "warning" : "muted"}
                >
                  {publishMutation.isPending ? t(msg`发布中`) : t(msg`等待发布`)}
                </StatusPill>
              }
            />
            <TextAreaBlock
              label={t(msg`发布说明`)}
              value={publishSummary}
              placeholder={t(msg`这次发布改了什么`)}
              onChange={setPublishSummary}
            />
            {publishMutation.isSuccess ? (
              <AdminActionFeedback
                tone="success"
                title={t(msg`草稿已发布`)}
                description={t(msg`运行时实体已经更新为最新草稿。`)}
              />
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? t(msg`发布中...`) : t(msg`发布到运行时`)}
              </Button>
            </div>
          </Card>

          <AdminInfoRows
            title={t(msg`运营提示`)}
            rows={[
              { label: t(msg`草稿状态`), value: isDirty ? t(msg`有未保存变更`) : t(msg`已同步`) },
              {
                label: t(msg`发布状态`),
                value: snapshot.diffSummary.hasUnpublishedChanges
                  ? t(msg`待发布`)
                  : t(msg`已发布同步`),
              },
              { label: t(msg`建议流程`), value: t(msg`先改草稿，再看 Diff，最后发布`) },
            ]}
          />
        </div>
      </div>
    </div>
  );
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

function parseIntWithFallback(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : Math.round(parsed);
}

function parseOptionalHour(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.min(Math.max(Math.round(parsed), 0), 23);
}

function formatSourceType(
  value: CharacterFactorySnapshot["blueprint"]["sourceType"],
) {
  const t = translateRuntimeMessage;
  switch (value) {
    case "default_seed":
      return t(msg`内置默认角色`);
    case "preset_catalog":
      return t(msg`预设目录角色`);
    case "manual_admin":
      return t(msg`后台手工角色`);
    case "template_clone":
      return t(msg`模板克隆`);
    case "ai_generated":
      return t(msg`AI 生成`);
    default:
      return value;
  }
}

function formatStatus(value: CharacterFactorySnapshot["blueprint"]["status"]) {
  const t = translateRuntimeMessage;
  switch (value) {
    case "draft":
      return t(msg`草稿`);
    case "published":
      return t(msg`已发布`);
    case "archived":
      return t(msg`已归档`);
    default:
      return value;
  }
}

function formatChangeSource(value: CharacterBlueprintRevision["changeSource"]) {
  const t = translateRuntimeMessage;
  switch (value) {
    case "publish":
      return t(msg`发布`);
    case "restore":
      return t(msg`恢复`);
    case "seed_backfill":
      return t(msg`回填`);
    case "manual_snapshot":
      return t(msg`手工快照`);
    default:
      return value;
  }
}

function formatFieldSourceStatus(
  value: CharacterFactorySnapshot["fieldSources"][number]["status"],
) {
  const t = translateRuntimeMessage;
  switch (value) {
    case "draft_only":
      return t(msg`仅草稿`);
    case "published_sync":
      return t(msg`已发布同步`);
    case "runtime_drift":
      return t(msg`运行态漂移`);
    default:
      return value;
  }
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
