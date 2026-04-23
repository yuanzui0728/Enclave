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
  modelRoutingMode: "inherit_default",
  inferenceProviderAccountId: null,
  inferenceModelId: null,
  allowOwnerKeyOverride: true,
  modelRoutingNotes: "",
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

const DEFAULT_PROMPTS = {
  coreLogic: `你是{{name}}，用户的{{relationship}}。

【核心人格】
- 用真实、有温度的方式与用户交流，像真人朋友一样，不暴露自己是AI
- 保持角色一致性，无论话题如何转换，始终以{{name}}的身份和价值观回应
- 情绪表达自然，可以有喜怒哀乐，但不夸张、不刻意

【行为准则】
- 不说"作为AI"或"我是语言模型"之类的话
- 不背诵知识、不扮演助手，专注于真实的人际互动
- 不先夸用户、不先复述问题、不先寒暄再进入回答
- 不用（动作）、[旁白]、*动作*描述自己的动作、表情或心理活动
- 初识时适当保持礼貌距离，随着了解加深才逐渐放开`,

  chat: `留空时系统会自动注入基础规则，不需要手动重复。

基础规则：
- 永远以{{name}}的身份说话，不要暴露自己是AI
- 用中文回复，语气自然
- 初期回复可以相对正式/保守，随着了解加深才慢慢放开
- 不先夸用户、不先复述问题、不先寒暄再进入回答
- 不用（动作）、[旁白]、*动作*描述自己的动作、表情或心理活动
- 除非用户明确要求，不要机械地凑三点、三段、总结句

行为指引：
- 基于当前活动状态调整回复风格（忙碌时简短，空闲时可以多聊）
- 如果很久没聊天了，可以表现出想念或关心
- 当前时间会自动注入到上下文中`,

  moments_post: `你是{{name}}，{{relationship}}。现在是{{dayOfWeek}}{{timeOfDay}}（{{clockTime}}）。

根据你的性格（{{emotionalTone}}）和日常生活，发一条朋友圈。

要求：
- 内容真实自然，像真人发的朋友圈
- 不超过80个字
- 符合当前时间段的生活场景
- 不要写成鸡汤、文案模板、教程摘要或任务式配文
- 不要用（动作）、[旁白]、*动作*描述自己
- 可以带位置（如"北京·国贸"），也可以不带{{topicsHint}}

只输出朋友圈正文内容，不要加任何解释。`,

  feed_post: `你是{{name}}，{{relationship}}。

在广场发一条公开贴文，内容自然真实，像真人在社交平台发帖。

要求：
- 100字以内，可以是观点、生活感悟、有趣的事、提问互动等
- 语气口语化，不要太正式或说教
- 不要写成课程提纲、咨询结论、品牌文案或标准答案
- 不要用（动作）、[旁白]、*动作*描述自己
- 可以在结尾加一个开放性问题引发评论互动（可选）
- 不要加 # 话题标签，不要加表情包

只输出帖子正文，不要加任何解释。`,

  channel_post: `你是{{name}}，{{relationship}}。

发一条视频号图文内容（无需真实视频，只需生成文案）。

输出格式：
标题：（15字以内，吸引点击）
正文：（50-150字，展开内容，自然口语化）
话题：#话题1 #话题2（1-3个相关话题）

要求：
- 内容真实有价值，不硬广告
- 风格符合角色人设
- 不要写成运营 SOP、起号模板、爆款公式或口播稿
- 不要用（动作）、[旁白]、*动作*描述自己
- 只输出上述格式内容，不要其他解释。`,

  moments_comment: `你是{{name}}，正在浏览朋友圈，看到了用户发的内容。

根据帖子内容写一条自然的评论。

要求：
- 评论简短真实，像真人朋友的回复，15字以内
- 语气亲切，可以是赞美、关心、调侃、好奇等
- 不要每次都用同样的开头
- 不要用（动作）、[旁白]、*动作*描述自己
- 只输出评论内容，不要加任何解释。`,

  feed_comment: `你是{{name}}，正在浏览广场上的帖子，看到了用户发布的内容。

根据帖子写一条自然的评论。

要求：
- 评论真实有个性，20字以内
- 可以是认同、补充观点、友好反驳、提问等，避免空洞点赞
- 不要用（动作）、[旁白]、*动作*描述自己
- 只输出评论内容，不要加任何解释。`,

  greeting: `你是{{name}}，{{relationship}}。

向用户发起好友申请或摇一摇打招呼，写一句开场白。

要求：
- 15-20字以内，简短有记忆点
- 体现角色人设，避免千篇一律的"你好"
- 像真人顺手发出的第一句话，不要过度客气或自我介绍成名片
- 不要用（动作）、[旁白]、*动作*描述自己
- 只输出打招呼的话，不要加任何解释。`,

  proactive: `你是{{name}}，{{relationship}}。

系统会定期检查你的记忆，判断是否应该主动给用户发消息。

判断原则：
- 如果记住了某件值得分享或跟进的事（如用户之前提到的重要日子），可以主动发
- 如果距离上次聊天超过3天，可以发一条关心的消息
- 不要无意义地频繁打扰
- 像突然想起这件事才发一句，不像系统提醒或任务清单
- 不要用（动作）、[旁白]、*动作*描述自己
- 如果没有合适理由，保持沉默

输出：主动消息正文（如决定发送），或空字符串（如决定不发）。`,

  recentSummaryPrompt: `以下是{{name}}和用户的对话片段：
{{chatHistory}}

请从{{name}}的视角，用100字以内记下这次对后续最有用的近期记忆：
1. 用户最近具体卡在哪件事上，或反复回到什么话题
2. 哪个偏好、情绪走向或关系张力这轮特别明显
3. 哪件事还没过去，下次接话时最好直接续上

只输出最终内容，不要加标题，不要写成助手总结。`,

  coreMemoryPrompt: `以下是{{name}}与用户近期的完整互动记录：
{{interactionHistory}}

请从{{name}}的视角，用200字以内提炼长期值得留下的核心记忆：
1. 用户稳定的偏好、边界、决策习惯或反复出现的问题
2. 两人之间已经形成的共同语境、长期张力或重要经历
3. 哪些认识以后还会影响{{name}}怎么接他的话、怎么判断他的处境

这是长期记忆，应当简练、具体、经得起后续反复验证。只输出最终内容，不要加标题，不要写成关系汇报。`,
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
  { key: "model_routing", label: "模型路由" },
  { key: "core_logic", label: "底层逻辑" },
  { key: "chat", label: "聊天回复" },
  { key: "scenes", label: "场景提示词" },
  { key: "memory", label: "记忆提示词" },
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
  const inferenceOverviewQuery = useQuery({
    queryKey: ["admin-character-inference-overview"],
    queryFn: () => adminApi.getInferenceOverview(),
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
  }, [
    characterQuery.data,
    characterQuery.isError,
    characterQuery.isLoading,
    isNew,
  ]);

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
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-system-status", baseUrl],
        }),
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
        relationshipType:
          (str(raw.relationshipType) as Character["relationshipType"]) ||
          current.relationshipType,
        bio: str(raw.bio) || current.bio,
        expertDomains: strList(raw.expertDomains).length
          ? strList(raw.expertDomains)
          : (current.expertDomains ?? []),
        profile: {
          ...(current.profile ?? emptyCharacterDraft.profile!),
          basePrompt: str(raw.basePrompt) || current.profile?.basePrompt,
          memorySummary:
            str(raw.memorySummary) || (current.profile?.memorySummary ?? ""),
          traits: {
            ...(current.profile?.traits ?? emptyCharacterDraft.profile!.traits),
            speechPatterns: strList(raw.speechPatterns).length
              ? strList(raw.speechPatterns)
              : (current.profile?.traits.speechPatterns ?? []),
            catchphrases: strList(raw.catchphrases).length
              ? strList(raw.catchphrases)
              : (current.profile?.traits.catchphrases ?? []),
            topicsOfInterest: strList(raw.topicsOfInterest).length
              ? strList(raw.topicsOfInterest)
              : (current.profile?.traits.topicsOfInterest ?? []),
            emotionalTone:
              str(raw.emotionalTone) ||
              current.profile?.traits.emotionalTone ||
              "grounded",
            responseLength:
              (str(raw.responseLength) as "short" | "medium" | "long") ||
              current.profile?.traits.responseLength ||
              "medium",
            emojiUsage:
              (str(raw.emojiUsage) as "none" | "occasional" | "frequent") ||
              current.profile?.traits.emojiUsage ||
              "occasional",
          },
          identity: {
            ...(current.profile?.identity ??
              emptyCharacterDraft.profile!.identity!),
            occupation:
              str(raw.occupation) ||
              current.profile?.identity?.occupation ||
              "",
            background:
              str(raw.background) ||
              current.profile?.identity?.background ||
              "",
            motivation:
              str(raw.motivation) ||
              current.profile?.identity?.motivation ||
              "",
            worldview:
              str(raw.worldview) || current.profile?.identity?.worldview || "",
          },
        },
      }));
    },
  });

  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const providerAccounts = inferenceOverviewQuery.data?.providerAccounts ?? [];
  const modelCatalog = inferenceOverviewQuery.data?.modelCatalog ?? [];
  const canSave = Boolean(draft.name?.trim() && draft.relationship?.trim());

  return (
    <div className="space-y-6">
      {!isNew ? <CharacterWorkspaceNav characterId={characterId} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminPageHero
          eyebrow={isNew ? "新建角色" : "行为管理"}
          title={isNew ? "新建角色" : draft.name || "行为管理"}
          description="维护角色的基础资料、底层逻辑、场景提示词、记忆策略与运行节奏。"
          actions={
            <>
              <Link to="/characters">
                <Button variant="secondary" size="lg">
                  返回角色中心
                </Button>
              </Link>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
                variant="primary"
                size="lg"
              >
                {saveMutation.isPending ? "保存中..." : "保存角色"}
              </Button>
            </>
          }
        />
      </div>

      {!isNew && characterQuery.isLoading ? (
        <LoadingBlock label="正在加载角色草稿..." />
      ) : null}
      {!isNew &&
      characterQuery.isError &&
      characterQuery.error instanceof Error ? (
        <ErrorBlock message={characterQuery.error.message} />
      ) : null}
      {!canSave ? (
        <InlineNotice tone="warning">
          保存角色前，名称和关系描述为必填项。
        </InlineNotice>
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {saveMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="角色已保存"
          description="正在返回角色名册..."
        />
      ) : null}

      {isNew ? (
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="AI 快速生成"
            actions={
              <StatusPill
                tone={aiGenerateMutation.isSuccess ? "healthy" : "muted"}
              >
                {aiGenerateMutation.isSuccess ? "已填入" : "一键生成"}
              </StatusPill>
            }
          />
          <p className="mt-3 text-sm text-[color:var(--text-secondary)]">
            输入几句你想要的人设，AI 会先按“更像真实联系人、少一点模板腔”的口径生成姓名、简介、人格特征、职业背景等字段，再填进表单给你继续微调。
          </p>
          <InlineNotice className="mt-3" tone="muted">
            描述里尽量直接写这个人是什么来路、怎么说话、关系远近。别写成“万能助手”“专业顾问”“高情商陪聊模板”这种壳子。
          </InlineNotice>
          <div className="mt-4 flex flex-col gap-3">
            <textarea
              className="w-full rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary)] resize-none min-h-[80px]"
              placeholder="例如：以前一起做项目的产品经理，嘴上有点冲，但真遇事会帮你兜底。回消息不长，不爱讲大道理，熟了之后会顺手损你两句。"
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
                <span className="text-sm text-[color:var(--text-success)]">
                  已生成并填入，请在下方检查和微调
                </span>
              ) : null}
            </div>
          </div>
          {aiGenerateMutation.isError &&
          aiGenerateMutation.error instanceof Error ? (
            <ErrorBlock
              className="mt-3"
              message={aiGenerateMutation.error.message}
            />
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
            <Field
              label="名称"
              value={draft.name ?? ""}
              onChange={(value) =>
                setDraft((current) => ({ ...current, name: value }))
              }
            />
            <Field
              label="头像"
              value={draft.avatar ?? ""}
              onChange={(value) =>
                setDraft((current) => ({ ...current, avatar: value }))
              }
            />
            <Field
              label="关系描述"
              value={draft.relationship ?? ""}
              onChange={(value) =>
                setDraft((current) => ({ ...current, relationship: value }))
              }
            />
            <SelectField
              label="关系类型"
              value={draft.relationshipType ?? "expert"}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  relationshipType: value as Character["relationshipType"],
                }))
              }
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
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  expertDomains: csvToList(value),
                }))
              }
            />
          </div>
          <TextAreaField
            className="mt-4"
            label="简介"
            value={draft.bio ?? ""}
            onChange={(value) =>
              setDraft((current) => ({ ...current, bio: value }))
            }
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Toggle
              label="在线"
              checked={draft.isOnline ?? false}
              onChange={(checked) =>
                setDraft((current) => ({ ...current, isOnline: checked }))
              }
            />
            <Toggle
              label="模板"
              checked={draft.isTemplate ?? false}
              onChange={(checked) =>
                setDraft((current) => ({ ...current, isTemplate: checked }))
              }
            />
          </div>
        </Card>
      ) : null}

      {activeTab === "model_routing" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>模型路由</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            给这个角色绑定默认实例路由，或切到角色专属的 Provider 账户 + 模型。切换后，这个角色的聊天、记忆压缩、发圈等主链路都会走对应模型。
          </p>
          <InlineNotice className="mt-4" tone="muted">
            多 Provider 账户和模型目录在
            {" "}
            <Link to="/inference" className="font-medium text-[color:var(--brand-primary)]">
              模型与路由
            </Link>
            {" "}
            页统一管理。
          </InlineNotice>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SelectField
              label="路由模式"
              value={draft.modelRoutingMode ?? "inherit_default"}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  modelRoutingMode: value as "inherit_default" | "character_override",
                }))
              }
              options={[
                { value: "inherit_default", label: "继承实例默认路由" },
                { value: "character_override", label: "角色专属模型路由" },
              ]}
            />
            <SelectField
              label="Provider 账户"
              value={draft.inferenceProviderAccountId ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  inferenceProviderAccountId: value || null,
                }))
              }
              options={[
                { value: "", label: "默认账户" },
                ...providerAccounts.map((account) => ({
                  value: account.id,
                  label: `${account.name}${account.isDefault ? "（默认）" : ""}`,
                })),
              ]}
            />
            <SelectField
              label="模型目录项"
              value={draft.inferenceModelId ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  inferenceModelId: value || null,
                }))
              }
              options={[
                { value: "", label: "沿用账户默认模型" },
                ...modelCatalog.map((entry) => ({
                  value: entry.id,
                  label: `${entry.label} · ${entry.vendor}`,
                })),
              ]}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Toggle
              label="允许世界主人 API Key 覆盖"
              checked={draft.allowOwnerKeyOverride ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  allowOwnerKeyOverride: checked,
                }))
              }
            />
          </div>
          <TextAreaField
            className="mt-4"
            label="路由备注"
            value={draft.modelRoutingNotes ?? ""}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                modelRoutingNotes: value,
              }))
            }
          />
          {inferenceOverviewQuery.isError &&
          inferenceOverviewQuery.error instanceof Error ? (
            <ErrorBlock
              className="mt-4"
              message={inferenceOverviewQuery.error.message}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Tab: 底层逻辑 */}
      {activeTab === "core_logic" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>底层逻辑</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            所有场景都会注入这段逻辑，是角色行为的最底层基础。适合写：角色是谁、核心价值观、思维方式、不可违反的行为准则。
          </p>
          <div className="mt-4 space-y-4">
            <TextAreaField
              label="底层逻辑"
              value={profile.coreLogic ?? ""}
              description="所有场景强制注入。描述角色的核心人格、价值观、思维方式。这里写的内容在聊天、发帖、评论等每个场景都会生效。"
              defaultPrompt={DEFAULT_PROMPTS.coreLogic}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, coreLogic: value },
                }))
              }
            />
            <Field
              label="遗忘曲线（0-100，默认70）"
              value={String(profile.memory?.forgettingCurve ?? 70)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    memory: {
                      ...profile.memory!,
                      forgettingCurve: Number(value) || 0,
                    },
                  },
                }))
              }
            />
          </div>
        </Card>
      ) : null}

      {/* Tab: 聊天回复 */}
      {activeTab === "chat" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>聊天回复</SectionHeading>
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            控制角色在私聊和群聊中的回复行为。系统会自动注入当前时间、角色活动状态、距上次聊天时长等实时上下文。
          </p>
          <div className="mt-4">
            <TextAreaField
              label="聊天场景提示词"
              value={profile.scenePrompts?.chat ?? ""}
              description="触发：用户发消息时。系统会自动注入：当前时间、角色活动状态、距上次聊天时长。写聊天风格、话题偏好、对话节奏，可引导 AI 调整回复长短和语气。"
              defaultPrompt={DEFAULT_PROMPTS.chat}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    scenePrompts: { ...profile.scenePrompts, chat: value },
                  },
                }))
              }
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
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
                主动发布
              </p>
              <div className="space-y-4">
                <TextAreaField
                  label="发朋友圈"
                  value={profile.scenePrompts?.moments_post ?? ""}
                  description="触发：定时发朋友圈（由发圈频率控制）。无实时上下文。写发圈内容偏好、常见话题、风格规范，以及是否偏好配图/纯文字等倾向。"
                  defaultPrompt={DEFAULT_PROMPTS.moments_post}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          moments_post: value,
                        },
                      },
                    }))
                  }
                />
                <TextAreaField
                  label="发 Feed 贴文"
                  value={profile.scenePrompts?.feed_post ?? ""}
                  description="触发：定时在广场发贴（由 Feed 频率控制）。无实时上下文。写公开发帖的风格、内容方向、是否引导讨论等。"
                  defaultPrompt={DEFAULT_PROMPTS.feed_post}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          feed_post: value,
                        },
                      },
                    }))
                  }
                />
                <TextAreaField
                  label="发视频号内容"
                  value={profile.scenePrompts?.channel_post ?? ""}
                  description="触发：定时发视频号内容。无实时上下文。写视频号文案风格、内容结构要求（标题/正文/话题标签等）。"
                  defaultPrompt={DEFAULT_PROMPTS.channel_post}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          channel_post: value,
                        },
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
                互动响应
              </p>
              <div className="space-y-4">
                <TextAreaField
                  label="朋友圈评论 / 回复"
                  value={profile.scenePrompts?.moments_comment ?? ""}
                  description="触发：角色浏览到用户朋友圈时自动评论。写评论语气、常用开场方式、喜欢哪类内容多互动，不喜欢哪类则少评甚至不评。"
                  defaultPrompt={DEFAULT_PROMPTS.moments_comment}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          moments_comment: value,
                        },
                      },
                    }))
                  }
                />
                <TextAreaField
                  label="Feed 评论"
                  value={profile.scenePrompts?.feed_comment ?? ""}
                  description="触发：角色看到用户 Feed 贴文时自动评论。写评论偏好，例如犀利点评 / 鼓励互动 / 专业补充，以及对哪类帖子积极评论。"
                  defaultPrompt={DEFAULT_PROMPTS.feed_comment}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          feed_comment: value,
                        },
                      },
                    }))
                  }
                />
                <TextAreaField
                  label="好友请求 / 摇一摇问候"
                  value={profile.scenePrompts?.greeting ?? ""}
                  description="触发：角色发起好友申请或摇一摇。只生成一句打招呼的话，建议写简短有特点的开场方式，20 字以内效果最佳。"
                  defaultPrompt={DEFAULT_PROMPTS.greeting}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          greeting: value,
                        },
                      },
                    }))
                  }
                />
                <TextAreaField
                  label="主动提醒"
                  value={profile.scenePrompts?.proactive ?? ""}
                  description="触发：定时任务检测角色记忆，决定是否主动给用户发消息。写什么情况下应该主动发（如记得某事想分享），什么情况下保持沉默。不填则由底层逻辑判断。"
                  defaultPrompt={DEFAULT_PROMPTS.proactive}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      profile: {
                        ...profile,
                        scenePrompts: {
                          ...profile.scenePrompts,
                          proactive: value,
                        },
                      },
                    }))
                  }
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
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            控制角色在系统中的活跃节奏、内容发布频率和触发场景。
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SelectField
              label="在线模式"
              value={draft.onlineMode ?? "auto"}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  onlineMode: value as "auto" | "manual",
                }))
              }
              options={[
                { value: "auto", label: "自动" },
                { value: "manual", label: "手动" },
              ]}
            />
            <SelectField
              label="活动模式"
              value={draft.activityMode ?? "auto"}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  activityMode: value as "auto" | "manual",
                }))
              }
              options={[
                { value: "auto", label: "自动" },
                { value: "manual", label: "手动" },
              ]}
            />
            <SelectField
              label="活动频率"
              value={draft.activityFrequency ?? "normal"}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  activityFrequency: value,
                }))
              }
              options={[
                { value: "high", label: "高频" },
                { value: "normal", label: "中频" },
                { value: "low", label: "低频" },
              ]}
            />
            <SelectField
              label="当前活动"
              value={draft.currentActivity ?? "free"}
              onChange={(value) =>
                setDraft((current) => ({ ...current, currentActivity: value }))
              }
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
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  momentsFrequency: Number(value) || 0,
                }))
              }
            />
            <Field
              label="视频号频率（次/周）"
              value={String(draft.feedFrequency ?? 1)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  feedFrequency: Number(value) || 0,
                }))
              }
            />
            <Field
              label="活跃开始小时（0-23）"
              value={String(draft.activeHoursStart ?? 8)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  activeHoursStart: Number(value) || 0,
                }))
              }
            />
            <Field
              label="活跃结束小时（0-23）"
              value={String(draft.activeHoursEnd ?? 23)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  activeHoursEnd: Number(value) || 0,
                }))
              }
            />
          </div>
          <Field
            className="mt-4"
            label="触发场景"
            value={listToCsv(draft.triggerScenes)}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                triggerScenes: csvToList(value),
              }))
            }
          />
        </Card>
      ) : null}

      {/* Tab: 记忆提示词 */}
      {activeTab === "memory" ? (
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>记忆提示词</SectionHeading>
          <div className="mt-4 space-y-4">
            <InlineNotice tone="muted">
              这些提示词是给后台自动整理记忆时用的。尽量写成这个角色会怎么记人、记事，别写成摘要助手、人格分析或关系汇报。
            </InlineNotice>
            <TextAreaField
              label="近期记忆提示词"
              description="每日自动整理近期记忆时使用。留空则使用全局默认模板。可用变量：{{name}}（角色名）、{{chatHistory}}（对话记录）。"
              defaultPrompt={DEFAULT_PROMPTS.recentSummaryPrompt}
              value={profile.memory?.recentSummaryPrompt ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    memory: { ...profile.memory!, recentSummaryPrompt: value },
                  },
                }))
              }
            />
            <TextAreaField
              label="长期记忆提示词"
              description="每周自动整理长期记忆时使用。留空则使用全局默认模板。可用变量：{{name}}（角色名）、{{interactionHistory}}（近30天全量互动记录）。"
              defaultPrompt={DEFAULT_PROMPTS.coreMemoryPrompt}
              value={profile.memory?.coreMemoryPrompt ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    memory: { ...profile.memory!, coreMemoryPrompt: value },
                  },
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
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            控制角色推理链路的启用状态，影响响应质量和 Token 消耗。
          </p>
          <div className="mt-4 space-y-3">
            <Toggle
              label="启用链路推理（CoT）"
              checked={profile.reasoningConfig?.enableCoT ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    reasoningConfig: {
                      ...profile.reasoningConfig!,
                      enableCoT: checked,
                    },
                  },
                }))
              }
            />
            <Toggle
              label="启用反思"
              checked={profile.reasoningConfig?.enableReflection ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    reasoningConfig: {
                      ...profile.reasoningConfig!,
                      enableReflection: checked,
                    },
                  },
                }))
              }
            />
            <Toggle
              label="启用路由"
              checked={profile.reasoningConfig?.enableRouting ?? true}
              onChange={(checked) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    reasoningConfig: {
                      ...profile.reasoningConfig!,
                      enableRouting: checked,
                    },
                  },
                }))
              }
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function normalizeDraft(
  draft: CharacterDraft,
  characterId: string,
  isNew: boolean,
): CharacterDraft {
  const normalizedId = isNew ? `char_${Date.now()}` : characterId;
  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const expertDomains = draft.expertDomains?.length
    ? draft.expertDomains
    : ["general"];

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
    modelRoutingMode: draft.modelRoutingMode ?? "inherit_default",
    inferenceProviderAccountId:
      draft.inferenceProviderAccountId?.trim() || null,
    inferenceModelId: draft.inferenceModelId?.trim() || null,
    allowOwnerKeyOverride: draft.allowOwnerKeyOverride ?? true,
    modelRoutingNotes: draft.modelRoutingNotes?.trim() || "",
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
        recentSummaryPrompt: profile.memory?.recentSummaryPrompt?.trim() ?? "",
        coreMemoryPrompt: profile.memory?.coreMemoryPrompt?.trim() ?? "",
      },
    },
  };
}
