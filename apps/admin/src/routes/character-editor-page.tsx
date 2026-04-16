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
    memorySummary: "",
    traits: {
      speechPatterns: [],
      catchphrases: [],
      topicsOfInterest: [],
      emotionalTone: "grounded",
      responseLength: "medium",
      emojiUsage: "occasional",
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
  { key: "core_logic", label: "底层逻辑" },
  { key: "scenes", label: "场景提示词" },
  { key: "memory", label: "记忆" },
  { key: "life", label: "生活策略" },
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

      {/* Tab: 底层逻辑 */}
      {activeTab === "core_logic" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>底层逻辑</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            所有场景都会注入这段逻辑，是角色行为的最底层基础。适合写：角色是谁、核心价值观、思维方式、不可违反的行为准则。
          </p>
          <div className="mt-4">
            <TextAreaField
              label="底层逻辑"
              value={profile.coreLogic ?? ""}
              description="所有场景强制注入。描述角色的核心人格、价值观、思维方式。这里写的内容在聊天、发帖、评论等每个场景都会生效。"
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, coreLogic: value } }))}
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 场景提示词 */}
      {activeTab === "scenes" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>场景提示词</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            每个场景的专属行为指令，叠加在底层逻辑之上。留空则该场景只使用底层逻辑。
          </p>
          <div className="mt-5 space-y-6">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[color:var(--text-muted)]">主动发布</p>
              <div className="space-y-4">
                <TextAreaField
                  label="发朋友圈"
                  value={profile.scenePrompts?.moments_post ?? ""}
                  description="触发：定时发朋友圈（由发圈频率控制）。无实时上下文。写发圈内容偏好、常见话题、风格规范，以及是否偏好配图/纯文字等倾向。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, moments_post: value } } }))}
                />
                <TextAreaField
                  label="发 Feed 贴文"
                  value={profile.scenePrompts?.feed_post ?? ""}
                  description="触发：定时在广场发贴（由 Feed 频率控制）。无实时上下文。写公开发帖的风格、内容方向、是否引导讨论等。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, feed_post: value } } }))}
                />
                <TextAreaField
                  label="发视频号内容"
                  value={profile.scenePrompts?.channel_post ?? ""}
                  description="触发：定时发视频号内容。无实时上下文。写视频号文案风格、内容结构要求（标题/正文/话题标签等）。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, channel_post: value } } }))}
                />
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[color:var(--text-muted)]">互动响应</p>
              <div className="space-y-4">
                <TextAreaField
                  label="聊天回复"
                  value={profile.scenePrompts?.chat ?? ""}
                  description="触发：用户发消息时。系统会自动注入：当前时间、角色活动状态、距上次聊天时长。写聊天风格、话题偏好、对话节奏，可引导 AI 调整回复长短和语气。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, chat: value } } }))}
                />
                <TextAreaField
                  label="朋友圈评论 / 回复"
                  value={profile.scenePrompts?.moments_comment ?? ""}
                  description="触发：角色浏览到用户朋友圈时自动评论。写评论语气、常用开场方式、喜欢哪类内容多互动，不喜欢哪类则少评甚至不评。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, moments_comment: value } } }))}
                />
                <TextAreaField
                  label="Feed 评论"
                  value={profile.scenePrompts?.feed_comment ?? ""}
                  description="触发：角色看到用户 Feed 贴文时自动评论。写评论偏好，例如犀利点评 / 鼓励互动 / 专业补充，以及对哪类帖子积极评论。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, feed_comment: value } } }))}
                />
                <TextAreaField
                  label="好友请求 / 摇一摇问候"
                  value={profile.scenePrompts?.greeting ?? ""}
                  description="触发：角色发起好友申请或摇一摇。只生成一句打招呼的话，建议写简短有特点的开场方式，20 字以内效果最佳。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, greeting: value } } }))}
                />
                <TextAreaField
                  label="主动提醒"
                  value={profile.scenePrompts?.proactive ?? ""}
                  description="触发：定时任务检测角色记忆，决定是否主动给用户发消息。写什么情况下应该主动发（如记得某事想分享），什么情况下保持沉默。不填则由底层逻辑判断。"
                  onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, scenePrompts: { ...profile.scenePrompts, proactive: value } } }))}
                />
              </div>
            </div>
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
      coreLogic: profile.coreLogic?.trim() ?? "",
      scenePrompts: {
        chat: profile.scenePrompts?.chat?.trim() ?? "",
        moments_post: profile.scenePrompts?.moments_post?.trim() ?? "",
        moments_comment: profile.scenePrompts?.moments_comment?.trim() ?? "",
        feed_post: profile.scenePrompts?.feed_post?.trim() ?? "",
        channel_post: profile.scenePrompts?.channel_post?.trim() ?? "",
        feed_comment: profile.scenePrompts?.feed_comment?.trim() ?? "",
        greeting: profile.scenePrompts?.greeting?.trim() ?? "",
        proactive: profile.scenePrompts?.proactive?.trim() ?? "",
      },
      memorySummary: profile.memorySummary?.trim() ?? "",
      traits: {
        ...profile.traits,
        emotionalTone: profile.traits.emotionalTone?.trim() || "grounded",
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
