// i18n-ignore-start: 内部生成质量逻辑默认值，非用户可见 UI 文案。
//
// 朋友圈/动态生成「质量管线」全部硬编码默认值的单一来源。
// 本文件**不 import 任何东西**（避免与 reply-logic.constants / moment-* 形成循环）：
//   - moment-output-validator / moment-quality-scorer / moment-judge 编译自这里的默认值；
//   - reply-logic.constants 也 import 这里，把同一份默认值写进可在云平台编辑的
//     reply_logic_runtime_rules.momentQuality（运营改前逐字节等于这些默认值）。
// 任何一处想改默认值，只改这一个文件。

export const DEFAULT_META_PATTERNS: readonly RegExp[] = [
  /作为AI/u,
  /语言模型/u,
  /^朋友圈[：:]/u,
  /^文案[：:]/u,
  /(以下|下面).{0,4}(朋友圈|文案|内容)/u,
  /(只输出|不要解释|说明如下)/u,
];

export const DEFAULT_GENERIC_PATTERNS: readonly RegExp[] = [
  /生活碎片/u,
  /记录一下/u,
  /随手一发/u,
  /新的一天/u,
  /继续加油/u,
  /保持热爱/u,
  /慢慢来/u,
  /就是这样/u,
  /最近状态/u,
  /有时候/u,
  /碎碎念/u,
  /一切都会/u,
];

export const DEFAULT_STRUCTURE_PATTERNS: readonly RegExp[] = [
  /首先/u,
  /其次/u,
  /最后/u,
  /总之/u,
  /以下(?:几点|几个方面|内容)/u,
  /分(?:三|3)点/u,
];

export const DEFAULT_STAGE_DIRECTION_PATTERNS: readonly RegExp[] = [
  /^[（(](?:轻笑|笑了笑|笑|苦笑|叹气|叹了口气|沉默|停顿|顿了顿|停了停|想了想|看了看|看向|看着|低头|抬头|耸肩|皱眉|挑眉|扶额|点头|摇头|拍拍|抱抱|凑近|后退|清了清嗓|咳了一声|压低声音|轻声|无奈|认真)[^）)]{0,12}[)）]/u,
  /^[*＊](?:轻笑|笑了笑|笑|苦笑|叹气|叹了口气|沉默|停顿|顿了顿|停了停|想了想|看了看|看向|看着|低头|抬头|耸肩|皱眉|挑眉|扶额|点头|摇头|拍拍|抱抱|凑近|后退|清了清嗓|咳了一声|压低声音|轻声|无奈|认真)[^*＊\n]{0,12}[*＊]/u,
];

export const DEFAULT_MOMENT_STOPWORDS: readonly string[] = [
  '今天',
  '最近',
  '现在',
  '一下',
  '一个',
  '一些',
  '这个',
  '那个',
  '就是',
  '还是',
  '真的',
  '感觉',
  '状态',
  '因为',
  '所以',
  '继续',
  '生活',
  '自己',
  '大家',
];

export type MomentLengthRange = { min: number; max: number };

// 按场景的正文长度区间（resolveLengthRange 的默认表）。
export const DEFAULT_MOMENT_LENGTH_RANGES: {
  momentsPost: MomentLengthRange;
  feedPost: MomentLengthRange;
  channelPost: MomentLengthRange;
  default: MomentLengthRange;
} = {
  momentsPost: { min: 5, max: 160 },
  feedPost: { min: 8, max: 220 },
  channelPost: { min: 16, max: 320 },
  default: { min: 4, max: 180 },
};

export type MomentScorerWeights = {
  specificity: number;
  novelty: number;
  naturalness: number;
  noTemplate: number;
  voiceFit: number;
};

// best-of-N 综合分权重（和为 1）。
export const DEFAULT_MOMENT_SCORER_WEIGHTS: MomentScorerWeights = {
  specificity: 0.25,
  novelty: 0.2,
  naturalness: 0.2,
  noTemplate: 0.25,
  voiceFit: 0.1,
};

// 近重复硬拒阈值（trigram Jaccard）。
export const DEFAULT_MOMENT_NEAR_DUP_SIMILARITY = 0.6;

// 全局共享池 best-of-N 候选数。
export const DEFAULT_MOMENT_CANDIDATE_COUNT = 3;

// 低于该综合分整条不发（拒掉「过了 validator 硬门但仍带模板腔」那一档）。
export const DEFAULT_MOMENT_MIN_ACCEPT_SCORE = 0.6;

// LLM 评委 system prompt（对一批候选按 4 维度 0..1 打分）。
export const DEFAULT_MOMENT_JUDGE_SYSTEM_PROMPT = [
  '你是一个中文社交动态（朋友圈）质量评审。只评估文本质量，不改写、不解释。',
  '对每条候选按以下 4 个维度各打 0 到 1 的分（保留两位小数）：',
  '- specificity 具体度：有没有具体的细节/名词/数字/场景，而不是空泛抒情。',
  '- voiceFit 人设契合：是否像这个角色本人随手发的，而非通用 AI 腔。',
  '- naturalness 自然度：像真人此刻发的一句话，没有解释腔、提纲、舞台动作描写。',
  '- noTemplate 去模板：避开「记录一下/新的一天/继续加油/首先其次」等套话与结构化套路。',
  '严格只输出 JSON，形如 {"scores":[{"i":0,"specificity":0.0,"voiceFit":0.0,"naturalness":0.0,"noTemplate":0.0}]}，不要任何额外文字。',
].join('\n');
// i18n-ignore-end
