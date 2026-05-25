/**
 * 角色编辑器共享组件。
 *
 * 私有角色（/my-characters/{new,$id}）和世界角色（/character/$id/edit、
 * /create）共用同一套 6-section 表单 + AI 一键生成 + 草稿会话 +
 * optimize 模式 + sacred gate。两边的差异：
 *
 * - 保存出口（私有 → /wiki/my-characters；世界 → /wiki/pages/:id/edits 评审队列）
 * - AI 生成入口（私有 → /wiki/my-characters/ai-generate；世界 → /wiki/ai-generate-character-fields）
 * - 文案（标题、保存按钮、底部 hint）
 * - 头部 actions（私有有「导出」「删除」；世界有「pending revision」提示）
 * - footer extras（世界角色需要 editSummary 输入 + minor 复选框 + 摘要校验）
 *
 * 所有差异都通过 props 流入，组件本身对 scope 几乎无感（只在两处 sessionKey
 * 拼接 + 内部默认 hint 里用到 scope 作字符串）。
 */
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Trans } from "@lingui/react/macro";
import {
  isCustomRelationshipType,
  type CharacterBlueprintRecipe,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppSection,
  Button,
  InlineNotice,
  SelectField,
  TagBadge,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import {
  wikiApi,
  type AiGenerateSection,
  type AiGeneratedDraft,
  type PrivateCharacterDto,
} from "../lib/wiki-api";
import { QuotaExhaustedNotice } from "./quota-exhausted-notice";
import {
  isSafeAvatarValue,
  isVisuallyEmpty,
  splitCommaList,
} from "../lib/string-utils";
import {
  clearEditSession,
  consumeGenerationResult,
  setFormSnapshot,
  startGeneration,
  useEditSession,
  type EditSessionKey,
  type SessionGenerator,
} from "../lib/my-character-edit-session";
import { FormRow } from "./form-row";

const RELATIONSHIP_TYPE_OPTIONS = [
  { value: "friend", label: msg`朋友` },
  { value: "family", label: msg`家人` },
  { value: "mentor", label: msg`导师` },
  { value: "expert", label: msg`专家` },
  { value: "custom", label: msg`自定义` },
] as const;

function normalizeRelationshipType(raw: string | undefined | null): string {
  if (!raw) return "friend";
  return raw === "custom" ? "" : raw;
}

// 6 个 section；wiki 私有角色把「聊天回复」放到「底层逻辑」上面（用户填写顺序更顺手）。
const SECTIONS = [
  { id: "char-section-basics", label: msg`基础信息` },
  { id: "char-section-chat", label: msg`聊天回复` },
  { id: "char-section-core-logic", label: msg`底层逻辑` },
  { id: "char-section-scenes", label: msg`场景提示词` },
  { id: "char-section-memory", label: msg`记忆提示词` },
  { id: "char-section-social-params", label: msg`社交参数` },
] as const;

// 留空时后端实际会注入的默认 prompt。仅作 placeholder。
// i18n-ignore-start: data / seed / preset content — not user-facing UI strings.
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
} as const;
// i18n-ignore-end

// recipe 里 admin 编辑器不暴露的子结构，用空字符串/默认值占位。后端 wiki.types.ts
// normalizeWikiRecipe 会再 normalize 一道，确保最终落库 JSON 不残留这些值。
const EMPTY_IDENTITY_EXTRA = {
  occupation: "",
  background: "",
  motivation: "",
  worldview: "",
} as const;
const EMPTY_EXPERTISE_EXTRA = {
  expertiseDescription: "",
  knowledgeLimits: "",
  refusalStyle: "",
} as const;
const EMPTY_TONE: CharacterBlueprintRecipe["tone"] = {
  speechPatterns: [],
  catchphrases: [],
  topicsOfInterest: [],
  emotionalTone: "",
  responseLength: "medium",
  emojiUsage: "occasional",
  workStyle: "",
  socialStyle: "",
  taboos: [],
  quirks: [],
  coreDirective: "",
  basePrompt: "",
  systemPrompt: "",
};
const EMPTY_MEMORY_SEED_EXTRA = {
  memorySummary: "",
  coreMemory: "",
  recentSummarySeed: "",
} as const;

export type CharacterEditFormProps = {
  mode: "create" | "edit";
  /** scope 决定 sessionKey 命名空间 + AI 生成端点 + 部分默认文案 */
  scope: "private" | "world";
  sessionKey: EditSessionKey;
  /** edit 模式：从父组件异步喂进来（query 加载完）；create 模式可传 null */
  initialDto: PrivateCharacterDto | null;
  /** edit 模式 query 还没完成时为 true；create 模式恒为 false */
  isInitialLoading?: boolean;
  /** 一旦 initial hydrate 完成，hydratedSignal 变化会触发组件按新 initialDto 重新 hydrate */
  hydrationToken?: string | number | null;
  /** AI 生成的 wiki API 调用。私有 → wikiApi.generateMyCharacterFields；世界 → wikiApi.generateCharacterFields */
  generator: SessionGenerator;
  /** 提交保存（成功时 resolve；失败时 reject 由组件 catch 显示 error） */
  onSave: (dto: PrivateCharacterDto) => Promise<void>;
  /** 父组件已知保存正在进行时（包含 react-query 的 isPending）告知组件 disable 按钮 */
  isSavePending: boolean;
  /** 提交失败时父组件传入的错误（react-query mutation.error 之类）；组件无需自己 catch */
  saveError: string | null;
  /** 保存按钮文案（create / edit / pending 三态） */
  saveButtonLabel: {
    create: ReactNode;
    edit: ReactNode;
    pending: ReactNode;
  };
  /** 表单底部 hint 文字（创建期 vs 编辑期不同；私有 vs 世界不同） */
  saveFooterHint: { create: ReactNode; edit: ReactNode };
  /** 保存成功时顶部一闪 flash 文案；不传则使用默认 "已保存 ✓" */
  savedFlashMessage?: ReactNode;
  /** 保存成功后是否要 component 内部清掉 session（默认 true，符合 create→后跳页面的语义） */
  clearSessionOnSave?: boolean;
  /**
   * 表单底部插槽，放在保存按钮上方。世界角色专用：editSummary 输入 + isMinor
   * 复选框 + 摘要长度校验文案；私有角色传 null。
   * 注意：禁用按钮的判定（如世界角色需要 ≥10 字 editSummary）通过 extraSaveDisabledReason
   * 透传给组件。
   */
  footerSlot?: ReactNode;
  /**
   * 父组件可以额外禁用保存按钮（比如世界角色 editSummary 不足 10 字）；
   * 这里只透传"是否禁用 + 禁用原因文字"，按钮渲染仍由组件统一处理。
   */
  extraSaveDisabledReason?: string | null;
  /**
   * AI 生成完成时的副作用回调，**在 updates 应用到表单 + consumeGenerationResult
   * 之前**触发。当前唯一用途：私有 create + section='all' 完成时，后端回
   * linkedDraftId，父组件用它跳 `/my-characters/new?draftId=xxx` 让 URL 反映状态。
   *
   * 不放进 useEffect 自己处理是因为子组件的 effect 会先于父组件的 effect 执行
   * → 子组件 consumeGenerationResult 后父组件看不到 done 状态，捕不到 linkedDraftId。
   */
  onGenerationDone?: (state: {
    section: AiGenerateSection;
    linkedDraftId: string | null;
  }) => void;
};

export function CharacterEditForm(props: CharacterEditFormProps) {
  const {
    mode,
    scope,
    sessionKey,
    initialDto,
    isInitialLoading = false,
    hydrationToken,
    generator,
    onSave,
    isSavePending,
    saveError,
    saveButtonLabel,
    saveFooterHint,
    savedFlashMessage,
    clearSessionOnSave = true,
    footerSlot,
    extraSaveDisabledReason,
    onGenerationDone,
  } = props;

  const t = useRuntimeTranslator();
  const session = useEditSession(sessionKey);

  // —— 基础信息 ——
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [relationship, setRelationship] = useState("");
  const [relationshipType, setRelationshipType] = useState("friend");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState("");
  const [expertDomains, setExpertDomains] = useState("");

  // —— 底层逻辑 ——
  const [coreLogic, setCoreLogic] = useState("");
  const [forgettingCurve, setForgettingCurve] = useState("70");

  // —— 聊天回复 ——
  const [chatPrompt, setChatPrompt] = useState("");

  // —— 场景提示词 ——
  const [momentsPostPrompt, setMomentsPostPrompt] = useState("");
  const [momentsCommentPrompt, setMomentsCommentPrompt] = useState("");
  const [feedPostPrompt, setFeedPostPrompt] = useState("");
  const [channelPostPrompt, setChannelPostPrompt] = useState("");
  const [feedCommentPrompt, setFeedCommentPrompt] = useState("");
  const [greetingPrompt, setGreetingPrompt] = useState("");
  const [proactivePrompt, setProactivePrompt] = useState("");

  // —— 记忆提示词 ——
  const [recentSummaryPrompt, setRecentSummaryPrompt] = useState("");
  const [coreMemoryPrompt, setCoreMemoryPrompt] = useState("");
  // memorySeed 里的 memorySummary / coreMemory / recentSummarySeed 是 wiki UI
  // **不暴露**给用户的字段（admin character editor 才管），但 buildDto 又必须
  // 整体输出 memorySeed 对象。历史实现里直接写空串，结果对已发布角色：
  //  - admin 编辑 → 字段保护对 admin 没影响 → 静默把这三个字段抹空
  //  - newcomer 编辑 → 字段保护 → 403 "memorySeed.coreMemory 受保护"
  // 修复：hydrate 时把原值存起来透传，buildDto 直接复用，UI 只管 *Prompt 那
  // 三个真正暴露给用户的字段。
  const [memorySummaryPassthrough, setMemorySummaryPassthrough] = useState("");
  const [coreMemoryPassthrough, setCoreMemoryPassthrough] = useState("");
  const [recentSummarySeedPassthrough, setRecentSummarySeedPassthrough] = useState("");

  // —— 社交参数 ——
  const [socialOpenness, setSocialOpenness] = useState("normal");
  const [proactiveBrowseChance, setProactiveBrowseChance] = useState("0.3");
  const [intimacyLevel, setIntimacyLevel] = useState("0");

  const [savedFlash, setSavedFlash] = useState(false);
  const [aiFlash, setAiFlash] = useState<{
    section: AiGenerateSection;
    count: number;
    optimize: boolean;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // 429 单独走结构化状态：要渲染"额度用完 + 商务联系卡片"，不只是一行文字。
  // 普通报错继续走 aiError 字符串路径。
  const [aiQuotaExhausted, setAiQuotaExhausted] = useState<{
    quota: number;
    retryAfterSec: number | null;
  } | null>(null);
  const [optimizeModal, setOptimizeModal] = useState<{
    section: AiGenerateSection;
  } | null>(null);
  const [hydrationDone, setHydrationDone] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const hydratedTokenRef = useRef<string | number | null>(null);
  const savedFlashTimerRef = useRef<number | null>(null);
  const aiFlashTimerRef = useRef<number | null>(null);
  const buildCurrentDraftRef = useRef<() => PrivateCharacterDto>(() => ({
    name: "",
    avatar: "",
    bio: "",
    personality: null,
    relationship: "",
    relationshipType: "friend",
    region: null,
    expertDomains: [],
    recipe: null,
    profile: null,
    socialOpenness: "normal",
    proactiveBrowseChance: 0.3,
    intimacyLevel: 0,
  }));
  const skipSnapshotOnUnmountRef = useRef(false);

  useEffect(
    () => () => {
      if (savedFlashTimerRef.current !== null) {
        window.clearTimeout(savedFlashTimerRef.current);
      }
      if (aiFlashTimerRef.current !== null) {
        window.clearTimeout(aiFlashTimerRef.current);
      }
      if (skipSnapshotOnUnmountRef.current) return;
      const draft = buildCurrentDraftRef.current();
      try {
        setFormSnapshot(sessionKey, draft);
      } catch {
        // never block unmount
      }
    },
    [sessionKey],
  );

  const generationStatus = session.generation.status;
  const generationStartedAt =
    session.generation.status === "pending" ? session.generation.startedAt : 0;
  useEffect(() => {
    if (generationStatus !== "pending") {
      setElapsedSec(0);
      return;
    }
    const tick = () => {
      setElapsedSec(Math.floor((Date.now() - generationStartedAt) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [generationStatus, generationStartedAt]);

  // hydrate from initialDto。hydrationToken 变化（比如父级 query 完成 / 角色 id
  // 切换 / create 模式首次 hydrate）触发重 hydrate。
  useEffect(() => {
    const token = hydrationToken ?? (mode === "create" ? "new" : null);
    if (token === null) return;
    if (hydratedTokenRef.current === token) return;
    if (initialDto) {
      applyDtoToForm(initialDto);
    }
    hydratedTokenRef.current = token;
    // 草稿恢复（token 形如 draft:<id> / draft-loading:<id>）时，草稿即权威内容：
    // 用户已在父级确认过"恢复草稿会覆盖[未保存内容]"。此时绝不能再把 "private:new"
    // 残留 session 快照 overlay 回表单，否则会盖掉刚 apply 上去的草稿（与确认框承诺
    // 相反，name/bio 等字段被旧残留顶掉）。父级 clearEditSession 因 React 子→父
    // effect 执行顺序晚于本 overlay，兜底不及，必须在此显式跳过。
    // 用户取消恢复时父级会跳回无 draftId 的创建页 → token 变回 "new"，届时 overlay
    // 照常恢复其未保存编辑，行为不受影响。
    const restoringDraft =
      typeof token === "string" &&
      (token.startsWith("draft:") || token.startsWith("draft-loading:"));
    const sessSnap = session.formSnapshot;
    if (sessSnap && !restoringDraft) overlaySnapshotToForm(sessSnap);
    setHydrationDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationToken, initialDto, mode]);

  function applyDtoToForm(r: PrivateCharacterDto): void {
    setName(r.name ?? "");
    setAvatar(r.avatar ?? "");
    setRelationship(r.relationship ?? "");
    setRelationshipType(normalizeRelationshipType(r.relationshipType));
    setBio(r.bio ?? "");
    setRegion(r.region ?? "");
    setExpertDomains((r.expertDomains ?? []).join(", "));
    if (typeof r.socialOpenness === "string") {
      setSocialOpenness(r.socialOpenness);
    }
    if (typeof r.proactiveBrowseChance === "number") {
      setProactiveBrowseChance(String(r.proactiveBrowseChance));
    }
    if (typeof r.intimacyLevel === "number") {
      setIntimacyLevel(String(r.intimacyLevel));
    }
    const rp = r.recipe;
    if (rp) {
      const pr = rp.prompting ?? ({} as CharacterBlueprintRecipe["prompting"]);
      setCoreLogic(pr.coreLogic ?? "");
      const sp = pr.scenePrompts ?? ({} as CharacterBlueprintRecipe["prompting"]["scenePrompts"]);
      setChatPrompt(sp.chat ?? "");
      setMomentsPostPrompt(sp.moments_post ?? "");
      setMomentsCommentPrompt(sp.moments_comment ?? "");
      setFeedPostPrompt(sp.feed_post ?? "");
      setChannelPostPrompt(sp.channel_post ?? "");
      setFeedCommentPrompt(sp.feed_comment ?? "");
      setGreetingPrompt(sp.greeting ?? "");
      setProactivePrompt(sp.proactive ?? "");
      const ms = rp.memorySeed ?? ({} as CharacterBlueprintRecipe["memorySeed"]);
      if (typeof ms.forgettingCurve === "number") {
        setForgettingCurve(String(ms.forgettingCurve));
      }
      setRecentSummaryPrompt(ms.recentSummaryPrompt ?? "");
      setCoreMemoryPrompt(ms.coreMemoryPrompt ?? "");
      // 保存 hydrate 出来的"非 UI"字段，buildDto 直接回写，避免抹空触发字段保护。
      setMemorySummaryPassthrough(
        typeof (ms as { memorySummary?: unknown }).memorySummary === "string"
          ? ((ms as { memorySummary?: string }).memorySummary ?? "")
          : "",
      );
      setCoreMemoryPassthrough(
        typeof (ms as { coreMemory?: unknown }).coreMemory === "string"
          ? ((ms as { coreMemory?: string }).coreMemory ?? "")
          : "",
      );
      setRecentSummarySeedPassthrough(
        typeof (ms as { recentSummarySeed?: unknown }).recentSummarySeed === "string"
          ? ((ms as { recentSummarySeed?: string }).recentSummarySeed ?? "")
          : "",
      );
    }
  }

  function overlaySnapshotToForm(snap: PrivateCharacterDto): void {
    if (snap.name) setName(snap.name);
    if (snap.avatar) setAvatar(snap.avatar);
    if (snap.relationship) setRelationship(snap.relationship);
    if (snap.relationshipType) {
      setRelationshipType(normalizeRelationshipType(snap.relationshipType));
    }
    if (snap.bio) setBio(snap.bio);
    if (typeof snap.region === "string") setRegion(snap.region);
    if (snap.expertDomains?.length) {
      setExpertDomains(snap.expertDomains.join(", "));
    }
    if (typeof snap.socialOpenness === "string") {
      setSocialOpenness(snap.socialOpenness);
    }
    if (typeof snap.proactiveBrowseChance === "number") {
      setProactiveBrowseChance(String(snap.proactiveBrowseChance));
    }
    if (typeof snap.intimacyLevel === "number") {
      setIntimacyLevel(String(snap.intimacyLevel));
    }
    const rp = snap.recipe;
    if (!rp) return;
    const pr = rp.prompting ?? ({} as CharacterBlueprintRecipe["prompting"]);
    if (pr.coreLogic) setCoreLogic(pr.coreLogic);
    const sp = pr.scenePrompts ?? ({} as CharacterBlueprintRecipe["prompting"]["scenePrompts"]);
    if (sp.chat) setChatPrompt(sp.chat);
    if (sp.moments_post) setMomentsPostPrompt(sp.moments_post);
    if (sp.moments_comment) setMomentsCommentPrompt(sp.moments_comment);
    if (sp.feed_post) setFeedPostPrompt(sp.feed_post);
    if (sp.channel_post) setChannelPostPrompt(sp.channel_post);
    if (sp.feed_comment) setFeedCommentPrompt(sp.feed_comment);
    if (sp.greeting) setGreetingPrompt(sp.greeting);
    if (sp.proactive) setProactivePrompt(sp.proactive);
    const ms = rp.memorySeed ?? ({} as CharacterBlueprintRecipe["memorySeed"]);
    if (typeof ms.forgettingCurve === "number") {
      setForgettingCurve(String(ms.forgettingCurve));
    }
    if (ms.recentSummaryPrompt) setRecentSummaryPrompt(ms.recentSummaryPrompt);
    if (ms.coreMemoryPrompt) setCoreMemoryPrompt(ms.coreMemoryPrompt);
  }

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [submitErrorOverride, setSubmitErrorOverride] = useState<string | null>(
    null,
  );

  function buildDto(): PrivateCharacterDto | null {
    setAvatarError(null);
    const trimmedAvatar = avatar.trim();
    if (!isSafeAvatarValue(trimmedAvatar)) {
      setAvatarError(
        t(msg`头像只能填 emoji、http(s) URL 或 / 开头的站内路径`),
      );
      return null;
    }

    const trimmedName = name.trim();
    const trimmedRelationship = relationship.trim();
    const trimmedRelationshipType = relationshipType.trim() || "friend";
    const trimmedRegion = region.trim();
    const expertList = splitCommaList(expertDomains);

    const fc = parseIntInRange(forgettingCurve, 0, 100);
    const pbc = parseFloatInRange(proactiveBrowseChance, 0, 1);
    const il = parseIntInRange(intimacyLevel, 0, 100);

    const recipe: CharacterBlueprintRecipe = {
      identity: {
        name: trimmedName,
        relationship: trimmedRelationship,
        relationshipType: trimmedRelationshipType,
        avatar: trimmedAvatar,
        bio: bio.trim(),
        ...EMPTY_IDENTITY_EXTRA,
        region: trimmedRegion,
      },
      expertise: {
        expertDomains: expertList,
        ...EMPTY_EXPERTISE_EXTRA,
      },
      tone: EMPTY_TONE,
      prompting: {
        coreLogic: coreLogic.trim(),
        scenePrompts: {
          chat: chatPrompt.trim(),
          moments_post: momentsPostPrompt.trim(),
          moments_comment: momentsCommentPrompt.trim(),
          feed_post: feedPostPrompt.trim(),
          channel_post: channelPostPrompt.trim(),
          feed_comment: feedCommentPrompt.trim(),
          greeting: greetingPrompt.trim(),
          proactive: proactivePrompt.trim(),
        },
      },
      memorySeed: {
        // 透传 hydrate 时拿到的原值，避免 wiki UI 不暴露的三个字段被抹空触发
        // memorySeed.coreMemory / memorySummary / recentSummarySeed 的字段保护
        // 403（这三个字段 admin character editor 才管）。
        memorySummary: memorySummaryPassthrough,
        coreMemory: coreMemoryPassthrough,
        recentSummarySeed: recentSummarySeedPassthrough,
        forgettingCurve: fc ?? 70,
        recentSummaryPrompt: recentSummaryPrompt.trim(),
        coreMemoryPrompt: coreMemoryPrompt.trim(),
      },
      reasoning: {
        enableCoT: false,
        enableReflection: false,
        enableRouting: false,
      },
      lifeStrategy: {
        activityFrequency: "normal",
        momentsFrequency: 1,
        feedFrequency: 1,
        activeHoursStart: null,
        activeHoursEnd: null,
        triggerScenes: [],
      },
      publishMapping: {
        isTemplate: false,
        onlineModeDefault: "auto",
        activityModeDefault: "auto",
        initialOnline: false,
        initialActivity: null,
      },
    };

    return {
      name: trimmedName,
      avatar: trimmedAvatar,
      bio: bio.trim(),
      personality: null,
      relationship: trimmedRelationship,
      relationshipType: trimmedRelationshipType,
      // region 空 → null：和朋友信息页 `friendship?.region || character?.region`
      // 的空白判定对齐，避免 "" 落库后前端 trim() 也算非空但显示一个空白行。
      region: trimmedRegion === "" ? null : trimmedRegion,
      expertDomains: expertList,
      recipe,
      profile: null,
      socialOpenness: socialOpenness || "normal",
      proactiveBrowseChance: pbc ?? 0.3,
      intimacyLevel: il ?? 0,
    };
  }

  function buildCurrentDraft(): PrivateCharacterDto {
    return (
      buildDto() ?? {
        name: name.trim(),
        avatar: avatar.trim(),
        bio: bio.trim(),
        personality: null,
        relationship: relationship.trim(),
        relationshipType: relationshipType.trim() || "friend",
        region: region.trim() === "" ? null : region.trim(),
        expertDomains: splitCommaList(expertDomains),
        recipe: null,
        profile: null,
        socialOpenness: socialOpenness || "normal",
        proactiveBrowseChance: parseFloatInRange(proactiveBrowseChance, 0, 1) ?? 0.3,
        intimacyLevel: parseIntInRange(intimacyLevel, 0, 100) ?? 0,
      }
    );
  }

  buildCurrentDraftRef.current = buildCurrentDraft;

  function isSectionFull(section: AiGenerateSection): boolean {
    const s = (v: string) => v.trim().length > 0;
    switch (section) {
      case "basics":
        return s(avatar) && s(expertDomains);
      case "core_logic":
        return s(coreLogic);
      case "chat":
        return s(chatPrompt);
      case "scenes":
        return (
          s(momentsPostPrompt) &&
          s(momentsCommentPrompt) &&
          s(feedPostPrompt) &&
          s(channelPostPrompt) &&
          s(feedCommentPrompt) &&
          s(greetingPrompt) &&
          s(proactivePrompt)
        );
      case "memory":
        return s(recentSummaryPrompt) && s(coreMemoryPrompt);
      case "all":
        return (
          isSectionFull("basics") &&
          isSectionFull("core_logic") &&
          isSectionFull("chat") &&
          isSectionFull("scenes") &&
          isSectionFull("memory")
        );
    }
  }

  function applyUpdatesFillEmptyOnly(updates: AiGeneratedDraft): number {
    let count = 0;
    const setIfEmptyStr = (
      cur: string,
      next: string | undefined,
      setter: (v: string) => void,
    ) => {
      if (next === undefined) return;
      const v = next.trim();
      if (!v) return;
      if (cur.trim() !== "") return;
      setter(v);
      count += 1;
    };
    const setIfEmptyArr = (
      cur: string,
      next: string[] | undefined,
      setter: (v: string) => void,
    ) => {
      if (!next || next.length === 0) return;
      if (cur.trim() !== "") return;
      const cleaned = next.map((x) => x.trim()).filter((x) => x);
      if (cleaned.length === 0) return;
      setter(cleaned.join(", "));
      count += 1;
    };

    setIfEmptyArr(expertDomains, updates.expertDomains, setExpertDomains);
    const userFilledCustomType =
      isCustomRelationshipType(relationshipType) &&
      relationshipType.trim() !== "";
    if (
      updates.relationshipType &&
      updates.relationshipType !== relationshipType &&
      !userFilledCustomType
    ) {
      setRelationshipType(normalizeRelationshipType(updates.relationshipType));
      count += 1;
    }
    const id = updates.recipe?.identity ?? {};
    setIfEmptyStr(avatar, id.avatar, setAvatar);
    const pr = updates.recipe?.prompting;
    setIfEmptyStr(coreLogic, pr?.coreLogic, setCoreLogic);
    const sp = pr?.scenePrompts;
    setIfEmptyStr(chatPrompt, sp?.chat, setChatPrompt);
    setIfEmptyStr(momentsPostPrompt, sp?.moments_post, setMomentsPostPrompt);
    setIfEmptyStr(
      momentsCommentPrompt,
      sp?.moments_comment,
      setMomentsCommentPrompt,
    );
    setIfEmptyStr(feedPostPrompt, sp?.feed_post, setFeedPostPrompt);
    setIfEmptyStr(channelPostPrompt, sp?.channel_post, setChannelPostPrompt);
    setIfEmptyStr(feedCommentPrompt, sp?.feed_comment, setFeedCommentPrompt);
    setIfEmptyStr(greetingPrompt, sp?.greeting, setGreetingPrompt);
    setIfEmptyStr(proactivePrompt, sp?.proactive, setProactivePrompt);
    const ms = updates.recipe?.memorySeed ?? {};
    setIfEmptyStr(
      recentSummaryPrompt,
      ms.recentSummaryPrompt,
      setRecentSummaryPrompt,
    );
    setIfEmptyStr(coreMemoryPrompt, ms.coreMemoryPrompt, setCoreMemoryPrompt);
    if (typeof ms.forgettingCurve === "number") {
      const next = String(ms.forgettingCurve);
      if (next !== forgettingCurve) {
        setForgettingCurve(next);
        count += 1;
      }
    }
    return count;
  }

  function applyUpdatesOverwrite(updates: AiGeneratedDraft): number {
    let count = 0;
    const setStr = (
      cur: string,
      next: string | undefined,
      setter: (v: string) => void,
    ) => {
      if (next === undefined) return;
      const v = next.trim();
      if (!v) return;
      if (cur === v) return;
      setter(v);
      count += 1;
    };
    const setArr = (
      cur: string,
      next: string[] | undefined,
      setter: (v: string) => void,
    ) => {
      if (!next) return;
      const cleaned = next.map((x) => x.trim()).filter((x) => x);
      if (cleaned.length === 0) return;
      const joined = cleaned.join(", ");
      if (cur === joined) return;
      setter(joined);
      count += 1;
    };

    setArr(expertDomains, updates.expertDomains, setExpertDomains);
    if (
      updates.relationshipType &&
      updates.relationshipType !== relationshipType
    ) {
      setRelationshipType(normalizeRelationshipType(updates.relationshipType));
      count += 1;
    }
    const id = updates.recipe?.identity ?? {};
    setStr(avatar, id.avatar, setAvatar);
    const pr = updates.recipe?.prompting;
    setStr(coreLogic, pr?.coreLogic, setCoreLogic);
    const sp = pr?.scenePrompts;
    setStr(chatPrompt, sp?.chat, setChatPrompt);
    setStr(momentsPostPrompt, sp?.moments_post, setMomentsPostPrompt);
    setStr(momentsCommentPrompt, sp?.moments_comment, setMomentsCommentPrompt);
    setStr(feedPostPrompt, sp?.feed_post, setFeedPostPrompt);
    setStr(channelPostPrompt, sp?.channel_post, setChannelPostPrompt);
    setStr(feedCommentPrompt, sp?.feed_comment, setFeedCommentPrompt);
    setStr(greetingPrompt, sp?.greeting, setGreetingPrompt);
    setStr(proactivePrompt, sp?.proactive, setProactivePrompt);
    const ms = updates.recipe?.memorySeed ?? {};
    setStr(recentSummaryPrompt, ms.recentSummaryPrompt, setRecentSummaryPrompt);
    setStr(coreMemoryPrompt, ms.coreMemoryPrompt, setCoreMemoryPrompt);
    if (typeof ms.forgettingCurve === "number") {
      const next = String(ms.forgettingCurve);
      if (next !== forgettingCurve) {
        setForgettingCurve(next);
        count += 1;
      }
    }
    return count;
  }

  const isGenerating = session.generation.status === "pending";
  const generatingSection =
    session.generation.status === "pending" ? session.generation.section : null;

  const isSectionLocked = (section: AiGenerateSection): boolean =>
    isGenerating &&
    (generatingSection === section || generatingSection === "all");

  const fireGenerate = (
    section: AiGenerateSection,
    opts: { optimize?: boolean } = {},
  ) => {
    if (isGenerating) return;
    const optimize = opts.optimize === true;
    if (!optimize && isSectionFull(section)) {
      setOptimizeModal({ section });
      return;
    }
    setAiError(null);
    setAiQuotaExhausted(null);
    setAiFlash(null);
    const draft = buildCurrentDraftRef.current();
    startGeneration(sessionKey, section, draft, { optimize, generator });
  };

  const ensureSacredOrFocus = (): boolean => {
    const missingId = !name.trim()
      ? "char-field-name"
      : !relationship.trim()
        ? "char-field-relationship"
        : !bio.trim()
          ? "char-field-bio"
          : null;
    if (!missingId) return true;
    const el = document.getElementById(missingId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      window.requestAnimationFrame(() => {
        (el as HTMLInputElement | HTMLTextAreaElement).focus({
          preventScroll: true,
        });
      });
    }
    return false;
  };

  const handleSectionGenerate = (section: AiGenerateSection) => {
    if (isGenerating) return;
    if (!ensureSacredOrFocus()) return;
    fireGenerate(section);
  };

  useEffect(() => {
    if (!hydrationDone) return;
    const gen = session.generation;
    if (gen.status === "done") {
      setAiError(null);
      setAiQuotaExhausted(null);
      // 父组件副作用先于内部 consume —— 让 my-character-edit-page 拿 linkedDraftId
      // 跳 ?draftId=xxx；之后再 applyUpdates / consume，避免 status 已变 idle
      // 父组件再 subscribe 捕不到 linkedDraftId。
      onGenerationDone?.({
        section: gen.section,
        linkedDraftId: gen.linkedDraftId,
      });
      const count = gen.optimize
        ? applyUpdatesOverwrite(gen.updates)
        : applyUpdatesFillEmptyOnly(gen.updates);
      setAiFlash({ section: gen.section, count, optimize: gen.optimize });
      if (aiFlashTimerRef.current !== null) {
        window.clearTimeout(aiFlashTimerRef.current);
      }
      aiFlashTimerRef.current = window.setTimeout(() => {
        setAiFlash(null);
        aiFlashTimerRef.current = null;
      }, 4000);
      consumeGenerationResult(sessionKey);
    } else if (gen.status === "error") {
      if (gen.is429) {
        setAiError(null);
        setAiQuotaExhausted({
          // 后端没回 quota 时兜个保守值（与 guard.ts:HOURLY_QUOTA 保持同步即可）
          quota: gen.quota ?? 50,
          retryAfterSec: gen.retryAfterSec,
        });
      } else {
        setAiQuotaExhausted(null);
        setAiError(t(msg`AI 生成失败：${gen.message}`));
      }
      consumeGenerationResult(sessionKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationDone, session.generation.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavePending) return;
    if (isGenerating) return;
    if (isCustomRelationshipType(relationshipType) && !relationshipType.trim())
      return;
    const dto = buildDto();
    if (!dto) return;
    if (!dto.name) return;
    setSubmitErrorOverride(null);
    try {
      await onSave(dto);
      if (clearSessionOnSave) {
        skipSnapshotOnUnmountRef.current = true;
        clearEditSession(sessionKey);
      }
      setSavedFlash(true);
      if (savedFlashTimerRef.current !== null) {
        window.clearTimeout(savedFlashTimerRef.current);
      }
      savedFlashTimerRef.current = window.setTimeout(() => {
        setSavedFlash(false);
        savedFlashTimerRef.current = null;
      }, 2500);
    } catch (err) {
      // onSave 抛出的错误：父组件通常也会通过 saveError prop 传进来；这里再
      // 兜底显示一份（避免父组件 mutation onError 没接 setError 时静默失败）。
      setSubmitErrorOverride(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const relationshipTypeLabel = (() => {
    const found = RELATIONSHIP_TYPE_OPTIONS.find(
      (o) => o.value === relationshipType,
    );
    return found ? t(found.label) : relationshipType;
  })();

  // name 视觉为空 = 纯空白 / 纯零宽字符（U+200B-U+200D / U+FEFF / U+2060）。
  // 仅靠 trim().length === 0 漏掉粘 ZWS 占位字符的情况，按钮会假性可点，点完
  // 后端 wiki name 校验回 400，用户体感是"我填了名字但被拒"。
  const nameVisuallyEmpty = isVisuallyEmpty(name);
  const saveButtonDisabled =
    isSavePending ||
    nameVisuallyEmpty ||
    isGenerating ||
    !!extraSaveDisabledReason;

  // 不同 scope 的不同生成 / 评审说明
  const aiHintForScope =
    scope === "world"
      ? t(
          msg`本编辑器和私有角色完全一致；这里的改动会作为一次 wiki 评审提交（涉及 prompting / memorySeed / lifeStrategy / tone / expertise / publishMapping / realityLink / identity.background|motivation|worldview 这些路径会被识别为高风险，需要 patroller 审核）。`,
        )
      : null;

  return (
    <>
      {isGenerating && (
        <GenerationProgressBanner
          section={generatingSection}
          elapsedSec={elapsedSec}
        />
      )}

      {aiHintForScope && (
        <InlineNotice tone="info" className="mb-3">
          {aiHintForScope}
        </InlineNotice>
      )}

      {isInitialLoading ? (
        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-6 text-sm text-[color:var(--text-muted)]">
          <Trans>加载中…</Trans>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-stretch">
            <div className="min-w-0 flex-1">
              <PreviewCard
                name={name}
                avatar={avatar}
                relationship={relationship}
                relationshipTypeLabel={relationshipTypeLabel}
                expertDomains={expertDomains}
              />
            </div>
            <TopGenerateButton
              name={name}
              bio={bio}
              relationship={relationship}
              isPending={isGenerating && generatingSection === "all"}
              disabled={isGenerating}
              onClick={() => handleSectionGenerate("all")}
            />
          </div>

          {/* AI 一键生成的错误 / 成功反馈也在顶部显示一份：表单下方那份距离按钮
              1000+ 行，429 / 失败时用户会看不到任何反应。这里放在按钮正下方，
              点了立刻能看到结果。 */}
          {aiQuotaExhausted && (
            <div className="mb-3">
              <QuotaExhaustedNotice
                quota={aiQuotaExhausted.quota}
                retryAfterSec={aiQuotaExhausted.retryAfterSec}
              />
            </div>
          )}
          {aiError && (
            <div className="mb-3">
              <InlineNotice tone="danger" role="alert">{aiError}</InlineNotice>
            </div>
          )}
          {aiFlash && aiFlash.section === "all" && (
            <div className="mb-3">
              {/* AI 生成成功后的反馈通知是用户主动点击"AI 一键生成"后的回
                  应——SR 需要播报。role=status 不打断阅读但仍可被听到。 */}
              <InlineNotice tone="success" role="status">
                {aiFlash.optimize ? (
                  aiFlash.count > 0 ? (
                    <Trans>
                      ✨ 已优化「{getSectionLabel(aiFlash.section, t)}」共{" "}
                      {aiFlash.count} 个字段
                    </Trans>
                  ) : (
                    <Trans>
                      ✨ AI 优化未返回不同内容（已保留你的填写）
                    </Trans>
                  )
                ) : aiFlash.count > 0 ? (
                  <Trans>✨ 已补全 {aiFlash.count} 个字段</Trans>
                ) : (
                  <Trans>✨ AI 已生成完毕（未发现需要补全的空字段）</Trans>
                )}
              </InlineNotice>
            </div>
          )}

          <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
            <SectionNav
              saveDisabled={
                isSavePending || nameVisuallyEmpty || isGenerating
              }
            />

            {/* noValidate：关掉浏览器原生 HTML5 校验。否则一旦用户在「遗忘曲线」/
                「主动浏览概率」/「亲密度种子」这三个 number 输入里直接键入超出
                min/max 的值（如 999、1.5），浏览器会拦住 form submit 事件 → React
                onSubmit 拿不到回调 → 用户点「创建/保存」看似毫无反应（tooltip 在
                远离按钮的输入旁边，长表单极易错过）。校验改成下方 parser + 全部 clamp，
                保证 handleSubmit 始终能跑、buildDto 拿到合规值。*/}
            <form
              className="space-y-5"
              noValidate
              onSubmit={handleSubmit}
            >
              {/* —— 1. 基础信息 —— */}
              <AppSection
                id="char-section-basics"
                className={
                  isSectionLocked("basics")
                    ? "space-y-4 scroll-mt-20 opacity-60 transition-opacity"
                    : "space-y-4 scroll-mt-20 transition-opacity"
                }
                aria-busy={isSectionLocked("basics")}
              >
                <SectionHeaderWithGenerate
                  title={<Trans>基础信息</Trans>}
                  description={
                    <Trans>
                      角色名、头像、关系、简介、专长领域；只有「名称」是必填。
                    </Trans>
                  }
                  section="basics"
                  name={name}
                  relationship={relationship}
                  bio={bio}
                  pending={isSectionLocked("basics")}
                  disabled={isGenerating}
                  onClick={() => handleSectionGenerate("basics")}
                />
                {isSectionLocked("basics") && (
                  <div className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <Trans>
                      ✨ AI 正在生成基础信息（含头像 emoji、专长领域），完成前本节字段已锁定。
                    </Trans>
                  </div>
                )}
                <fieldset
                  disabled={isSectionLocked("basics")}
                  className="contents"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormRow label={t(msg`名称`)} required>
                      <TextField
                        id="char-field-name"
                        required
                        maxLength={40}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t(msg`例如 苏然`)}
                      />
                    </FormRow>
                    <FormRow
                      label={t(msg`头像`)}
                      hint={t(
                        msg`emoji（🦊）、图片 URL，或点"上传图片"传一张本地图（PNG/JPG/WebP/GIF，≤4 MB）。空则用首字母占位（AI 生成基础信息时会自动补一个 emoji）`,
                      )}
                      effect={t(msg`在角色卡片和列表里展示，不直接进 AI 提示词`)}
                    >
                      <AvatarUploadField
                        value={avatar}
                        onChange={setAvatar}
                        name={name}
                      />
                    </FormRow>
                    <FormRow
                      label={t(msg`关系描述`)}
                      hint={t(msg`这个角色相对于你的身份`)}
                      effect={t(msg`AI 自我介绍时会用这句来定位你`)}
                    >
                      <TextField
                        id="char-field-relationship"
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        placeholder={t(msg`例如 大学室友`)}
                      />
                    </FormRow>
                    <FormRow
                      label={t(msg`关系类型`)}
                      effect={t(msg`在角色卡和列表里展示，不直接进 AI 提示词`)}
                    >
                      <SelectField
                        value={
                          isCustomRelationshipType(relationshipType)
                            ? "custom"
                            : relationshipType
                        }
                        onChange={(e) => {
                          const next = e.target.value;
                          setRelationshipType(next === "custom" ? "" : next);
                        }}
                      >
                        {RELATIONSHIP_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {t(opt.label)}
                          </option>
                        ))}
                      </SelectField>
                      {isCustomRelationshipType(relationshipType) && (
                        <TextField
                          required
                          maxLength={15}
                          placeholder={t(
                            msg`填一个具体的关系，例如 师傅 / 房东 / 邻居`,
                          )}
                          value={relationshipType}
                          onChange={(e) => setRelationshipType(e.target.value)}
                          className="mt-2"
                        />
                      )}
                    </FormRow>
                  </div>
                  <FormRow
                    label={t(msg`地区`)}
                    hint={t(msg`例如 上海·上海，可留空`)}
                    effect={t(msg`在角色卡和朋友信息页展示，不进 AI 提示词`)}
                  >
                    <TextField
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      maxLength={64}
                      placeholder={t(msg`例如 上海·上海`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`擅长领域`)}
                    badge={<RecommendBadge label={t(msg`推荐`)} />}
                    hint={t(msg`逗号分隔；用于检索、推荐与触发对话`)}
                    effect={t(msg`AI 会优先接这些领域的话题`)}
                  >
                    <TextField
                      value={expertDomains}
                      onChange={(e) => setExpertDomains(e.target.value)}
                      placeholder={t(msg`编程, 音乐, 心理学`)}
                    />
                    <TagPreview value={expertDomains} />
                  </FormRow>
                  <FormRow
                    label={t(msg`简介`)}
                    badge={<RecommendBadge label={t(msg`推荐`)} />}
                    hint={t(
                      msg`一段话介绍角色背景与人设；其他用户可以读到。`,
                    )}
                    effect={t(
                      msg`在角色卡片和搜索结果里展示给其他人；不直接进 AI 提示词。`,
                    )}
                  >
                    <TextAreaField
                      id="char-field-bio"
                      rows={4}
                      maxLength={500}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t(
                        msg`例如：心理学背景，慢热而锋利。喜欢半夜读书，习惯先观察再回应。`,
                      )}
                    />
                  </FormRow>
                </fieldset>
              </AppSection>

              {/* —— 2. 聊天回复 —— */}
              <AppSection
                id="char-section-chat"
                className={
                  isSectionLocked("chat")
                    ? "space-y-4 scroll-mt-20 opacity-60 transition-opacity"
                    : "space-y-4 scroll-mt-20 transition-opacity"
                }
                aria-busy={isSectionLocked("chat")}
              >
                <SectionHeaderWithGenerate
                  title={<Trans>聊天回复</Trans>}
                  description={
                    <Trans>私聊 / 群聊场景下的具体回复风格与规则。</Trans>
                  }
                  section="chat"
                  name={name}
                  relationship={relationship}
                  bio={bio}
                  pending={isSectionLocked("chat")}
                  disabled={isGenerating}
                  onClick={() => handleSectionGenerate("chat")}
                />
                {isSectionLocked("chat") && (
                  <div className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <Trans>✨ AI 正在生成聊天回复，完成前本节字段已锁定。</Trans>
                  </div>
                )}
                <fieldset
                  disabled={isSectionLocked("chat")}
                  className="contents"
                >
                  <FormRow
                    label={t(msg`聊天场景提示词`)}
                    hint={t(msg`私聊 / 群聊场景的具体行为`)}
                    effect={t(msg`AI 在私聊和群聊场景下的具体表现`)}
                  >
                    <PromptWithExample
                      value={chatPrompt}
                      onChange={setChatPrompt}
                      rows={4}
                      placeholder={DEFAULT_PROMPTS.chat}
                      example={t(
                        msg`短句优先，能反问就别陈述。被夸时低调反弹回去。`,
                      )}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                </fieldset>
              </AppSection>

              {/* —— 3. 底层逻辑 —— */}
              <AppSection
                id="char-section-core-logic"
                className={
                  isSectionLocked("core_logic")
                    ? "space-y-4 scroll-mt-20 opacity-60 transition-opacity"
                    : "space-y-4 scroll-mt-20 transition-opacity"
                }
                aria-busy={isSectionLocked("core_logic")}
              >
                <SectionHeaderWithGenerate
                  title={<Trans>底层逻辑</Trans>}
                  description={
                    <Trans>
                      角色在所有场景下都遵循的"心法"。优先级高于场景提示词。
                    </Trans>
                  }
                  section="core_logic"
                  name={name}
                  relationship={relationship}
                  bio={bio}
                  pending={isSectionLocked("core_logic")}
                  disabled={isGenerating}
                  onClick={() => handleSectionGenerate("core_logic")}
                />
                {isSectionLocked("core_logic") && (
                  <div className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <Trans>✨ AI 正在生成底层逻辑，完成前本节字段已锁定。</Trans>
                  </div>
                )}
                <fieldset
                  disabled={isSectionLocked("core_logic")}
                  className="contents"
                >
                  <FormRow
                    label={t(msg`底层逻辑`)}
                    badge={<RecommendBadge label={t(msg`推荐`)} />}
                    hint={t(msg`贯穿所有场景的"心法"；优先级高于场景 prompt`)}
                    effect={t(msg`AI 在所有场景里都会遵循这段（最高优先级）`)}
                  >
                    <PromptWithExample
                      value={coreLogic}
                      onChange={setCoreLogic}
                      rows={4}
                      placeholder={DEFAULT_PROMPTS.coreLogic}
                      example={t(
                        msg`永远先确认对方在问什么，再用一句反问引导他说更多。不替对方下结论。`,
                      )}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`遗忘曲线（0-100，默认 70）`)}
                    badge={<AdvancedBadge label={t(msg`进阶`)} />}
                    hint={t(msg`数值越高记得越牢；建议 50-80`)}
                    effect={t(msg`AI 记忆衰减速度，越大越牢`)}
                  >
                    <TextField
                      type="number"
                      min={0}
                      max={100}
                      value={forgettingCurve}
                      onChange={(e) => setForgettingCurve(e.target.value)}
                      placeholder="70"
                    />
                  </FormRow>
                </fieldset>
              </AppSection>

              {/* —— 4. 场景提示词 —— */}
              <AppSection
                id="char-section-scenes"
                className={
                  isSectionLocked("scenes")
                    ? "space-y-4 scroll-mt-20 opacity-60 transition-opacity"
                    : "space-y-4 scroll-mt-20 transition-opacity"
                }
                aria-busy={isSectionLocked("scenes")}
              >
                <SectionHeaderWithGenerate
                  title={<Trans>场景提示词</Trans>}
                  description={
                    <Trans>
                      控制 AI 在朋友圈、广场、视频号、招呼、主动外联等场景下的措辞。不填会用默认推断。
                    </Trans>
                  }
                  section="scenes"
                  name={name}
                  relationship={relationship}
                  bio={bio}
                  pending={isSectionLocked("scenes")}
                  disabled={isGenerating}
                  onClick={() => handleSectionGenerate("scenes")}
                />
                {isSectionLocked("scenes") && (
                  <div className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <Trans>
                      ✨ AI 正在生成场景提示词，完成前本节字段已锁定。
                    </Trans>
                  </div>
                )}
                <fieldset
                  disabled={isSectionLocked("scenes")}
                  className="contents"
                >
                  <p className="text-xs text-[color:var(--text-muted)]">
                    <Trans>主动发布</Trans>
                  </p>
                  <FormRow
                    label={t(msg`发朋友圈`)}
                    effect={t(msg`AI 发朋友圈时的内容风格`)}
                  >
                    <PromptWithExample
                      value={momentsPostPrompt}
                      onChange={setMomentsPostPrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.moments_post}
                      example={t(msg`最近遇到一个小事 + 一句感受，不超过两句话。`)}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`广场发帖`)}
                    effect={t(
                      msg`AI 在广场公开发帖（比朋友圈正式、任何人都看得到）时的写作风格`,
                    )}
                  >
                    <PromptWithExample
                      value={feedPostPrompt}
                      onChange={setFeedPostPrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.feed_post}
                      example={t(
                        msg`写一段最近的观察 + 一个开放问题，给读者留余地。`,
                      )}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`发视频号内容`)}
                    effect={t(msg`AI 发视频号 / 频道内容时的风格`)}
                  >
                    <PromptWithExample
                      value={channelPostPrompt}
                      onChange={setChannelPostPrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.channel_post}
                      example={t(msg`30 秒内能讲完的小见解 + 一句反差结尾。`)}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <p className="pt-2 text-xs text-[color:var(--text-muted)]">
                    <Trans>互动响应</Trans>
                  </p>
                  <FormRow
                    label={t(msg`朋友圈评论 / 回复`)}
                    effect={t(msg`AI 在朋友圈下评论时的风格`)}
                  >
                    <PromptWithExample
                      value={momentsCommentPrompt}
                      onChange={setMomentsCommentPrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.moments_comment}
                      example={t(msg`先回应朋友的情绪，再问一个具体的细节。`)}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`广场评论`)}
                    effect={t(msg`AI 在别人发的广场公开贴下面留言时的措辞`)}
                  >
                    <PromptWithExample
                      value={feedCommentPrompt}
                      onChange={setFeedCommentPrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.feed_comment}
                      example={t(msg`针对原作者的某一句具体回应，不抢话也不空夸。`)}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`好友请求 / 摇一摇问候`)}
                    effect={t(msg`AI 加好友 / 打招呼时的开场措辞`)}
                  >
                    <PromptWithExample
                      value={greetingPrompt}
                      onChange={setGreetingPrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.greeting}
                      example={t(msg`先报上身份和我们怎么认识，问对方最近忙什么。`)}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`主动提醒`)}
                    effect={t(msg`AI 主动外联用户时的开场措辞`)}
                  >
                    <PromptWithExample
                      value={proactivePrompt}
                      onChange={setProactivePrompt}
                      rows={3}
                      placeholder={DEFAULT_PROMPTS.proactive}
                      example={t(
                        msg`不打扰式开场："刚想起 xxx，想问你一句"。不索取注意力。`,
                      )}
                      exampleLabel={t(msg`📋 查看示例`)}
                      hideLabel={t(msg`收起示例`)}
                    />
                  </FormRow>
                </fieldset>
              </AppSection>

              {/* —— 5. 记忆提示词 —— */}
              <AppSection
                id="char-section-memory"
                className={
                  isSectionLocked("memory")
                    ? "space-y-4 scroll-mt-20 opacity-60 transition-opacity"
                    : "space-y-4 scroll-mt-20 transition-opacity"
                }
                aria-busy={isSectionLocked("memory")}
              >
                <SectionHeaderWithGenerate
                  title={<Trans>记忆提示词</Trans>}
                  description={
                    <Trans>
                      控制 AI 整理近期记忆和提炼核心记忆时使用的指示模板。留空使用全局默认。
                    </Trans>
                  }
                  section="memory"
                  name={name}
                  relationship={relationship}
                  bio={bio}
                  pending={isSectionLocked("memory")}
                  disabled={isGenerating}
                  onClick={() => handleSectionGenerate("memory")}
                />
                {isSectionLocked("memory") && (
                  <div className="rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
                    <Trans>✨ AI 正在生成记忆提示词，完成前本节字段已锁定。</Trans>
                  </div>
                )}
                <fieldset
                  disabled={isSectionLocked("memory")}
                  className="contents"
                >
                  <FormRow
                    label={t(msg`近期记忆提示词`)}
                    badge={<AdvancedBadge label={t(msg`进阶`)} />}
                    effect={t(msg`AI 整理近期记忆时使用的指示模板`)}
                    hint={t(msg`变量：{{name}}、{{chatHistory}}`)}
                  >
                    <TextAreaField
                      rows={DEFAULT_PROMPTS.recentSummaryPrompt.split("\n").length}
                      value={recentSummaryPrompt}
                      onChange={(e) => setRecentSummaryPrompt(e.target.value)}
                      placeholder={DEFAULT_PROMPTS.recentSummaryPrompt}
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`长期记忆提示词`)}
                    badge={<AdvancedBadge label={t(msg`进阶`)} />}
                    effect={t(msg`AI 提炼核心记忆时使用的指示模板`)}
                    hint={t(msg`变量：{{name}}、{{interactionHistory}}`)}
                  >
                    <TextAreaField
                      rows={DEFAULT_PROMPTS.coreMemoryPrompt.split("\n").length}
                      value={coreMemoryPrompt}
                      onChange={(e) => setCoreMemoryPrompt(e.target.value)}
                      placeholder={DEFAULT_PROMPTS.coreMemoryPrompt}
                    />
                  </FormRow>
                </fieldset>
              </AppSection>

              {/* —— 6. 社交参数 —— */}
              <AppSection
                id="char-section-social-params"
                className="space-y-4 scroll-mt-20"
              >
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
                    <Trans>社交参数</Trans>
                  </h3>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                    <Trans>
                      控制角色对朋友圈/动态的开放度、主动浏览的频率，以及和你"刚认识时"的亲密度起点。运行时会自动调整。
                    </Trans>
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <FormRow
                    label={t(msg`社交开放度`)}
                    effect={t(msg`open 公开 / normal 普通 / private 仅好友`)}
                  >
                    <SelectField
                      value={socialOpenness}
                      onChange={(e) => setSocialOpenness(e.target.value)}
                    >
                      <option value="open">{t(msg`open 公开`)}</option>
                      <option value="normal">{t(msg`normal 普通`)}</option>
                      <option value="private">{t(msg`private 仅好友`)}</option>
                    </SelectField>
                  </FormRow>
                  <FormRow
                    label={t(msg`主动浏览概率（0-1）`)}
                    effect={t(msg`数值越高，AI 越频繁主动看你的内容`)}
                  >
                    <TextField
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={proactiveBrowseChance}
                      onChange={(e) =>
                        setProactiveBrowseChance(e.target.value)
                      }
                      placeholder="0.3"
                    />
                  </FormRow>
                  <FormRow
                    label={t(msg`亲密度种子（0-100）`)}
                    effect={t(msg`角色首次入库时的初始值，运行时会被自动调节`)}
                  >
                    <TextField
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={intimacyLevel}
                      onChange={(e) => setIntimacyLevel(e.target.value)}
                      placeholder="0"
                    />
                  </FormRow>
                </div>
                {scope === "private" && (
                  <InlineNotice tone="warning">
                    <Trans>
                      亲密度只是"初始值"——上线后会随你和角色的真实互动被自动调整，这里设的高低不会锁死。
                    </Trans>
                  </InlineNotice>
                )}
                {scope === "world" && (
                  <InlineNotice tone="info">
                    <Trans>
                      世界角色的社交参数由 admin 管理，wiki 评审通道不会写入这三个字段；这里展示的是当前默认值，无法通过本表单提交修改。
                    </Trans>
                  </InlineNotice>
                )}
              </AppSection>

              {/* 父组件插槽：世界角色 editSummary + isMinor */}
              {footerSlot}

              {/* 保存表单时三类失败 InlineNotice — avatar 上传 / submit /
                  AI 生成 —— 都是用户主动触发后的反馈，必须挂 role=alert 让
                  SR 念出"头像上传失败/保存失败/AI 生成失败 + 原因"。
                  savedFlash 走 role=status 因为是积极反馈，aiQuotaExhausted
                  内部已有 role=alert（顶部一份）所以这里 silentAria 保持
                  单播报。 */}
              {avatarError && (
                <InlineNotice tone="danger" role="alert">{avatarError}</InlineNotice>
              )}
              {(submitErrorOverride || saveError) && (
                <InlineNotice tone="danger" role="alert">
                  {submitErrorOverride ?? saveError}
                </InlineNotice>
              )}
              {savedFlash && (
                <InlineNotice tone="success" role="status">
                  {savedFlashMessage ?? <Trans>已保存 ✓</Trans>}
                </InlineNotice>
              )}
              {aiQuotaExhausted && (
                // 顶部已经渲染过同一份 role=alert，这里只做视觉补充，
                // 关掉 alert 角色避免 SR 双播报。
                <QuotaExhaustedNotice
                  quota={aiQuotaExhausted.quota}
                  retryAfterSec={aiQuotaExhausted.retryAfterSec}
                  silentAria
                />
              )}
              {aiError && (
                <InlineNotice tone="danger" role="alert">{aiError}</InlineNotice>
              )}
              {aiFlash && (
                <InlineNotice tone="success" role="status">
                  {aiFlash.optimize ? (
                    aiFlash.count > 0 ? (
                      <Trans>
                        ✨ 已优化「{getSectionLabel(aiFlash.section, t)}」共{" "}
                        {aiFlash.count} 个字段
                      </Trans>
                    ) : (
                      <Trans>
                        ✨ AI 优化「{getSectionLabel(aiFlash.section, t)}
                        」未返回不同内容（已保留你的填写）
                      </Trans>
                    )
                  ) : aiFlash.count > 0 ? (
                    <Trans>
                      ✨ 已为「{getSectionLabel(aiFlash.section, t)}」补全{" "}
                      {aiFlash.count} 个字段
                    </Trans>
                  ) : (
                    <Trans>
                      ✨ 「{getSectionLabel(aiFlash.section, t)}」没有空字段需要补全
                    </Trans>
                  )}
                  {mode === "create" && aiFlash.section === "all" && (
                    <span className="ml-2 text-[color:var(--text-muted)]">
                      <Trans>
                        · 已自动保存为草稿（可在「我的草稿」找回）
                      </Trans>
                    </span>
                  )}
                </InlineNotice>
              )}

              <div
                id="char-save"
                className="sticky bottom-2 z-20 flex flex-col gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)]/95 px-3 py-3 shadow-[var(--shadow-card)] backdrop-blur scroll-mt-20 sm:bottom-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4"
                style={{
                  paddingBottom:
                    "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
                }}
              >
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full sm:w-auto"
                  disabled={saveButtonDisabled}
                >
                  {isSavePending
                    ? saveButtonLabel.pending
                    : mode === "create"
                      ? saveButtonLabel.create
                      : saveButtonLabel.edit}
                </Button>
                <div className="text-xs text-[color:var(--text-muted)] sm:ml-auto">
                  {nameVisuallyEmpty ? (
                    <Trans>请填写「名称」才能保存</Trans>
                  ) : extraSaveDisabledReason ? (
                    <span className="text-[color:var(--state-warning-text)]">
                      {extraSaveDisabledReason}
                    </span>
                  ) : mode === "edit" ? (
                    saveFooterHint.edit
                  ) : (
                    saveFooterHint.create
                  )}
                </div>
              </div>
            </form>
          </div>
        </>
      )}
      {optimizeModal && (
        <OptimizeConfirmModal
          section={optimizeModal.section}
          onCancel={() => setOptimizeModal(null)}
          onConfirm={() => {
            const section = optimizeModal.section;
            setOptimizeModal(null);
            fireGenerate(section, { optimize: true });
          }}
        />
      )}
    </>
  );
}

// ───── helpers ─────

// 空 / 非数字 → null（让外层 `?? default` 兜底）；超界 → 截到 [min, max]
// 之内（这样用户在「遗忘曲线 0-100」里键入 999 会得到 100，而不是回到默认 70，
// 也不会让 form 因 HTML5 校验静默拦下来）。
function parseIntInRange(
  raw: string,
  min: number,
  max: number,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function parseFloatInRange(
  raw: string,
  min: number,
  max: number,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function getSectionLabel(
  section: AiGenerateSection,
  t: (m: MessageDescriptor) => string,
): string {
  switch (section) {
    case "basics":
      return t(msg`基础信息`);
    case "core_logic":
      return t(msg`底层逻辑`);
    case "chat":
      return t(msg`聊天回复`);
    case "scenes":
      return t(msg`场景提示词`);
    case "memory":
      return t(msg`记忆提示词`);
    case "all":
      return t(msg`整个角色`);
  }
}

function OptimizeConfirmModal({
  section,
  onCancel,
  onConfirm,
}: {
  section: AiGenerateSection;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useRuntimeTranslator();
  const sectionLabel = getSectionLabel(section, t);
  const allCase = section === "all";
  // 焦点管理：原写法 modal 挂载后焦点留在背后的"优化"按钮上，键盘 / SR
  // 用户 Tab 会跳出 modal 到背景内容（视觉被 modal 遮住但 focus 跑了）。
  // 1) 挂载时把焦点移到"取消"按钮（safer default），让 SR 读出 modal
  //    title + 第一个 action；2) Tab/Shift-Tab 在两按钮间循环（focus trap）；
  //    3) 卸载时还焦点给打开 modal 之前 active 的元素（"AI 一键生成"按钮）。
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousActiveRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    cancelBtnRef.current?.focus();
    return () => {
      previousActiveRef.current?.focus?.();
    };
  }, []);

  // ESC 关 modal —— 和 UserMenu / HintTooltip / 抽屉对齐
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Tab 焦点陷阱：两按钮在 cancel ↔ confirm 之间循环。
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const active = document.activeElement;
    if (!e.shiftKey && active === confirmBtnRef.current) {
      e.preventDefault();
      cancelBtnRef.current?.focus();
    } else if (e.shiftKey && active === cancelBtnRef.current) {
      e.preventDefault();
      confirmBtnRef.current?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="optimize-modal-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 grid place-items-center bg-[color:var(--surface-overlay)]/70 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-shell)] p-5 shadow-[var(--shadow-card)]">
        <h2
          id="optimize-modal-title"
          className="text-base font-semibold text-[color:var(--text-primary)]"
        >
          {allCase ? (
            <Trans>全部内容已填满</Trans>
          ) : (
            <Trans>「{sectionLabel}」已填满</Trans>
          )}
        </h2>
        <div className="space-y-2 text-sm text-[color:var(--text-muted)]">
          {allCase ? (
            <>
              <p>
                <Trans>
                  AI 一键生成可以补的字段都已填好——再点不会有任何"补空"效果。
                </Trans>
              </p>
              <p>
                <Trans>
                  如果想让 AI 把整角色"优化"一遍，会用新生成的内容覆盖大部分字段
                  （sacred 3 字段——名称、关系、简介——始终保留）。是否进行优化？
                </Trans>
              </p>
            </>
          ) : (
            <>
              <p>
                <Trans>
                  本节字段已经全部填写。AI 生成（默认）只会填补空字段，不会
                  改动已填的内容。
                </Trans>
              </p>
              <p>
                <Trans>
                  如果想让 AI 也修改已填字段，是「优化」操作——会用新生成的内容
                  覆盖整节（名称、关系、简介这 3 个 sacred 字段始终保留）。是否进行优化？
                </Trans>
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            <Trans>取消</Trans>
          </Button>
          <Button
            ref={confirmBtnRef}
            type="button"
            variant="primary"
            onClick={onConfirm}
          >
            <Trans>✨ 开始优化</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionHeaderWithGenerate({
  title,
  description,
  section,
  name,
  relationship,
  bio,
  pending,
  disabled,
  onClick,
}: {
  title: ReactNode;
  description: ReactNode;
  section: AiGenerateSection;
  name: string;
  relationship: string;
  bio: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <header className="space-y-1 sm:flex-1">
        <h2 className="text-base font-semibold text-[color:var(--text-primary)]">
          {title}
        </h2>
        <p className="text-xs text-[color:var(--text-muted)]">{description}</p>
      </header>
      <SectionGenerateButton
        section={section}
        name={name}
        relationship={relationship}
        bio={bio}
        pending={pending}
        disabled={disabled}
        onClick={onClick}
      />
    </div>
  );
}

function SectionGenerateButton({
  section,
  name,
  relationship,
  bio,
  pending,
  disabled,
  onClick,
}: {
  section: AiGenerateSection;
  name: string;
  relationship: string;
  bio: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useRuntimeTranslator();
  const missing: string[] = [];
  if (!name.trim()) missing.push(t(msg`名称`));
  if (!relationship.trim()) missing.push(t(msg`关系描述`));
  if (!bio.trim()) missing.push(t(msg`简介`));
  const gatesMet = missing.length === 0;
  return (
    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-section={section}
        className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-soft)] px-3 py-1 text-xs text-[color:var(--text-primary)] hover:bg-[color:var(--surface-card)] disabled:cursor-not-allowed disabled:opacity-50 sm:py-1 min-h-[32px]"
      >
        {pending ? <Trans>生成中…</Trans> : <Trans>✨ AI 生成本节</Trans>}
      </button>
      {!gatesMet && !disabled && (
        <span className="max-w-[220px] text-[11px] leading-tight text-[color:var(--text-muted)] sm:text-right">
          <Trans>
            还需填写：{missing.join("、")}（点上方按钮可跳到第一个未填）
          </Trans>
        </span>
      )}
    </div>
  );
}

function TopGenerateButton({
  name,
  bio,
  relationship,
  isPending,
  disabled,
  onClick,
}: {
  name: string;
  bio: string;
  relationship: string;
  isPending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useRuntimeTranslator();
  const missing: string[] = [];
  if (!name.trim()) missing.push(t(msg`名称`));
  if (!relationship.trim()) missing.push(t(msg`关系描述`));
  if (!bio.trim()) missing.push(t(msg`简介`));
  const gatesMet = missing.length === 0;
  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded-full border border-[color:var(--brand-primary)] bg-[image:var(--brand-gradient)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-card)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      >
        {isPending ? (
          // 2026-05-22 异步化后：enqueue 立即返回，LLM 后台跑 ~30s。给用户
          // 一个时长锚点，避免误以为按钮卡死想刷新（刷新会丢 in-memory session
          // 状态，目前没做 URL 持久化恢复；要等用户跳出页面才回得来）。
          <Trans>生成中（约 30 秒）…</Trans>
        ) : (
          <Trans>✨ AI 一键生成全部</Trans>
        )}
      </button>
      {!gatesMet && !disabled && (
        <span className="max-w-[240px] text-right text-[11px] text-[color:var(--text-muted)] md:text-right">
          <Trans>
            还需填写：{missing.join("、")}（点上方按钮可跳到第一个未填）
          </Trans>
        </span>
      )}
    </div>
  );
}

function PreviewCard({
  name,
  avatar,
  relationship,
  relationshipTypeLabel,
  expertDomains,
}: {
  name: string;
  avatar: string;
  relationship: string;
  relationshipTypeLabel: string;
  expertDomains: string;
}) {
  const firstDomain = splitCommaList(expertDomains)[0] ?? "";
  const facets = [relationship, relationshipTypeLabel, firstDomain]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const displayName = name.trim() || "—";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-3 shadow-[var(--shadow-soft)] sm:gap-4 sm:px-4">
      <CharacterAvatarPreview avatar={avatar} name={name} size="lg" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="truncate text-lg font-semibold text-[color:var(--text-primary)]">
          {displayName}
        </div>
        <div className="truncate text-xs text-[color:var(--text-muted)]">
          {facets.length > 0 ? (
            facets.join(" · ")
          ) : (
            <Trans>把右侧字段填上，这里会同步展示 AI 看到的你的角色</Trans>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-dim)]">
          <Trans>AI 眼里的你的角色 ↑</Trans>
        </div>
      </div>
    </div>
  );
}

function SectionNav({ saveDisabled }: { saveDisabled: boolean }) {
  const t = useRuntimeTranslator();
  return (
    // 整个编辑器页面已经有 root-layout 主侧栏 nav + admin-layout 顶部 tab nav；
    // 这里又一个无名 nav 让 NVDA 用户在"跳过到导航"时听到 3 个相同的
    // "navigation"，没有区分能力。加 aria-label 让 SR 念出"角色编辑章节
    // 跳转"。
    <nav aria-label={t(msg`角色编辑章节跳转`)} className="hidden lg:block">
      <div className="sticky top-20 space-y-2">
        <p className="px-3 text-[10px] uppercase tracking-wide text-[color:var(--text-dim)]">
          <Trans>章节</Trans>
        </p>
        <ul className="space-y-1">
          {SECTIONS.map((s, idx) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-lg px-3 py-1.5 text-xs text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--text-primary)]"
              >
                <span className="text-[color:var(--text-dim)] mr-1">
                  {idx + 1}.
                </span>
                {t(s.label)}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#char-save"
          aria-disabled={saveDisabled}
          className={`mt-3 block rounded-lg px-3 py-1.5 text-xs ${
            saveDisabled
              ? "text-[color:var(--text-dim)]"
              : "text-[color:var(--brand-primary)] hover:bg-[color:var(--surface-soft)]"
          }`}
        >
          <Trans>↓ 跳到保存</Trans>
        </a>
      </div>
    </nav>
  );
}

function PromptWithExample({
  value,
  onChange,
  rows,
  placeholder,
  example,
  exampleLabel,
  hideLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder?: string;
  example: string;
  exampleLabel: string;
  hideLabel: string;
}) {
  const [showExample, setShowExample] = useState(false);
  const effectiveRows = Math.max(
    rows,
    placeholder ? placeholder.split("\n").length : 0,
  );
  return (
    <div className="space-y-1.5">
      <TextAreaField
        rows={effectiveRows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShowExample((v) => !v)}
        className="-mx-1 inline-flex min-h-[32px] items-center rounded px-1 py-1 text-[11px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      >
        {showExample ? hideLabel : exampleLabel}
      </button>
      {showExample && (
        <pre className="whitespace-pre-wrap rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          {example}
        </pre>
      )}
    </div>
  );
}

function RecommendBadge({ label }: { label: string }) {
  return (
    <TagBadge tone="info" className="px-2 py-0 text-[10px]">
      {label}
    </TagBadge>
  );
}

function AdvancedBadge({ label }: { label: string }) {
  return (
    <TagBadge tone="neutral" className="px-2 py-0 text-[10px]">
      {label}
    </TagBadge>
  );
}

function TagPreview({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "neutral" | "info";
}) {
  const items = splitCommaList(value);
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item, idx) => (
        <TagBadge
          key={`${item}-${idx}`}
          tone={tone}
          className="px-2 py-0.5 text-[10px]"
        >
          {item}
        </TagBadge>
      ))}
    </div>
  );
}

function AvatarUploadField({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (next: string) => void;
  name: string;
}) {
  const t = useRuntimeTranslator();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > 4 * 1024 * 1024) {
      setError(
        t(
          msg`图片太大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 4 MB。`,
        ),
      );
      return;
    }
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type.toLowerCase(),
      )
    ) {
      setError(t(msg`只支持 PNG / JPG / WebP / GIF。`));
      return;
    }
    setUploading(true);
    try {
      const { url } = await wikiApi.uploadAvatar(file);
      onChange(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t(msg`头像上传失败，请稍后再试`),
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <CharacterAvatarPreview avatar={value} name={name} size="md" />
        <div className="flex flex-1 flex-col gap-2">
          <TextField
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="🦊 / https://…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Trans>上传中…</Trans>
              ) : (
                <Trans>上传图片</Trans>
              )}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={uploading}
              >
                <Trans>清除</Trans>
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* AvatarUploadField 自身的本地 error 状态（图片太大 / 类型不支持 /
          上传失败），用户刚刚点了"上传图片"，需要 SR 即时反馈。 */}
      {error && (
        <InlineNotice tone="danger" role="alert">
          {error}
        </InlineNotice>
      )}
    </div>
  );
}

function CharacterAvatarPreview({
  avatar,
  name,
  size = "md",
}: {
  avatar: string;
  name: string;
  size?: "md" | "lg";
}) {
  const trimmed = (avatar ?? "").trim();
  // 协议相对 URL（"//evil/x.png"）以 `/` 开头会被 isUrl 误放过，浏览器实际把
  // 编辑预览发到 evil；反斜杠在 WHATWG URL parser 里被规范成正斜杠，同款攻击
  // 路径一起堵。和 home-page / character-page / my-characters CharacterAvatar
  // 同步硬化。
  const looksLikeProtocolRelative =
    trimmed.startsWith("//") || trimmed.includes("\\");
  const isUrl =
    !looksLikeProtocolRelative &&
    (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("/"));
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [trimmed]);
  // 原写法 lg → h-16 (64px)、md → h-20 (80px)，size 字面意义和实际像素是反的：
  // CharacterCardPreview 用 size="lg" 想要更显眼的大头像，渲染却比 size="md"
  // 的内联编辑预览小一圈。修正为 lg=80px, md=64px。
  const dim = size === "lg" ? "h-20 w-20 text-2xl" : "h-16 w-16 text-2xl";
  if (isUrl && !imgFailed) {
    return (
      <img
        src={trimmed}
        alt=""
        // 详情头像只有一张，async decode 让首屏文字更早可见。
        decoding="async"
        className={`shrink-0 rounded-2xl object-cover ${dim}`}
        onError={() => setImgFailed(true)}
      />
    );
  }
  // 头像 fallback 顺序：emoji / 短字面量 > 名字首字 > 🪞。注意 trimmed 是个
  // URL（imgFailed=true 走到这里）时不要 slice(0,2) 出 "ht" / "/a"，那是
  // bug，应该回到名字首字。Array.from 按 code point 切，避免表情代理对被切半。
  const trimmedIsUrlLike =
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:");
  const display = trimmedIsUrlLike
    ? Array.from(name)[0] || "🪞"
    : trimmed.length > 0
      ? trimmed.slice(0, 2)
      : Array.from(name)[0] || "🪞";
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-2xl bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)] ${dim}`}
    >
      {display}
    </div>
  );
}

function GenerationProgressBanner({
  section,
  elapsedSec,
}: {
  section: AiGenerateSection | null;
  elapsedSec: number;
}) {
  const t = useRuntimeTranslator();
  const sectionLabel = section ? getSectionLabel(section, t) : "";
  const expectedRange = section === "all" ? "20-40s" : "10-20s";
  return (
    <div className="sticky top-2 z-30 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[color:var(--border-brand)]/60 bg-[color:var(--surface-shell)]/95 px-4 py-3 text-sm shadow-[var(--shadow-card)] backdrop-blur">
      <span className="inline-flex h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[color:var(--border-brand)] border-t-transparent" />
      <span className="font-medium text-[color:var(--text-primary)]">
        <Trans>AI 正在生成「{sectionLabel}」…</Trans>
      </span>
      <span className="font-mono text-xs tabular-nums text-[color:var(--text-muted)]">
        ⏱ {elapsedSec}s · {expectedRange}
      </span>
      <span className="ml-auto text-xs text-[color:var(--text-muted)]">
        <Trans>表单已锁定。可以返回列表，回来后结果会自动填好。</Trans>
      </span>
    </div>
  );
}
