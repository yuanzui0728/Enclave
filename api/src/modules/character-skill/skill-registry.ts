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
// 三类文档产出（pptx/docx/xlsx）统一复用 cloud 已 seed 的 `ppt.generate`(unitCostCents:30,
// 标签"生成PPT/报告")计费——避免为 docx/xlsx 单独加 cloud 计费目录键、省一次 cloud-api 部署+迁移，
// 仍按 ×markup(默认2) 正确扣费；运营可经该键统一开关/调价整个"AI 文档生成"品类。
const UNIT_COST_HINT_CENTS: Record<string, number> = {
  'ppt.generate': 30,
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
  billingActionKey: 'ppt.generate',
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
  billingActionKey: 'ppt.generate',
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

// ---- 共享规格 prompt + 量算（P5 扩面的产出型专家复用，三类渲染器同一套 schema）----
function pptxSpecPrompt(outline: unknown, styleNote: string): string {
  return `把以下大纲扩成可直接渲染的 deck 规格 JSON，只输出 JSON：
{"title":"封面标题","subtitle":"副标题","theme":"light",
 "slides":[{"layout":"section","title":"分隔标题"},
   {"layout":"bullets","title":"页标题","bullets":["要点(<=40字)"]},
   {"layout":"two_column","title":"页标题","columns":{"left":["..."],"right":["..."]}}]}
规则：不要再放封面页(渲染器自动生成)；每节先一张 section 再跟 1~3 张内容页；bullets 每页 3~6 条口语可讲；总页数贴合大纲。${styleNote}
大纲：${JSON.stringify(outline)}`;
}
function docxSpecPrompt(outline: unknown, styleNote: string): string {
  return `把以下大纲扩成可渲染的 Word 文档规格 JSON，只输出 JSON：
{"title":"标题","blocks":[{"type":"heading","level":1,"text":"小节标题"},
  {"type":"paragraph","text":"正文"},{"type":"bullets","items":["要点"]},
  {"type":"table","table":{"headers":["列1","列2"],"rows":[["..","..]]}}]}
规则：用 heading 分小节；要点用 bullets；结构化清单用 table；缺失信息写"待确认"不杜撰。${styleNote}
大纲：${JSON.stringify(outline)}`;
}
function xlsxSpecPrompt(outline: unknown, styleNote: string): string {
  return `把以下表结构扩成可渲染的 Excel 规格 JSON，只输出 JSON：
{"sheets":[{"name":"工作表名","columns":[{"header":"列名","key":"列key(英文/拼音)","width":16}],
  "rows":[{"列key":"值"}],"freezeHeader":true}]}
规则：rows 每个对象 key 必须与 columns 的 key 完全一致；有真实数据填真实数据否则给合理示例行(3~10行)；数值用数字不加引号。${styleNote}
表结构：${JSON.stringify(outline)}`;
}
function pptxQty(outline: unknown): number {
  const o = (outline ?? {}) as { estimatedSlides?: number; sections?: unknown[] };
  const n =
    typeof o.estimatedSlides === 'number'
      ? o.estimatedSlides
      : Array.isArray(o.sections)
        ? o.sections.length * 2 + 1
        : 8;
  return clamp(n, 4, 40);
}
function docxQty(outline: unknown): number {
  const o = (outline ?? {}) as { estimatedBlocks?: number; sections?: unknown[] };
  const blocks =
    typeof o.estimatedBlocks === 'number'
      ? o.estimatedBlocks
      : Array.isArray(o.sections)
        ? o.sections.length * 3
        : 12;
  return clamp(Math.ceil(blocks / 6), 1, 30);
}
function xlsxQty(outline: unknown): number {
  const o = (outline ?? {}) as { sheets?: Array<{ estimatedRows?: number }> };
  const sheets = Array.isArray(o.sheets) ? o.sheets : [];
  const blocks = sheets.reduce(
    (s, x) => s + Math.ceil((x?.estimatedRows ?? 20) / 50),
    0,
  );
  return clamp(blocks || 1, 1, 20);
}

// P5：把其余产出型专家接上技能（统一复用 ppt.generate 计费 + 三类渲染器）。
const CONTENT_PLAN_SKILL: SkillDefinition = {
  skillKey: 'doc.content_plan',
  artifactType: 'docx',
  artifactName: '内容方案',
  unit: '页',
  billingActionKey: 'ppt.generate',
  intentKeywords: ['内容方案', '长图文', '发帖计划', '运营方案', '选题', '周报', '内容策划', '排期'],
  requiredSlots: [
    { key: 'topic', label: '主题', ask: '这份内容方案围绕什么主题/账号？' },
    { key: 'platform_goal', label: '平台与目标', ask: '发哪个平台、想达成什么(涨粉/转化/种草)？' },
  ],
  outlinePromptBuilder: (c) => `你是新媒体内容运营「${c.characterName}」。基于主题与目标，产出内容方案大纲 JSON：
{"title":"方案标题","sections":[{"heading":"小节(如 选题方向/内容结构/发帖排期/钩子与CTA/复盘指标)","points":["要点"]}],"estimatedBlocks":整数}
主题：${c.slots['topic'] ?? ''} 平台/目标：${c.slots['platform_goal'] ?? c.userGoal}`,
  specPromptBuilder: (c) => docxSpecPrompt(c.outline, '风格：可执行、给具体钩子与排期，不空谈。'),
  quantityFromOutline: docxQty,
  rendererKey: 'docx',
  fileNameBuilder: (c) => `${slotText(c.slots, 'topic') || '内容'}方案.docx`,
};
const PROPOSAL_SKILL: SkillDefinition = {
  skillKey: 'doc.proposal',
  artifactType: 'docx',
  artifactName: '标书方案',
  unit: '页',
  billingActionKey: 'ppt.generate',
  intentKeywords: ['标书', '技术标', '投标方案', '招标', '应答', '商务标', '方案框架'],
  requiredSlots: [
    { key: 'project', label: '项目', ask: '是什么项目/采购内容的标？' },
    { key: 'scoring', label: '评分重点', ask: '评分办法或关注的技术/商务要点是什么(有原文更好)？' },
  ],
  outlinePromptBuilder: (c) => `你是招投标顾问「${c.characterName}」。按评分点反推标书章节，产出大纲 JSON：
{"title":"标书标题","sections":[{"heading":"章节(项目理解/技术方案/实施组织/质量保障/服务承诺等)","points":["对齐评分点的要点"]}],"estimatedBlocks":整数}
不保证中标、不碰围标串标。项目：${c.slots['project'] ?? ''} 评分重点：${c.slots['scoring'] ?? c.userGoal}`,
  specPromptBuilder: (c) => docxSpecPrompt(c.outline, '风格：逐章对齐评分点、可落地；不写违规内容。'),
  quantityFromOutline: docxQty,
  rendererKey: 'docx',
  fileNameBuilder: (c) => `${slotText(c.slots, 'project') || '投标'}技术标.docx`,
};
const SOLUTION_DECK_SKILL: SkillDefinition = {
  skillKey: 'ppt.solution',
  artifactType: 'pptx',
  artifactName: '解决方案 PPT',
  unit: '页',
  billingActionKey: 'ppt.generate',
  intentKeywords: ['解决方案', '售前', '方案ppt', '提案', '述标', '客户方案', '产品方案'],
  requiredSlots: [
    { key: 'customer', label: '客户/场景', ask: '面向哪个客户、什么场景或痛点？' },
    { key: 'offering', label: '方案内容', ask: '你的产品/方案能力是什么、想突出什么价值？' },
  ],
  outlinePromptBuilder: (c) => `你是售前方案顾问「${c.characterName}」。产出解决方案演示大纲 JSON：
{"title":"方案标题","subtitle":"副标题","sections":[{"heading":"小节(现状痛点/方案总览/能力亮点/实施路径/价值收益/案例)","bullets":["要点"]}],"estimatedSlides":整数}
客户/场景：${c.slots['customer'] ?? ''} 方案：${c.slots['offering'] ?? c.userGoal}`,
  specPromptBuilder: (c) => pptxSpecPrompt(c.outline, '风格：先痛点后价值、主线清晰、不堆术语。'),
  quantityFromOutline: pptxQty,
  rendererKey: 'pptx',
  fileNameBuilder: (c) => `${slotText(c.slots, 'customer') || '客户'}解决方案.pptx`,
};
const PROJECT_WORKBOOK_SKILL: SkillDefinition = {
  skillKey: 'sheet.project',
  artifactType: 'xlsx',
  artifactName: '项目套表',
  unit: '张表',
  billingActionKey: 'ppt.generate',
  intentKeywords: ['项目表', '套表', '对账', '台账', '日报表', '交付表', '进度表', '跟进表'],
  requiredSlots: [
    { key: 'purpose', label: '用途', ask: '这套表用来管什么(项目进度/费用对账/跟进记录)？' },
    { key: 'fields', label: '字段', ask: '想要哪些字段/列？有数据也可直接发我。' },
  ],
  outlinePromptBuilder: (c) => `你是项目交付与运营经理「${c.characterName}」。设计项目套表结构，产出 JSON：
{"title":"表名","sheets":[{"name":"工作表名","columns":["列1","列2"],"estimatedRows":整数}]}
用途：${c.slots['purpose'] ?? ''} 字段/数据：${c.slots['fields'] ?? c.userGoal}`,
  specPromptBuilder: (c) => xlsxSpecPrompt(c.outline, '风格：列贴合用途、可直接录入；含合计/状态等实用列。'),
  quantityFromOutline: xlsxQty,
  rendererKey: 'xlsx',
  fileNameBuilder: (c) => `${slotText(c.slots, 'purpose') || '项目'}套表.xlsx`,
};
const BENCHMARK_SKILL: SkillDefinition = {
  skillKey: 'sheet.benchmark',
  artifactType: 'xlsx',
  artifactName: '竞品对标表',
  unit: '张表',
  billingActionKey: 'ppt.generate',
  intentKeywords: ['竞品', '对标', '对比表', '竞争分析', '矩阵', 'benchmark', '友商'],
  requiredSlots: [
    { key: 'category', label: '品类/对手', ask: '对标哪个品类或哪些竞品？' },
    { key: 'dimensions', label: '对比维度', ask: '从哪些维度对比(功能/价格/获客/口碑)？' },
  ],
  outlinePromptBuilder: (c) => `你是竞品情报分析师「${c.characterName}」。设计竞品对标矩阵，产出 JSON：
{"title":"对标表名","sheets":[{"name":"对标矩阵","columns":["维度","我方","竞品A","竞品B"],"estimatedRows":整数}]}
不直接抓平台数据，给对标框架与可填结构。品类/对手：${c.slots['category'] ?? ''} 维度：${c.slots['dimensions'] ?? c.userGoal}`,
  specPromptBuilder: (c) => xlsxSpecPrompt(c.outline, '风格：维度成行、对象成列；拿不准的格子填"待核实"。'),
  quantityFromOutline: xlsxQty,
  rendererKey: 'xlsx',
  fileNameBuilder: (c) => `${slotText(c.slots, 'category') || '竞品'}对标.xlsx`,
};
const EVENT_PLAN_SKILL: SkillDefinition = {
  skillKey: 'doc.event_plan',
  artifactType: 'docx',
  artifactName: '活动方案',
  unit: '页',
  billingActionKey: 'ppt.generate',
  intentKeywords: ['活动方案', '活动策划', '策划案', '礼品方案', '促销方案', '活动执行'],
  requiredSlots: [
    { key: 'occasion', label: '活动场景', ask: '什么活动/场景(节日促销/客户答谢/新品发布)？' },
    { key: 'budget_goal', label: '预算与目标', ask: '大致预算和想达成的目标是什么？' },
  ],
  outlinePromptBuilder: (c) => `你是活动策划与礼品选品专家「${c.characterName}」。产出活动方案大纲 JSON：
{"title":"活动方案标题","sections":[{"heading":"小节(活动目标/玩法机制/礼品方向/执行排期/预算分配/风险与复盘)","points":["要点"]}],"estimatedBlocks":整数}
场景：${c.slots['occasion'] ?? ''} 预算/目标：${c.slots['budget_goal'] ?? c.userGoal}`,
  specPromptBuilder: (c) => docxSpecPrompt(c.outline, '风格：玩法可落地、礼品给方向与比价要点，不替下单。'),
  quantityFromOutline: docxQty,
  rendererKey: 'docx',
  fileNameBuilder: (c) => `${slotText(c.slots, 'occasion') || '活动'}方案.docx`,
};

// characterSourceKey → 该角色可触发的技能（一对一）。
export const SKILL_REGISTRY: Record<string, SkillDefinition> = {
  // P3 首发（三类渲染器各一）
  reporting_ppt_designer: PPT_DECK_SKILL,
  meeting_minutes_aide: MEETING_MINUTES_SKILL,
  social_media_analyst: SOCIAL_ANALYTICS_SKILL,
  // P5 扩面
  content_ops_strategist: CONTENT_PLAN_SKILL,
  bidding_consultant: PROPOSAL_SKILL,
  presales_solution_advisor: SOLUTION_DECK_SKILL,
  delivery_ops_manager: PROJECT_WORKBOOK_SKILL,
  competitive_intel_analyst: BENCHMARK_SKILL,
  event_gift_planner: EVENT_PLAN_SKILL,
};

export function getSkillForSourceKey(
  sourceKey: string | null | undefined,
): SkillDefinition | null {
  if (!sourceKey) return null;
  return SKILL_REGISTRY[sourceKey] ?? null;
}
// i18n-ignore-end
