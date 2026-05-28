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

// ---- 会议纪要 docx skill（meeting_minutes_aide）----
const MEETING_MINUTES_SKILL: SkillDefinition = {
  skillKey: 'doc.minutes',
  artifactType: 'docx',
  artifactName: '会议纪要',
  unit: '页',
  billingActionKey: 'document.docx.generate',
  intentKeywords: [
    '会议纪要',
    '纪要',
    '会议记录',
    '整理会议',
    '整理纪要',
    '会议总结',
    '行动计划',
    '会后整理',
  ],
  requiredSlots: [
    {
      key: 'meeting_topic',
      label: '会议主题',
      ask: '这次会议是关于什么的（主题/项目）？',
    },
    {
      key: 'raw_notes',
      label: '会议内容',
      ask: '把会议要点 / 讨论内容 / 你的速记发我（越全成品越准）。',
    },
  ],
  outlinePromptBuilder: (ctx) => `你是会议纪要助理「${ctx.characterName}」。
基于会议主题与原始记录，产出一份标准会议纪要大纲，只输出 JSON：
{"title": "纪要标题", "sections": [{"heading": "小节(如 会议信息/讨论要点/决议事项/行动计划/待跟进)", "points": ["要点"]}], "estimatedBlocks": 整数}
要求：sections 覆盖会议信息、讨论要点、决议事项、行动计划等；行动计划尽量含负责人/截止；缺失信息标"待确认"不杜撰。
会议主题：${ctx.slots['meeting_topic'] ?? ''}
原始记录：${ctx.slots['raw_notes'] ?? ctx.userGoal}`,
  specPromptBuilder: (ctx) => `把以下会议纪要大纲扩成可渲染的 Word 文档规格，只输出 JSON：
{"title": "纪要标题",
 "blocks": [
   {"type": "heading", "level": 1, "text": "标题"},
   {"type": "paragraph", "text": "正文段落"},
   {"type": "bullets", "items": ["要点1", "要点2"]},
   {"type": "table", "table": {"headers": ["行动项","负责人","截止"], "rows": [["...","...","..."]]}}
 ]}
规则：用 heading 分小节；决议/要点用 bullets；行动计划优先用 table(行动项/负责人/截止)；缺失信息写"待确认"。
大纲：${JSON.stringify(ctx.outline)}`,
  quantityFromOutline: (outline) => {
    const o = (outline ?? {}) as {
      estimatedBlocks?: number;
      sections?: unknown[];
    };
    const blocks =
      typeof o.estimatedBlocks === 'number'
        ? o.estimatedBlocks
        : Array.isArray(o.sections)
          ? o.sections.length * 3
          : 12;
    return clamp(Math.ceil(blocks / 6), 1, 30);
  },
  rendererKey: 'docx',
  fileNameBuilder: (ctx) =>
    `${slotText(ctx.slots, 'meeting_topic') || '会议'}纪要.docx`,
};

// ---- 社媒数据 xlsx skill（social_media_analyst）----
const SOCIAL_ANALYTICS_SKILL: SkillDefinition = {
  skillKey: 'sheet.analytics',
  artifactType: 'xlsx',
  artifactName: 'Excel 表格',
  unit: '张表',
  billingActionKey: 'document.xlsx.generate',
  intentKeywords: [
    '表格',
    'excel',
    'Excel',
    '看板',
    '数据表',
    '周报表',
    '导出表',
    '统计表',
    '台账',
    '做个表',
  ],
  requiredSlots: [
    {
      key: 'subject',
      label: '表格主题',
      ask: '这张表要统计/分析什么（如 多平台社媒周报）？',
    },
    {
      key: 'dimensions',
      label: '维度/指标',
      ask: '想看哪些维度或指标（如 平台、曝光、互动率、涨粉）？有数据也可直接发我。',
    },
  ],
  outlinePromptBuilder: (ctx) => `你是社媒数据分析师「${ctx.characterName}」。
基于主题与维度，设计一份 Excel 表结构（可含示例/占位行），只输出 JSON：
{"title": "表名", "sheets": [{"name": "工作表名", "columns": ["列1","列2"], "estimatedRows": 整数}]}
要求：列要贴合用户维度/指标；若用户给了真实数据用真实的，否则给清晰的占位结构（estimatedRows 给预计行数）。
主题：${ctx.slots['subject'] ?? ''}
维度/数据：${ctx.slots['dimensions'] ?? ctx.userGoal}`,
  specPromptBuilder: (ctx) => `把以下表结构扩成可渲染的 Excel 规格，只输出 JSON：
{"sheets": [
  {"name": "工作表名",
   "columns": [{"header": "列名", "key": "列key(英文/拼音)", "width": 16}],
   "rows": [{"列key": "值"}],
   "freezeHeader": true}
]}
规则：rows 的每个对象 key 必须与 columns 的 key 完全一致；用户给了真实数据就填真实数据，否则填合理示例行(3~10 行)；数值用数字不加引号。
表结构：${JSON.stringify(ctx.outline)}`,
  quantityFromOutline: (outline) => {
    const o = (outline ?? {}) as {
      sheets?: Array<{ estimatedRows?: number }>;
    };
    const sheets = Array.isArray(o.sheets) ? o.sheets : [];
    const blocks = sheets.reduce(
      (sum, s) => sum + Math.ceil((s?.estimatedRows ?? 20) / 50),
      0,
    );
    return clamp(blocks || 1, 1, 20);
  },
  rendererKey: 'xlsx',
  fileNameBuilder: (ctx) => `${slotText(ctx.slots, 'subject') || '数据'}.xlsx`,
};

// characterSourceKey → 该角色可触发的技能（一对一）。
export const SKILL_REGISTRY: Record<string, SkillDefinition> = {
  reporting_ppt_designer: PPT_DECK_SKILL,
  meeting_minutes_aide: MEETING_MINUTES_SKILL,
  social_media_analyst: SOCIAL_ANALYTICS_SKILL,
};

export function getSkillForSourceKey(
  sourceKey: string | null | undefined,
): SkillDefinition | null {
  if (!sourceKey) return null;
  return SKILL_REGISTRY[sourceKey] ?? null;
}
// i18n-ignore-end
