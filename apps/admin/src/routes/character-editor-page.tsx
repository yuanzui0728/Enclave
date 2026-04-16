import { useEffect, useEffectEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  createCharacter,
  getCharacter,
  updateCharacter,
  type Character,
  type CharacterDraft,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  SectionHeading,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminPageHero,
  AdminSectionHeader,
  AdminTabs,
  AdminSelectField as SelectField,
  AdminTextArea as TextAreaField,
  AdminTextField as Field,
  AdminToggle as Toggle,
} from "../components/admin-workbench";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { adminApi } from "../lib/admin-api";
import { CharacterWorkspaceNav } from "../components/character-workspace-nav";

const emptyCharacterDraft: CharacterDraft = {
  name: "",
  avatar: "",
  relationship: "",
  relationshipType: "expert",
  bio: "",
  isOnline: false,
  onlineMode: "auto",
  activityMode: "auto",
  currentActivity: "free",
  sourceType: "manual_admin",
  deletionPolicy: "archive_allowed",
  isTemplate: false,
  expertDomains: [],
  activityFrequency: "normal",
  momentsFrequency: 1,
  feedFrequency: 1,
  activeHoursStart: 8,
  activeHoursEnd: 23,
  intimacyLevel: 0,
  triggerScenes: [],
  profile: {
    characterId: "",
    name: "",
    relationship: "",
    expertDomains: [],
    coreDirective: "",
    basePrompt: "",
    systemPrompt: "",
    memorySummary: "",
    traits: {
      speechPatterns: [],
      catchphrases: [],
      topicsOfInterest: [],
      emotionalTone: "grounded",
      responseLength: "medium",
      emojiUsage: "occasional",
    },
    identity: {
      occupation: "",
      background: "",
      motivation: "",
      worldview: "",
    },
    behavioralPatterns: {
      workStyle: "",
      socialStyle: "",
      taboos: [],
      quirks: [],
    },
    cognitiveBoundaries: {
      expertiseDescription: "",
      knowledgeLimits: "",
      refusalStyle: "",
    },
    reasoningConfig: {
      enableCoT: true,
      enableReflection: true,
      enableRouting: true,
    },
    memory: {
      coreMemory: "",
      recentSummary: "",
      forgettingCurve: 70,
    },
  },
};

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(items?: string[] | null) {
  return items?.join(", ") ?? "";
}

const TABS = [
  { key: "basics", label: "基础信息" },
  { key: "identity", label: "身份背景" },
  { key: "personality", label: "个性语气" },
  { key: "prompts", label: "提示词" },
  { key: "boundaries", label: "能力边界" },
  { key: "life", label: "生活策略" },
  { key: "memory", label: "记忆" },
  { key: "reasoning", label: "推理" },
];

export function CharacterEditorPage() {
  const { characterId } = useParams({ from: "/characters/$characterId" });
  const isNew = characterId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [draft, setDraft] = useState<CharacterDraft>(emptyCharacterDraft);
  const [activeTab, setActiveTab] = useState("basics");

  const characterQuery = useQuery({
    queryKey: ["admin-character-edit", characterId, baseUrl],
    queryFn: () => getCharacter(characterId, baseUrl),
    enabled: !isNew,
  });
  useEffect(() => {
    if (isNew) {
      setDraft(emptyCharacterDraft);
      return;
    }
    if (characterQuery.isLoading) {
      setDraft(emptyCharacterDraft);
      return;
    }
    if (characterQuery.data) {
      setDraft(characterQuery.data);
      return;
    }
    if (characterQuery.isError) {
      setDraft(emptyCharacterDraft);
    }
  }, [characterQuery.data, characterQuery.isError, characterQuery.isLoading, isNew]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = normalizeDraft(draft, characterId, isNew);
      if (isNew) {
        return createCharacter(payload, baseUrl);
      }
      return updateCharacter(characterId, payload, baseUrl);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
      ]);
      navigate({ to: "/characters" });
    },
  });

  const resetSaveMutation = useEffectEvent(() => {
    saveMutation.reset();
  });

  useEffect(() => {
    resetSaveMutation();
  }, [baseUrl, characterId, resetSaveMutation]);

  const [aiDescription, setAiDescription] = useState("");

  const aiGenerateMutation = useMutation({
    mutationFn: () => adminApi.generateQuickCharacter(aiDescription.trim()),
    onSuccess: (raw) => {
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const strList = (v: unknown) =>
        Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];

      setDraft((current) => ({
        ...current,
        name: str(raw.name) || current.name,
        avatar: str(raw.avatar) || current.avatar,
        relationship: str(raw.relationship) || current.relationship,
        relationshipType: (str(raw.relationshipType) as Character["relationshipType"]) || current.relationshipType,
        bio: str(raw.bio) || current.bio,
        expertDomains: strList(raw.expertDomains).length ? strList(raw.expertDomains) : (current.expertDomains ?? []),
        profile: {
          ...(current.profile ?? emptyCharacterDraft.profile!),
          basePrompt: str(raw.basePrompt) || current.profile?.basePrompt,
          memorySummary: str(raw.memorySummary) || (current.profile?.memorySummary ?? ""),
          traits: {
            ...(current.profile?.traits ?? emptyCharacterDraft.profile!.traits),
            speechPatterns: strList(raw.speechPatterns).length ? strList(raw.speechPatterns) : (current.profile?.traits.speechPatterns ?? []),
            catchphrases: strList(raw.catchphrases).length ? strList(raw.catchphrases) : (current.profile?.traits.catchphrases ?? []),
            topicsOfInterest: strList(raw.topicsOfInterest).length ? strList(raw.topicsOfInterest) : (current.profile?.traits.topicsOfInterest ?? []),
            emotionalTone: str(raw.emotionalTone) || current.profile?.traits.emotionalTone || "grounded",
            responseLength: (str(raw.responseLength) as "short" | "medium" | "long") || current.profile?.traits.responseLength || "medium",
            emojiUsage: (str(raw.emojiUsage) as "none" | "occasional" | "frequent") || current.profile?.traits.emojiUsage || "occasional",
          },
          identity: {
            ...(current.profile?.identity ?? emptyCharacterDraft.profile!.identity!),
            occupation: str(raw.occupation) || current.profile?.identity?.occupation || "",
            background: str(raw.background) || current.profile?.identity?.background || "",
            motivation: str(raw.motivation) || current.profile?.identity?.motivation || "",
            worldview: str(raw.worldview) || current.profile?.identity?.worldview || "",
          },
        },
      }));
    },
  });

  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const canSave = Boolean(draft.name?.trim() && draft.relationship?.trim());

  return (
    <div className="space-y-6">
      {!isNew ? <CharacterWorkspaceNav characterId={characterId} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminPageHero
          eyebrow={isNew ? "新建角色" : "行为管理"}
          title={isNew ? "新建角色" : draft.name || "行为管理"}
          actions={
            <>
              <Link to="/characters">
                <Button variant="secondary" size="lg">返回角色中心</Button>
              </Link>
              <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} variant="primary" size="lg">
                {saveMutation.isPending ? "保存中..." : "保存角色"}
              </Button>
            </>
          }
        />
      </div>

      {!isNew && characterQuery.isLoading ? <LoadingBlock label="正在加载角色草稿..." /> : null}
      {!isNew && characterQuery.isError && characterQuery.error instanceof Error ? <ErrorBlock message={characterQuery.error.message} /> : null}
      {!canSave ? <InlineNotice tone="warning">保存角色前，名称和关系描述为必填项。</InlineNotice> : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? <ErrorBlock message={saveMutation.error.message} /> : null}
      {saveMutation.isSuccess ? (
        <AdminActionFeedback tone="success" title="角色已保存" description="正在返回角色名册..." />
      ) : null}

      {isNew ? (
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="AI 快速生成"
            actions={
              <StatusPill tone={aiGenerateMutation.isSuccess ? "healthy" : "muted"}>
                {aiGenerateMutation.isSuccess ? "已填入" : "一键生成"}
              </StatusPill>
            }
          />
          <p className="mt-3 text-sm text-[color:var(--text-secondary)]">
            输入对角色的简短描述，AI 会自动生成姓名、简介、人格特征、职业背景等字段并填入表单，你可以在下方继续微调。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <textarea
              className="w-full rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary)] resize-none min-h-[80px]"
              placeholder="例如：一个温柔开朗的心理咨询师，喜欢音乐和烹饪，说话温和有亲和力"
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                disabled={!aiDescription.trim() || aiGenerateMutation.isPending}
                onClick={() => aiGenerateMutation.mutate()}
              >
                {aiGenerateMutation.isPending ? "生成中..." : "AI 生成角色"}
              </Button>
              {aiGenerateMutation.isSuccess ? (
                <span className="text-sm text-[color:var(--text-success)]">已生成并填入，请在下方检查和微调</span>
              ) : null}
            </div>
          </div>
          {aiGenerateMutation.isError && aiGenerateMutation.error instanceof Error ? (
            <ErrorBlock className="mt-3" message={aiGenerateMutation.error.message} />
          ) : null}
        </Card>
      ) : null}

      {/* Tab 导航 */}
      <AdminTabs tabs={TABS} activeKey={activeTab} onChange={setActiveTab} />

      {/* Tab: 基础信息 */}
      {activeTab === "basics" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>基础信息</SectionHeading>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="名称" value={draft.name ?? ""} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
            <Field label="头像" value={draft.avatar ?? ""} onChange={(value) => setDraft((current) => ({ ...current, avatar: value }))} />
            <Field
              label="关系描述"
              value={draft.relationship ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, relationship: value }))}
            />
            <SelectField
              label="关系类型"
              value={draft.relationshipType ?? "expert"}
              onChange={(value) => setDraft((current) => ({ ...current, relationshipType: value as Character["relationshipType"] }))}
              options={[
                { value: "family", label: "家人" },
                { value: "friend", label: "朋友" },
                { value: "expert", label: "专家" },
                { value: "mentor", label: "导师" },
                { value: "custom", label: "自定义" },
              ]}
            />
            <Field
              label="擅长领域"
              value={listToCsv(draft.expertDomains)}
              onChange={(value) => setDraft((current) => ({ ...current, expertDomains: csvToList(value) }))}
            />
          </div>
          <TextAreaField
            className="mt-4"
            label="简介"
            value={draft.bio ?? ""}
            onChange={(value) => setDraft((current) => ({ ...current, bio: value }))}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Toggle
              label="在线"
              checked={draft.isOnline ?? false}
              onChange={(checked) => setDraft((current) => ({ ...current, isOnline: checked }))}
            />
            <Toggle
              label="模板"
              checked={draft.isTemplate ?? false}
              onChange={(checked) => setDraft((current) => ({ ...current, isTemplate: checked }))}
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 身份背景 */}
      {activeTab === "identity" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>身份背景</SectionHeading>
          <div className="mt-4 space-y-4">
            <Field
              label="职业"
              value={profile.identity?.occupation ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, occupation: value } },
                }))
              }
            />
            <TextAreaField
              label="背景"
              value={profile.identity?.background ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, background: value } },
                }))
              }
            />
            <TextAreaField
              label="核心动机"
              value={profile.identity?.motivation ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, motivation: value } },
                }))
              }
            />
            <TextAreaField
              label="世界观"
              value={profile.identity?.worldview ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, worldview: value } },
                }))
              }
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 个性语气 */}
      {activeTab === "personality" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>个性与语气</SectionHeading>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="情绪基调"
                value={profile.traits.emotionalTone}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: { ...profile, traits: { ...profile.traits, emotionalTone: value } },
                  }))
                }
              />
              <SelectField
                label="回复长度"
                value={profile.traits.responseLength}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: { ...profile, traits: { ...profile.traits, responseLength: value as "short" | "medium" | "long" } },
                  }))
                }
                options={[
                  { value: "short", label: "简短" },
                  { value: "medium", label: "适中" },
                  { value: "long", label: "详细" },
                ]}
              />
              <SelectField
                label="表情使用"
                value={profile.traits.emojiUsage}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: { ...profile, traits: { ...profile.traits, emojiUsage: value as "none" | "occasional" | "frequent" } },
                  }))
                }
                options={[
                  { value: "none", label: "不用" },
                  { value: "occasional", label: "偶尔" },
                  { value: "frequent", label: "频繁" },
                ]}
              />
              <Field
                label="工作风格"
                value={profile.behavioralPatterns?.workStyle ?? ""}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: { ...profile, behavioralPatterns: { ...profile.behavioralPatterns!, workStyle: value } },
                  }))
                }
              />
              <Field
                label="社交风格"
                value={profile.behavioralPatterns?.socialStyle ?? ""}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: { ...profile, behavioralPatterns: { ...profile.behavioralPatterns!, socialStyle: value } },
                  }))
                }
              />
            </div>
            <Field
              label="说话习惯"
              value={listToCsv(profile.traits.speechPatterns)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, traits: { ...profile.traits, speechPatterns: csvToList(value) } },
                }))
              }
            />
            <Field
              label="口头禅"
              value={listToCsv(profile.traits.catchphrases)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, traits: { ...profile.traits, catchphrases: csvToList(value) } },
                }))
              }
            />
            <Field
              label="兴趣话题"
              value={listToCsv(profile.traits.topicsOfInterest)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, traits: { ...profile.traits, topicsOfInterest: csvToList(value) } },
                }))
              }
            />
            <Field
              label="语言禁忌"
              value={listToCsv(profile.behavioralPatterns?.taboos)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, behavioralPatterns: { ...profile.behavioralPatterns!, taboos: csvToList(value) } },
                }))
              }
            />
            <Field
              label="个人癖好"
              value={listToCsv(profile.behavioralPatterns?.quirks)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, behavioralPatterns: { ...profile.behavioralPatterns!, quirks: csvToList(value) } },
                }))
              }
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 提示词 */}
      {activeTab === "prompts" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>提示词</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">行动纲领是最高优先级准则，会在聊天、发朋友圈等所有场景中强制注入。</p>
          <div className="mt-4 space-y-4">
            <TextAreaField
              label="行动纲领（底层逻辑）"
              value={profile.coreDirective ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, coreDirective: value } }))}
            />
            <TextAreaField
              label="基础提示词"
              value={profile.basePrompt ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, basePrompt: value } }))}
            />
            <TextAreaField
              label="系统提示词"
              value={profile.systemPrompt ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, systemPrompt: value } }))}
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 能力边界 */}
      {activeTab === "boundaries" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>能力边界</SectionHeading>
          <div className="mt-4 space-y-4">
            <TextAreaField
              label="能力边界说明"
              value={profile.cognitiveBoundaries?.expertiseDescription ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, cognitiveBoundaries: { ...profile.cognitiveBoundaries!, expertiseDescription: value } },
                }))
              }
            />
            <TextAreaField
              label="知识边界"
              value={profile.cognitiveBoundaries?.knowledgeLimits ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, cognitiveBoundaries: { ...profile.cognitiveBoundaries!, knowledgeLimits: value } },
                }))
              }
            />
            <TextAreaField
              label="超界拒绝方式"
              value={profile.cognitiveBoundaries?.refusalStyle ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, cognitiveBoundaries: { ...profile.cognitiveBoundaries!, refusalStyle: value } },
                }))
              }
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 生活策略 */}
      {activeTab === "life" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>生活策略</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">控制角色在系统中的活跃节奏、内容发布频率和触发场景。</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SelectField
              label="在线模式"
              value={draft.onlineMode ?? "auto"}
              onChange={(value) => setDraft((current) => ({ ...current, onlineMode: value as "auto" | "manual" }))}
              options={[
                { value: "auto", label: "自动" },
                { value: "manual", label: "手动" },
              ]}
            />
            <SelectField
              label="活动模式"
              value={draft.activityMode ?? "auto"}
              onChange={(value) => setDraft((current) => ({ ...current, activityMode: value as "auto" | "manual" }))}
              options={[
                { value: "auto", label: "自动" },
                { value: "manual", label: "手动" },
              ]}
            />
            <SelectField
              label="活动频率"
              value={draft.activityFrequency ?? "normal"}
              onChange={(value) => setDraft((current) => ({ ...current, activityFrequency: value }))}
              options={[
                { value: "high", label: "高频" },
                { value: "normal", label: "中频" },
                { value: "low", label: "低频" },
              ]}
            />
            <SelectField
              label="当前活动"
              value={draft.currentActivity ?? "free"}
              onChange={(value) => setDraft((current) => ({ ...current, currentActivity: value }))}
              options={[
                { value: "free", label: "空闲" },
                { value: "working", label: "工作中" },
                { value: "eating", label: "吃饭中" },
                { value: "resting", label: "休息中" },
                { value: "commuting", label: "通勤中" },
                { value: "sleeping", label: "睡觉中" },
              ]}
            />
            <Field
              label="朋友圈频率（次/天）"
              value={String(draft.momentsFrequency ?? 1)}
              onChange={(value) => setDraft((current) => ({ ...current, momentsFrequency: Number(value) || 0 }))}
            />
            <Field
              label="视频号频率（次/周）"
              value={String(draft.feedFrequency ?? 1)}
              onChange={(value) => setDraft((current) => ({ ...current, feedFrequency: Number(value) || 0 }))}
            />
            <Field
              label="活跃开始小时（0-23）"
              value={String(draft.activeHoursStart ?? 8)}
              onChange={(value) => setDraft((current) => ({ ...current, activeHoursStart: Number(value) || 0 }))}
            />
            <Field
              label="活跃结束小时（0-23）"
              value={String(draft.activeHoursEnd ?? 23)}
              onChange={(value) => setDraft((current) => ({ ...current, activeHoursEnd: Number(value) || 0 }))}
            />
          </div>
          <Field
            className="mt-4"
            label="触发场景"
            value={listToCsv(draft.triggerScenes)}
            onChange={(value) => setDraft((current) => ({ ...current, triggerScenes: csvToList(value) }))}
          />
        </Card>
      ) : null}

      {/* Tab: 记忆 */}
      {activeTab === "memory" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>记忆</SectionHeading>
          <div className="mt-4 space-y-4">
            <TextAreaField
              label="核心记忆"
              value={profile.memory?.coreMemory ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, memory: { ...profile.memory!, coreMemory: value } },
                }))
              }
            />
            <TextAreaField
              label="近期摘要"
              value={profile.memory?.recentSummary ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, memory: { ...profile.memory!, recentSummary: value } },
                }))
              }
            />
            <Field
              label="遗忘曲线（0-100）"
              value={String(profile.memory?.forgettingCurve ?? 70)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, memory: { ...profile.memory!, forgettingCurve: Number(value) || 0 } },
                }))
              }
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 推理 */}
      {activeTab === "reasoning" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>推理配置</SectionHeading>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">控制角色推理链路的启用状态，影响响应质量和 Token 消耗。</p>
          <div className="mt-4 space-y-3">
            <Toggle
              label="启用链路推理（CoT）"
              checked={profile.reasoningConfig?.enableCoT ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, reasoningConfig: { ...profile.reasoningConfig!, enableCoT: checked } },
                }))
              }
            />
            <Toggle
              label="启用反思"
              checked={profile.reasoningConfig?.enableReflection ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, reasoningConfig: { ...profile.reasoningConfig!, enableReflection: checked } },
                }))
              }
            />
            <Toggle
              label="启用路由"
              checked={profile.reasoningConfig?.enableRouting ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, reasoningConfig: { ...profile.reasoningConfig!, enableRouting: checked } },
                }))
              }
            />
          </div>
        </Card>
      ) : null}

    </div>
  );
}

function normalizeDraft(draft: CharacterDraft, characterId: string, isNew: boolean): CharacterDraft {
  const normalizedId = isNew ? `char_${Date.now()}` : characterId;
  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const expertDomains = draft.expertDomains?.length ? draft.expertDomains : ["general"];

  return {
    ...draft,
    id: normalizedId,
    name: draft.name?.trim(),
    avatar: draft.avatar?.trim() ?? "",
    relationship: draft.relationship?.trim(),
    bio: draft.bio?.trim(),
    expertDomains,
    triggerScenes: draft.triggerScenes?.filter(Boolean) ?? [],
    onlineMode: draft.onlineMode ?? "auto",
    activityMode: draft.activityMode ?? "auto",
    currentActivity: draft.currentActivity ?? "free",
    activityFrequency: draft.activityFrequency ?? "normal",
    momentsFrequency: draft.momentsFrequency ?? 1,
    feedFrequency: draft.feedFrequency ?? 1,
    activeHoursStart: draft.activeHoursStart ?? 8,
    activeHoursEnd: draft.activeHoursEnd ?? 23,
    profile: {
      ...profile,
      characterId: normalizedId,
      name: draft.name?.trim() ?? "",
      relationship: draft.relationship?.trim() ?? "",
      expertDomains,
      basePrompt: profile.basePrompt?.trim() ?? "",
      systemPrompt: profile.systemPrompt?.trim() ?? "",
      memorySummary: profile.memorySummary?.trim() ?? "",
      traits: {
        ...profile.traits,
        emotionalTone: profile.traits.emotionalTone?.trim() || "grounded",
      },
      identity: {
        occupation: profile.identity?.occupation?.trim() ?? "",
        background: profile.identity?.background?.trim() ?? "",
        motivation: profile.identity?.motivation?.trim() ?? "",
        worldview: profile.identity?.worldview?.trim() ?? "",
      },
      behavioralPatterns: {
        workStyle: profile.behavioralPatterns?.workStyle?.trim() ?? "",
        socialStyle: profile.behavioralPatterns?.socialStyle?.trim() ?? "",
        taboos: profile.behavioralPatterns?.taboos ?? [],
        quirks: profile.behavioralPatterns?.quirks ?? [],
      },
      cognitiveBoundaries: {
        expertiseDescription: profile.cognitiveBoundaries?.expertiseDescription?.trim() ?? "",
        knowledgeLimits: profile.cognitiveBoundaries?.knowledgeLimits?.trim() ?? "",
        refusalStyle: profile.cognitiveBoundaries?.refusalStyle?.trim() ?? "",
      },
      reasoningConfig: {
        enableCoT: profile.reasoningConfig?.enableCoT ?? true,
        enableReflection: profile.reasoningConfig?.enableReflection ?? true,
        enableRouting: profile.reasoningConfig?.enableRouting ?? true,
      },
      memory: {
        coreMemory: profile.memory?.coreMemory?.trim() ?? "",
        recentSummary: profile.memory?.recentSummary?.trim() ?? "",
        forgettingCurve: profile.memory?.forgettingCurve ?? 70,
      },
    },
  };
}

function formatRelationshipType(type: Character["relationshipType"]) {
  switch (type) {
    case "family":
      return "家人";
    case "friend":
      return "朋友";
    case "expert":
      return "专家";
    case "mentor":
      return "导师";
    case "custom":
      return "自定义";
    case "self":
      return "自己";
    default:
      return type;
  }
}

function formatCharacterSourceType(sourceType?: Character["sourceType"]) {
  switch (sourceType) {
    case "default_seed":
      return "默认保底";
    case "preset_catalog":
      return "名人预设";
    case "manual_admin":
      return "后台手工";
    default:
      return "后台手工";
  }
}

function formatDeletionPolicy(policy?: Character["deletionPolicy"]) {
  switch (policy) {
    case "protected":
      return "受保护";
    case "archive_allowed":
      return "允许删除";
    default:
      return "允许删除";
  }
}
