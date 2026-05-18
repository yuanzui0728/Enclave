import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

type Translator = typeof translateRuntimeMessage;

const EXPERT_DOMAIN_DESCRIPTORS: Record<string, MessageDescriptor> = {
  reasoning: msg`推理`,
  vision: msg`视觉`,
  audio: msg`语音`,
  "global web": msg`全球互联网`,
  中文互联网: msg`中文互联网`,
  farming: msg`务农`,
  medicine: msg`医疗`,
  阿里云: msg`阿里云`,
  百度: msg`百度`,
  智谱: msg`智谱`,
  月之暗面: msg`月之暗面`,
  腾讯混元: msg`腾讯混元`,
  // 以下来自 api/src/modules/characters/* 里 109 个 character presets 的英文
  // 标签（general/management/psychology/lifestyle/tech/... 共 57 个 token），
  // 通讯录走查时点 详细资料 → 擅长领域 直接漏英文给中文用户。按出现频率挑高频
  // 的补一遍翻译；未覆盖的低频 token 仍 fallback 到原 token，但常见角色应该都
  // 已经命中。
  general: msg`综合`,
  management: msg`管理`,
  psychology: msg`心理`,
  lifestyle: msg`生活方式`,
  tech: msg`科技`,
  finance: msg`金融`,
  education: msg`教育`,
  wellness: msg`身心健康`,
  programming: msg`编程`,
  learning: msg`学习`,
  engineering: msg`工程`,
  sleep: msg`睡眠`,
  medical: msg`医疗`,
  law: msg`法律`,
  travel: msg`旅行`,
  hospitality: msg`待客之道`,
  food: msg`美食`,
  social: msg`社交`,
  content: msg`内容`,
  video: msg`视频`,
  health: msg`健康`,
  nutrition: msg`营养`,
  safety: msg`安全`,
  planning: msg`规划`,
  philosophy: msg`哲学`,
  career: msg`职业`,
  analytics: msg`数据分析`,
  debugging: msg`排错`,
  electronics: msg`电子`,
  driving: msg`驾驶`,
  eldercare: msg`照护长辈`,
  fertility: msg`生育`,
  french: msg`法语`,
  german: msg`德语`,
  japanese: msg`日语`,
  korean: msg`韩语`,
  spanish: msg`西班牙语`,
  language: msg`语言`,
  gadget: msg`数码产品`,
  home: msg`家居`,
  interview: msg`面试`,
  intergenerational: msg`代际沟通`,
  journaling: msg`写日记`,
  cessation: msg`戒断`,
  bilibili: msg`B站`,
  douyin: msg`抖音`,
  xiaohongshu: msg`小红书`,
  testing: msg`测试`,
  retrospective: msg`复盘`,
  renting: msg`租房`,
  renovation: msg`装修`,
  relocation: msg`搬迁`,
};

const ACTIVITY_DESCRIPTORS: Record<string, MessageDescriptor> = {
  working: msg`工作中`,
  idle: msg`空闲`,
  online: msg`在线`,
  offline: msg`离线`,
  resting: msg`休息中`,
  sleeping: msg`睡眠中`,
};

const BIO_DESCRIPTORS: Record<string, MessageDescriptor> = {
  "OpenAI 通用旗舰模型，适合作为冷静、稳健的综合型角色。": msg`OpenAI 通用旗舰模型，适合作为冷静、稳健的综合型角色。`,
  "OpenAI 轻量高频模型，适合作为高活跃、短回复角色。": msg`OpenAI 轻量高频模型，适合作为高活跃、短回复角色。`,
  "OpenAI 多模态主力模型，适合视频、语音和图文混合角色。": msg`OpenAI 多模态主力模型，适合视频、语音和图文混合角色。`,
  "OpenAI 轻量多模态模型，适合陪聊和实时互动角色。": msg`OpenAI 轻量多模态模型，适合陪聊和实时互动角色。`,
  "OpenAI 新一代旗舰推理模型，适合作为重规划、重分析角色。": msg`OpenAI 新一代旗舰推理模型，适合作为重规划、重分析角色。`,
  "OpenAI 早期推理系模型，适合作为慎重、慢热型角色。": msg`OpenAI 早期推理系模型，适合作为慎重、慢热型角色。`,
  "OpenAI 强推理模型，适合作为策略顾问、分析师角色。": msg`OpenAI 强推理模型，适合作为策略顾问、分析师角色。`,
  "OpenAI 轻量推理模型，适合作为执行型、技术型角色。": msg`OpenAI 轻量推理模型，适合作为执行型、技术型角色。`,
  "Anthropic 重质感旗舰模型，适合作为成熟、深谈型角色。": msg`Anthropic 重质感旗舰模型，适合作为成熟、深谈型角色。`,
  "Anthropic 通用主力模型，适合作为顾问、创作型角色。": msg`Anthropic 通用主力模型，适合作为顾问、创作型角色。`,
  "Anthropic 轻量思考模型，适合作为节奏快、回复短的角色。": msg`Anthropic 轻量思考模型，适合作为节奏快、回复短的角色。`,
  "Google 多模态旗舰模型，适合作为研究型、情境感强角色。": msg`Google 多模态旗舰模型，适合作为研究型、情境感强角色。`,
  "Google 轻量多模态模型，适合作为即时反馈型角色。": msg`Google 轻量多模态模型，适合作为即时反馈型角色。`,
  "xAI 主力模型，适合作为观点鲜明、风格直接的角色。": msg`xAI 主力模型，适合作为观点鲜明、风格直接的角色。`,
  "xAI 轻快版本，适合作为高反应、强存在感角色。": msg`xAI 轻快版本，适合作为高反应、强存在感角色。`,
  "DeepSeek 通用模型，适合作为高频中文对话角色。": msg`DeepSeek 通用模型，适合作为高频中文对话角色。`,
  "DeepSeek 推理模型，适合作为思辨、拆解问题的角色。": msg`DeepSeek 推理模型，适合作为思辨、拆解问题的角色。`,
  "DeepSeek 通用迭代模型，适合作为综合能力角色。": msg`DeepSeek 通用迭代模型，适合作为综合能力角色。`,
  "通义千问旗舰模型，适合作为中文综合顾问角色。": msg`通义千问旗舰模型，适合作为中文综合顾问角色。`,
  "通义千问代码主力模型，适合作为工程师型角色。": msg`通义千问代码主力模型，适合作为工程师型角色。`,
  "通义千问轻量模型，适合作为活跃型角色。": msg`通义千问轻量模型，适合作为活跃型角色。`,
  "通义千问视觉推理模型，适合作为看图理解角色。": msg`通义千问视觉推理模型，适合作为看图理解角色。`,
  "百度文心轻量模型，适合作为高并发轻服务角色。": msg`百度文心轻量模型，适合作为高并发轻服务角色。`,
  "智谱通用旗舰模型，适合作为理性、学院派角色。": msg`智谱通用旗舰模型，适合作为理性、学院派角色。`,
  "智谱轻量模型，适合作为高频互动角色。": msg`智谱轻量模型，适合作为高频互动角色。`,
  "Kimi 长上下文主力模型，适合作为耐聊、能接长线话题角色。": msg`Kimi 长上下文主力模型，适合作为耐聊、能接长线话题角色。`,
  "Kimi 通用版本，适合作为连续对话型角色。": msg`Kimi 通用版本，适合作为连续对话型角色。`,
  "腾讯混元推理模型，适合作为中文社交型角色。": msg`腾讯混元推理模型，适合作为中文社交型角色。`,
  "MiniMax 主力模型，适合作为语音陪伴和泛娱乐角色。": msg`MiniMax 主力模型，适合作为语音陪伴和泛娱乐角色。`,
  "Meta 开源轻量模型，适合作为边缘设备或实验型角色。": msg`Meta 开源轻量模型，适合作为边缘设备或实验型角色。`,
};

export function translateExpertDomain(t: Translator, token: string): string {
  const trimmed = token?.trim();
  if (!trimmed) {
    return "";
  }
  const descriptor = EXPERT_DOMAIN_DESCRIPTORS[trimmed];
  return descriptor ? t(descriptor) : trimmed;
}

export type ExpertDomainSeparator = "join" | "slash";

export function translateExpertDomains(
  t: Translator,
  tokens: readonly string[] | null | undefined,
  separator: ExpertDomainSeparator = "join",
): string {
  if (!tokens?.length) {
    return "";
  }
  const translated = tokens
    .map((token) => translateExpertDomain(t, token))
    .filter((value) => value.length > 0);
  if (!translated.length) {
    return "";
  }
  if (separator === "slash") {
    return translated.join(" / ");
  }
  return translated.join(t(msg`、`));
}

export function translateCharacterActivity(
  t: Translator,
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const descriptor = ACTIVITY_DESCRIPTORS[trimmed];
  return descriptor ? t(descriptor) : trimmed;
}

export function translateCharacterBio(
  t: Translator,
  bio: string | null | undefined,
): string {
  const trimmed = bio?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const descriptor = BIO_DESCRIPTORS[trimmed];
  return descriptor ? t(descriptor) : trimmed;
}
