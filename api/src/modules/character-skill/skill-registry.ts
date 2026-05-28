// i18n-ignore-start: 角色技能定义 + LLM 规格生成 prompt（preset/prompt 文案，非 UI）。
import type { SkillArtifactType } from './renderers/renderer.types';

export interface SkillSlotDef {
  key: string;
  label: string;
  ask: string; // 缺该槽时向用户提的问题
}

export interface SkillPromptContext {
  characterName: string;
  userGoal: string; // 触发/累积的诉求原文
  slots: Record<string, unknown>;
}

export interface SkillDefinition {
  skillKey: string; // 全局唯一
  artifactType: SkillArtifactType;
  artifactName: string; // 用户话术里的成品名：PPT / Word 文档 / Excel 表格
  unit: string; // 计量单位：页 / 张表
  billingActionKey: string;
  intentKeywords: string[]; // 快速意图门控
  requiredSlots: SkillSlotDef[]; // 齐了才报价
  // 出"大纲"（算量用，轻量）。LLM 经 generateJsonObject 产出。
  outlinePromptBuilder: (ctx: SkillPromptContext) => string;
  // 把大纲扩成 renderer 能吃的完整规格（DeckSpec/DocSpec/SheetSpec）。
  specPromptBuilder: (ctx: SkillPromptContext & { outline: unknown }) => string;
  // 量 → quantity（算成本 & 扣费第三参）。
  quantityFromOutline: (outline: unknown) => number;
  rendererKey: SkillArtifactType;
  // 文件名（不含时间戳，存储层会去敏/去重）。
  fileNameBuilder: (ctx: SkillPromptContext) => string;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function slotText(slots: Record<string, unknown>, key: string): string {
  const v = slots[key];
  return typeof v === 'string' ? v.trim() : '';
}

// ---- 本地报价估算（仅用于"约 ¥X"展示）；真实扣费以 cloud actionCatalog × markup 为权威。----
// 与 cloud-api seed (1779800000000-seed-billable-action-catalog) 对齐。markup 默认 2。
const UNIT_COST_HINT_CENTS: Record<string, number> = {
  'ppt.generate': 30,
  'document.docx.generate': 20,
  'document.xlsx.generate': 20,
};
const MARKUP_HINT = 2;

export function estimatePriceCents(
  billingActionKey: string,
  quantity: number,
): number {
  const unit = UNIT_COST_HINT_CENTS[billingActionKey] ?? 30;
  return unit * MARKUP_HINT * Math.max(1, quantity);
}

// ---- PPT skill（reporting_ppt_designer，P2 首发）----
const PPT_DECK_SKILL: SkillDefinition = {
  skillKey: 'ppt.deck',
  artifactType: 'pptx',
  artifactName: 'PPT',
  unit: '页',
  billingActionKey: 'ppt.generate',
  intentKeywords: [
    'ppt',
    'PPT',
    '幻灯片',
    '演示',
    '汇报材料',
    '做个片子',
    '做份片子',
    'deck',
    'presentation',
    '述职',
    '路演',
    '提案',
  ],
  requiredSlots: [
    { key: 'topic', label: '主题', ask: '这份 PPT 的主题/标题是什么？' },
    {
      key: 'audience',
      label: '汇报对象',
      ask: '主要讲给谁听（领导 / 客户 / 团队）？',
    },
    {
      key: 'goal',
      label: '核心目的',
      ask: '想让对方看完记住或同意什么？',
    },
  ],
  outlinePromptBuilder: (ctx) => `你是资深汇报与演示策划「${ctx.characterName}」。
基于用户诉求与已知信息，产出一份 PPT 大纲，只输出 JSON，结构如下：
{"title": "演示标题", "subtitle": "副标题(可空)", "sections": [{"heading": "章节标题", "bullets": ["要点1","要点2"]}], "estimatedSlides": 整数}
要求：sections 控制在 4~10 个；每个 section 的 bullets 2~5 条、精炼可讲；estimatedSlides 为含封面的总页数估计。
用户诉求：${ctx.userGoal}
已知信息：${JSON.stringify(ctx.slots)}`,
  specPromptBuilder: (ctx) => `把以下 PPT 大纲扩成可直接渲染的 deck 规格，只输出 JSON：
{"title": "封面标题", "subtitle": "封面副标题", "theme": "light",
 "slides": [
   {"layout": "section", "title": "章节分隔标题"},
   {"layout": "bullets", "title": "页标题", "bullets": ["要点(每条<=40字)", "..."]},
   {"layout": "two_column", "title": "页标题", "columns": {"left": ["..."], "right": ["..."]}}
 ]}
规则：不要再放封面页（渲染器会自动生成封面）；每个 section 先放一张 "section" 分隔页再跟 1~3 张内容页；
bullets 每页 3~6 条、口语可讲、不堆术语；两栏用于对比类内容。总页数贴合大纲的 estimatedSlides。
大纲：${JSON.stringify(ctx.outline)}
角色风格：务实、抓主线、不画饼。`,
  quantityFromOutline: (outline) => {
    const o = (outline ?? {}) as {
      estimatedSlides?: number;
      sections?: unknown[];
    };
    const n =
      typeof o.estimatedSlides === 'number'
        ? o.estimatedSlides
        : Array.isArray(o.sections)
          ? o.sections.length * 2 + 1
          : 8;
    return clamp(n, 4, 40);
  },
  rendererKey: 'pptx',
  fileNameBuilder: (ctx) => `${slotText(ctx.slots, 'topic') || '汇报'}.pptx`,
};

// characterSourceKey → 该角色可触发的技能（一对一）。
export const SKILL_REGISTRY: Record<string, SkillDefinition> = {
  reporting_ppt_designer: PPT_DECK_SKILL,
};

export function getSkillForSourceKey(
  sourceKey: string | null | undefined,
): SkillDefinition | null {
  if (!sourceKey) return null;
  return SKILL_REGISTRY[sourceKey] ?? null;
}
// i18n-ignore-end
