import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type {
  CharacterBlueprintRecipe,
  CharacterBlueprintRevision,
  CharacterFactorySnapshot,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SectionHeading,
  SelectField as UiSelectField,
  StatusPill,
  TextAreaField as UiTextAreaField,
  TextField as UiTextField,
  ToggleChip,
} from "@yinjie/ui";
import { adminApi } from "../lib/admin-api";

const ACTIVITY_OPTIONS = [
  { value: "", label: "未设置" },
  { value: "free", label: "空闲" },
  { value: "working", label: "工作中" },
  { value: "eating", label: "吃饭中" },
  { value: "resting", label: "休息中" },
  { value: "commuting", label: "通勤中" },
  { value: "sleeping", label: "睡觉中" },
];

export function CharacterFactoryPage() {
  const { characterId } = useParams({ from: "/characters/$characterId/factory" });
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CharacterBlueprintRecipe | null>(null);
  const [publishSummary, setPublishSummary] = useState("");
  const [generationPersonName, setGenerationPersonName] = useState("");
  const [generationSample, setGenerationSample] = useState("");

  const factoryQuery = useQuery({
    queryKey: ["admin-character-factory", characterId],
    queryFn: () => adminApi.getCharacterFactory(characterId),
  });
  const revisionsQuery = useQuery({
    queryKey: ["admin-character-factory-revisions", characterId],
    queryFn: () => adminApi.listCharacterFactoryRevisions(characterId),
  });

  const seedSignature = useMemo(
    () => (factoryQuery.data?.blueprint.draftRecipe ? JSON.stringify(factoryQuery.data.blueprint.draftRecipe) : ""),
    [factoryQuery.data?.blueprint.draftRecipe],
  );

  useEffect(() => {
    setDraft(factoryQuery.data?.blueprint.draftRecipe ?? null);
  }, [seedSignature]);

  useEffect(() => {
    setGenerationPersonName(
      factoryQuery.data?.blueprint.lastAiGeneration?.personName ??
        factoryQuery.data?.blueprint.draftRecipe.identity.name ??
        "",
    );
  }, [
    factoryQuery.data?.blueprint.draftRecipe.identity.name,
    factoryQuery.data?.blueprint.lastAiGeneration?.personName,
  ]);

  const isDirty = useMemo(() => {
    if (!draft || !seedSignature) {
      return false;
    }
    return JSON.stringify(draft) !== seedSignature;
  }, [draft, seedSignature]);

  async function invalidateFactory() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-character-factory", characterId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-character-factory-revisions", characterId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-characters-crud"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-characters"] }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: CharacterBlueprintRecipe) =>
      adminApi.updateCharacterFactory(characterId, payload as unknown as Record<string, unknown>),
    onSuccess: async () => {
      await invalidateFactory();
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => adminApi.publishCharacterFactory(characterId, publishSummary),
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

  function patchDraft(updater: (current: CharacterBlueprintRecipe) => CharacterBlueprintRecipe) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  if (factoryQuery.isLoading) {
    return <LoadingBlock label="正在加载角色工厂..." />;
  }

  if (factoryQuery.isError && factoryQuery.error instanceof Error) {
    return <ErrorBlock message={factoryQuery.error.message} />;
  }

  if (!factoryQuery.data || !draft) {
    return <ErrorBlock message="角色工厂数据暂不可用。" />;
  }

  const snapshot = factoryQuery.data;
  const revisions = revisionsQuery.data ?? [];
  const driftFieldCount = snapshot.fieldSources.filter((item) => item.status === "runtime_drift").length;
  const changedPublishItems = snapshot.publishDiff.items.filter((item) => item.changed);

  function jumpToSection(sectionId: string) {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_42%,rgba(237,250,244,0.95))]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">角色工厂</div>
              <h2 className="mt-3 text-3xl font-semibold text-[color:var(--text-primary)]">{snapshot.character.name}</h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
                在这里定义角色配方、查看发布版本、对比草稿差异，并把制造阶段的设定发布到运行时实体。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/characters">
                <Button variant="secondary" size="lg">返回角色中心</Button>
              </Link>
              <Link to="/characters/$characterId" params={{ characterId }}>
                <Button variant="secondary" size="lg">基础资料</Button>
              </Link>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setDraft(factoryQuery.data?.blueprint.draftRecipe ?? null)}
                disabled={!isDirty}
              >
                重置草稿
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => draft && saveMutation.mutate(draft)}
                disabled={!isDirty || saveMutation.isPending}
              >
                {saveMutation.isPending ? "保存中..." : "保存草稿"}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="来源" value={formatSourceType(snapshot.blueprint.sourceType)} />
            <MetricCard label="状态" value={formatStatus(snapshot.blueprint.status)} />
            <MetricCard label="已发布版本" value={snapshot.blueprint.publishedVersion || 0} />
            <MetricCard label="未发布变更" value={snapshot.diffSummary.hasUnpublishedChanges ? "有" : "无"} />
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>当前状态</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="运行态漂移字段" value={driftFieldCount} />
            <MetricCard label="发布将覆盖字段" value={snapshot.publishDiff.changedCount} />
            <MetricCard label="草稿变更字段" value={snapshot.diffSummary.changedFields.length} />
            <MetricCard label="版本记录" value={revisions.length} />
          </div>
        </Card>
      </div>

      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {publishMutation.isError && publishMutation.error instanceof Error ? (
        <ErrorBlock message={publishMutation.error.message} />
      ) : null}
      {restoreMutation.isError && restoreMutation.error instanceof Error ? (
        <ErrorBlock message={restoreMutation.error.message} />
      ) : null}
      {aiGenerateMutation.isError && aiGenerateMutation.error instanceof Error ? (
        <ErrorBlock message={aiGenerateMutation.error.message} />
      ) : null}

      <InlineNotice tone="muted">
        工厂页改的是角色配方。只有点击“发布到运行时”后，配方才会映射到当前 `Character` 实体并影响真实对话与生活逻辑。
      </InlineNotice>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>段落导航</SectionHeading>
            <div className="mt-4 grid gap-2">
              <SectionNavButton label="AI 辅助制造" detail="从聊天样本生成草稿" onClick={() => jumpToSection("character-factory-ai")} />
              <SectionNavButton label="身份与关系" detail="名字、关系、背景和动机" onClick={() => jumpToSection("character-factory-identity")} />
              <SectionNavButton label="能力与边界" detail="擅长领域、知识边界、拒绝方式" onClick={() => jumpToSection("character-factory-expertise")} />
              <SectionNavButton label="语气与行为" detail="口头禅、风格、提示词" onClick={() => jumpToSection("character-factory-tone")} />
              <SectionNavButton label="记忆与生活策略" detail="频率、活跃时段、触发场景" onClick={() => jumpToSection("character-factory-memory")} />
              <SectionNavButton label="推理与发布映射" detail="默认开关和发布目标" onClick={() => jumpToSection("character-factory-publish")} />
              <SectionNavButton label="版本与 Diff" detail="发布差异、字段来源、版本记录" onClick={() => jumpToSection("character-factory-diff")} />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>运营提示</SectionHeading>
            <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
              <HintRow label="草稿状态" value={isDirty ? "有未保存变更" : "已同步"} />
              <HintRow label="发布状态" value={snapshot.diffSummary.hasUnpublishedChanges ? "待发布" : "已发布同步"} />
              <HintRow label="建议流程" value="先改草稿，再看 Diff，最后发布" />
            </div>
          </Card>
        </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card id="character-factory-ai" className="bg-[color:var(--surface-console)]">
            <SectionHeading>AI 辅助制造</SectionHeading>
            <InlineNotice className="mt-4" tone="muted">
              输入一段角色聊天样本后，后台会走人格提取链，把可结构化的语气、口头禅、兴趣、情绪基调和记忆摘要写回工厂草稿。
            </InlineNotice>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldBlock
                label="样本人名"
                value={generationPersonName}
                onChange={setGenerationPersonName}
                placeholder="角色名字"
              />
            </div>
            <TextAreaBlock
              label="聊天样本"
              value={generationSample}
              onChange={setGenerationSample}
              placeholder="贴一段足够体现说话风格的聊天样本。"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setGenerationSample("")}
                disabled={!generationSample.trim()}
              >
                清空样本
              </Button>
              <Button
                variant="primary"
                onClick={() => aiGenerateMutation.mutate()}
                disabled={!generationSample.trim() || aiGenerateMutation.isPending}
              >
                {aiGenerateMutation.isPending ? "生成中..." : "生成并写入草稿"}
              </Button>
            </div>
          </Card>

          <Card id="character-factory-identity" className="bg-[color:var(--surface-console)]">
            <SectionHeading>身份与关系</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FieldBlock
                label="名称"
                value={draft.identity.name}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, name: value },
                  }))
                }
              />
              <FieldBlock
                label="关系描述"
                value={draft.identity.relationship}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, relationship: value },
                  }))
                }
              />
              <SelectFieldBlock
                label="关系类型"
                value={draft.identity.relationshipType}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, relationshipType: value },
                  }))
                }
                options={[
                  { value: "family", label: "家人" },
                  { value: "friend", label: "朋友" },
                  { value: "expert", label: "专家" },
                  { value: "mentor", label: "导师" },
                  { value: "custom", label: "自定义" },
                  { value: "self", label: "自己" },
                ]}
              />
              <FieldBlock
                label="头像"
                value={draft.identity.avatar}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    identity: { ...current.identity, avatar: value },
                  }))
                }
              />
              <FieldBlock
                label="职业"
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
              label="简介"
              value={draft.identity.bio}
              onChange={(value) =>
                patchDraft((current) => ({
                  ...current,
                  identity: { ...current.identity, bio: value },
                }))
              }
            />
            <TextAreaBlock
              label="背景"
              value={draft.identity.background}
              onChange={(value) =>
                patchDraft((current) => ({
                  ...current,
                  identity: { ...current.identity, background: value },
                }))
              }
            />
            <TextAreaBlock
              label="核心动机"
              value={draft.identity.motivation}
              onChange={(value) =>
                patchDraft((current) => ({
                  ...current,
                  identity: { ...current.identity, motivation: value },
                }))
              }
            />
            <TextAreaBlock
              label="世界观"
              value={draft.identity.worldview}
              onChange={(value) =>
                patchDraft((current) => ({
                  ...current,
                  identity: { ...current.identity, worldview: value },
                }))
              }
            />
          </Card>

          <Card id="character-factory-expertise" className="bg-[color:var(--surface-console)]">
            <SectionHeading>能力域与边界</SectionHeading>
            <div className="mt-4 space-y-4">
              <FieldBlock
                label="擅长领域"
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
                label="专长描述"
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
                label="知识边界"
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
                label="超界拒绝方式"
                value={draft.expertise.refusalStyle}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    expertise: {
                      ...current.expertise,
                      refusalStyle: value,
                    },
                  }))
                }
              />
            </div>
          </Card>

          <Card id="character-factory-tone" className="bg-[color:var(--surface-console)]">
            <SectionHeading>语气与行为</SectionHeading>
            <div className="mt-4 space-y-4">
              <FieldBlock
                label="说话习惯"
                value={listToCsv(draft.tone.speechPatterns)}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, speechPatterns: csvToList(value) },
                  }))
                }
              />
              <FieldBlock
                label="口头禅"
                value={listToCsv(draft.tone.catchphrases)}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, catchphrases: csvToList(value) },
                  }))
                }
              />
              <FieldBlock
                label="兴趣话题"
                value={listToCsv(draft.tone.topicsOfInterest)}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, topicsOfInterest: csvToList(value) },
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="情绪基调"
                  value={draft.tone.emotionalTone}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: { ...current.tone, emotionalTone: value },
                    }))
                  }
                />
                <SelectFieldBlock
                  label="回复长度"
                  value={draft.tone.responseLength}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: {
                        ...current.tone,
                        responseLength: value as CharacterBlueprintRecipe["tone"]["responseLength"],
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
                  value={draft.tone.emojiUsage}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      tone: {
                        ...current.tone,
                        emojiUsage: value as CharacterBlueprintRecipe["tone"]["emojiUsage"],
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
                value={draft.tone.workStyle}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, workStyle: value },
                  }))
                }
              />
              <FieldBlock
                label="社交风格"
                value={draft.tone.socialStyle}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, socialStyle: value },
                  }))
                }
              />
              <FieldBlock
                label="语言禁忌"
                value={listToCsv(draft.tone.taboos)}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, taboos: csvToList(value) },
                  }))
                }
              />
              <FieldBlock
                label="个人癖好"
                value={listToCsv(draft.tone.quirks)}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, quirks: csvToList(value) },
                  }))
                }
              />
              <TextAreaBlock
                label="基础提示词"
                value={draft.tone.basePrompt}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, basePrompt: value },
                  }))
                }
              />
              <TextAreaBlock
                label="系统提示词"
                value={draft.tone.systemPrompt}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    tone: { ...current.tone, systemPrompt: value },
                  }))
                }
              />
            </div>
          </Card>

          <Card id="character-factory-memory" className="bg-[color:var(--surface-console)]">
            <SectionHeading>记忆底稿与生活策略</SectionHeading>
            <div className="mt-4 space-y-4">
              <TextAreaBlock
                label="记忆摘要"
                value={draft.memorySeed.memorySummary}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    memorySeed: { ...current.memorySeed, memorySummary: value },
                  }))
                }
              />
              <TextAreaBlock
                label="核心记忆"
                value={draft.memorySeed.coreMemory}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    memorySeed: { ...current.memorySeed, coreMemory: value },
                  }))
                }
              />
              <TextAreaBlock
                label="近期摘要初始值"
                value={draft.memorySeed.recentSummarySeed}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    memorySeed: { ...current.memorySeed, recentSummarySeed: value },
                  }))
                }
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FieldBlock
                  label="遗忘曲线"
                  value={draft.memorySeed.forgettingCurve}
                  type="number"
                  min={0}
                  max={100}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      memorySeed: {
                        ...current.memorySeed,
                        forgettingCurve: parseIntWithFallback(value, current.memorySeed.forgettingCurve),
                      },
                    }))
                  }
                />
                <SelectFieldBlock
                  label="活动频率"
                  value={draft.lifeStrategy.activityFrequency}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      lifeStrategy: { ...current.lifeStrategy, activityFrequency: value },
                    }))
                  }
                  options={[
                    { value: "high", label: "高频" },
                    { value: "normal", label: "中频" },
                    { value: "low", label: "低频" },
                  ]}
                />
                <FieldBlock
                  label="朋友圈频率"
                  value={draft.lifeStrategy.momentsFrequency}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      lifeStrategy: {
                        ...current.lifeStrategy,
                        momentsFrequency: parseIntWithFallback(value, current.lifeStrategy.momentsFrequency),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="视频号频率"
                  value={draft.lifeStrategy.feedFrequency}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      lifeStrategy: {
                        ...current.lifeStrategy,
                        feedFrequency: parseIntWithFallback(value, current.lifeStrategy.feedFrequency),
                      },
                    }))
                  }
                />
                <FieldBlock
                  label="活跃开始小时"
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
                  label="活跃结束小时"
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
                label="触发场景"
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

          <Card id="character-factory-publish" className="bg-[color:var(--surface-console)]">
            <SectionHeading>推理与路由</SectionHeading>
            <InlineNotice className="mt-4" tone="muted">
              这里定义发布后角色默认带上的推理开关，而不是运行时临时覆盖值。
            </InlineNotice>
            <div className="mt-4 flex flex-wrap gap-3">
              <ToggleChip
                label="启用链路推理"
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
                label="启用反思"
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
                label="启用路由"
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
            <SectionHeading>发布映射</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <SelectFieldBlock
                label="在线模式默认值"
                value={draft.publishMapping.onlineModeDefault}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    publishMapping: {
                      ...current.publishMapping,
                      onlineModeDefault: value === "manual" ? "manual" : "auto",
                    },
                  }))
                }
                options={[
                  { value: "auto", label: "自动调度" },
                  { value: "manual", label: "人工锁定" },
                ]}
              />
              <SelectFieldBlock
                label="活动模式默认值"
                value={draft.publishMapping.activityModeDefault}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    publishMapping: {
                      ...current.publishMapping,
                      activityModeDefault: value === "manual" ? "manual" : "auto",
                    },
                  }))
                }
                options={[
                  { value: "auto", label: "自动调度" },
                  { value: "manual", label: "人工锁定" },
                ]}
              />
              <FieldBlock
                label="初始在线状态"
                value={draft.publishMapping.initialOnline ? "在线" : "离线"}
                disabled
                onChange={() => undefined}
              />
              <SelectFieldBlock
                label="初始活动"
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
                options={ACTIVITY_OPTIONS}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <ToggleChip
                label="作为模板发布"
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
                label="发布后初始在线"
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

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>草稿差异</SectionHeading>
            {snapshot.diffSummary.changedFields.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {snapshot.diffSummary.changedFields.map((field) => (
                  <StatusPill key={field} tone="warning">{field}</StatusPill>
                ))}
              </div>
            ) : (
              <InlineNotice className="mt-4" tone="success">当前草稿与已发布版本一致。</InlineNotice>
            )}
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>发布操作</SectionHeading>
            <TextAreaBlock
              label="发布说明"
              value={publishSummary}
              placeholder="这次发布改了什么"
              onChange={setPublishSummary}
            />
            {publishMutation.isSuccess ? (
              <InlineNotice tone="success">草稿已发布到运行时实体。</InlineNotice>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="primary"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? "发布中..." : "发布到运行时"}
              </Button>
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>已发布快照</SectionHeading>
            <CodeBlock
              className="mt-4"
              value={JSON.stringify(snapshot.blueprint.publishedRecipe ?? {}, null, 2)}
            />
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>最近一次 AI 制造链路</SectionHeading>
            {snapshot.blueprint.lastAiGeneration ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <ValueSnapshot label="样本人名" value={snapshot.blueprint.lastAiGeneration.personName} />
                  <ValueSnapshot label="生成时间" value={formatDateTime(snapshot.blueprint.lastAiGeneration.requestedAt)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {snapshot.blueprint.lastAiGeneration.appliedFields.map((field) => (
                    <StatusPill key={field} tone="warning">{field}</StatusPill>
                  ))}
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">聊天样本</div>
                  <CodeBlock value={snapshot.blueprint.lastAiGeneration.chatSample} />
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">提取 Prompt</div>
                  <CodeBlock value={snapshot.blueprint.lastAiGeneration.prompt} />
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">结构化结果</div>
                  <CodeBlock value={JSON.stringify(snapshot.blueprint.lastAiGeneration.extractedProfile, null, 2)} />
                </div>
              </div>
            ) : (
              <InlineNotice className="mt-4" tone="muted">
                当前还没有 AI 辅助制造记录。
              </InlineNotice>
            )}
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>版本记录</SectionHeading>
            {revisionsQuery.isLoading ? <LoadingBlock className="mt-4" label="正在加载版本..." /> : null}
            {revisionsQuery.isError && revisionsQuery.error instanceof Error ? (
              <ErrorBlock message={revisionsQuery.error.message} />
            ) : null}
            <div className="mt-4 space-y-4">
              {revisions.map((revision) => (
                <RevisionCard
                  key={revision.id}
                  revision={revision}
                  restoring={restoreMutation.isPending && restoreMutation.variables === revision.id}
                  onRestore={() => restoreMutation.mutate(revision.id)}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div id="character-factory-diff" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>字段来源</SectionHeading>
          <InlineNotice className="mt-4" tone={driftFieldCount > 0 ? "warning" : "muted"}>
            这里展示运行时 `Character` 字段来自哪个配方字段，以及当前运行态是否已经偏离上次发布结果。
          </InlineNotice>
          <div className="mt-4 space-y-3">
            {snapshot.fieldSources.map((item) => (
              <FieldSourceCard key={`${item.targetField}-${item.recipeField}`} item={item} />
            ))}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>发布映射 Diff</SectionHeading>
          <InlineNotice className="mt-4" tone={changedPublishItems.length ? "warning" : "success"}>
            {changedPublishItems.length
              ? `当前草稿一旦发布，会覆盖 ${changedPublishItems.length} 个运行时字段。`
              : "当前运行时与草稿发布结果一致，发布不会改动角色实体。"}
          </InlineNotice>
          <div className="mt-4 space-y-3">
            {changedPublishItems.map((item) => (
              <PublishDiffCard key={`${item.targetField}-${item.recipeField}`} item={item} />
            ))}
            {changedPublishItems.length === 0 ? (
              <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 text-sm text-[color:var(--text-secondary)]">
                当前没有需要覆盖的运行态字段。
              </div>
            ) : null}
            {snapshot.publishDiff.items.length > changedPublishItems.length ? (
              <div className="text-sm text-[color:var(--text-muted)]">
                其余 {snapshot.publishDiff.items.length - changedPublishItems.length} 个字段发布后保持不变。
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
}

function RevisionCard({
  revision,
  restoring,
  onRestore,
}: {
  revision: CharacterBlueprintRevision;
  restoring: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="muted">v{revision.version}</StatusPill>
        <StatusPill tone="muted">{formatChangeSource(revision.changeSource)}</StatusPill>
      </div>
      <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
        {revision.summary?.trim() || "无发布说明"}
      </div>
      <div className="mt-2 text-xs text-[color:var(--text-muted)]">
        {formatDateTime(revision.createdAt)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={onRestore} disabled={restoring}>
          {restoring ? "恢复中..." : "恢复到草稿"}
        </Button>
      </div>
    </div>
  );
}

function FieldSourceCard({
  item,
}: {
  item: CharacterFactorySnapshot["fieldSources"][number];
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">{item.label}</div>
        <StatusPill tone={item.status === "runtime_drift" ? "warning" : item.status === "draft_only" ? "muted" : "healthy"}>
          {formatFieldSourceStatus(item.status)}
        </StatusPill>
      </div>
      <div className="mt-2 text-xs text-[color:var(--text-muted)]">
        {item.targetField} ← {item.recipeField}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ValueSnapshot label="运行时" value={item.runtimeValue} />
        <ValueSnapshot label="已发布" value={item.publishedValue} />
        <ValueSnapshot label="草稿" value={item.draftValue} />
      </div>
      <div className="mt-3 text-sm text-[color:var(--text-secondary)]">{item.note}</div>
    </div>
  );
}

function PublishDiffCard({
  item,
}: {
  item: CharacterFactorySnapshot["publishDiff"]["items"][number];
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">{item.label}</div>
        <StatusPill tone="warning">发布后变更</StatusPill>
      </div>
      <div className="mt-2 text-xs text-[color:var(--text-muted)]">
        {item.targetField} ← {item.recipeField}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ValueSnapshot label="当前运行时" value={item.currentValue} />
        <ValueSnapshot label="发布后" value={item.nextValue} />
      </div>
    </div>
  );
}

function ValueSnapshot({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-white/70 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{value}</div>
    </div>
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
  disabled = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
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
        disabled={disabled}
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
    <label className="mt-4 block first:mt-0">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {label}
      </div>
      <UiSelectField value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => (
          <option key={`${label}-${item.value}`} value={item.value}>
            {item.label}
          </option>
        ))}
      </UiSelectField>
    </label>
  );
}

function CodeBlock({ value, className }: { value: string; className?: string }) {
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

function SectionNavButton({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
    >
      <div className="font-semibold text-[color:var(--text-primary)]">{label}</div>
      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{detail}</div>
    </button>
  );
}

function HintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      <span className="text-right text-[color:var(--text-primary)]">{value}</span>
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

function formatSourceType(value: CharacterFactorySnapshot["blueprint"]["sourceType"]) {
  switch (value) {
    case "default_seed":
      return "内置默认角色";
    case "manual_admin":
      return "后台手工角色";
    case "template_clone":
      return "模板克隆";
    case "ai_generated":
      return "AI 生成";
    default:
      return value;
  }
}

function formatStatus(value: CharacterFactorySnapshot["blueprint"]["status"]) {
  switch (value) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    case "archived":
      return "已归档";
    default:
      return value;
  }
}

function formatChangeSource(value: CharacterBlueprintRevision["changeSource"]) {
  switch (value) {
    case "publish":
      return "发布";
    case "restore":
      return "恢复";
    case "seed_backfill":
      return "回填";
    case "manual_snapshot":
      return "手工快照";
    default:
      return value;
  }
}

function formatFieldSourceStatus(value: CharacterFactorySnapshot["fieldSources"][number]["status"]) {
  switch (value) {
    case "draft_only":
      return "仅草稿";
    case "published_sync":
      return "已发布同步";
    case "runtime_drift":
      return "运行态漂移";
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
