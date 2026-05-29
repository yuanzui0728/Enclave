// i18n-ignore-start: 内部生成质量逻辑，非用户可见 UI 文案。
// 全局共享池朋友圈「启发式质量打分」。纯函数。复用 moment-output-validator 的正则/锚点
// 原语（不重写），叠加 moment-diversity 的 trigram 相似度做新颖度。best-of-N 在所有
// 通过硬校验的候选里挑 total 最高者；低于阈值则整条不发（与现有「校验失败即跳过」一致）。
//
// 权重 / 近重复阈值 / 校验正则默认值来自 moment-quality-defaults，可被云平台
// reply_logic_runtime_rules.momentQuality 覆盖（通过 weights / nearDupSimilarity /
// validationConfig 入参传入；未传则用默认，行为逐字节不变）。
import type {
  MomentGenerationContext,
  PersonalityProfile,
} from './ai.types';
import {
  DEFAULT_MOMENT_VALIDATION_CONFIG,
  extractAnchorTokens,
  hasConcreteSignal,
  normalizeMomentText,
  type MomentValidationConfig,
} from './moment-output-validator';
import {
  DEFAULT_MOMENT_NEAR_DUP_SIMILARITY,
  DEFAULT_MOMENT_SCORER_WEIGHTS,
  type MomentScorerWeights,
} from './moment-quality-defaults';
import { maxSimilarityToRecent } from '../moments/moment-diversity';

export interface QualityScoreComponents {
  specificity: number;
  voiceFit: number;
  naturalness: number;
  novelty: number;
  noTemplate: number;
}

export interface QualityScore {
  /** 0..1 综合分。 */
  total: number;
  components: QualityScoreComponents;
  source: 'heuristic' | 'judge' | 'combined';
  reasons: string[];
  /** 近重复等硬拒：选择时强降权。 */
  hardRejected: boolean;
}

// 历史导出名（兼容直接 import 者）：默认权重 / 默认近重复阈值。
const WEIGHTS: MomentScorerWeights = DEFAULT_MOMENT_SCORER_WEIGHTS;
const NEAR_DUP_SIMILARITY = DEFAULT_MOMENT_NEAR_DUP_SIMILARITY;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function weightedTotal(
  components: QualityScoreComponents,
  weights: MomentScorerWeights = WEIGHTS,
): number {
  return clamp01(
    components.specificity * weights.specificity +
      components.novelty * weights.novelty +
      components.naturalness * weights.naturalness +
      components.noTemplate * weights.noTemplate +
      components.voiceFit * weights.voiceFit,
  );
}

export interface ScoreHeuristicInput {
  text: string;
  profile: PersonalityProfile;
  context?: MomentGenerationContext;
  /** 本角色 + 全局池近期帖文（新颖度对照）。 */
  recentTexts?: readonly string[];
  /** 云平台可覆盖的权重 / 近重复阈值 / 校验正则；未传用默认。 */
  weights?: MomentScorerWeights;
  nearDupSimilarity?: number;
  validationConfig?: MomentValidationConfig;
}

/**
 * 启发式打分。各分量 0..1。命中近重复时 hardRejected=true 且强降总分。
 * 不做空文本/长度等硬校验——那由调用方先跑 validateGeneratedSceneOutput。
 */
export function scoreHeuristic(input: ScoreHeuristicInput): QualityScore {
  const weights = input.weights ?? WEIGHTS;
  const nearDupThreshold = input.nearDupSimilarity ?? NEAR_DUP_SIMILARITY;
  const validation = input.validationConfig ?? DEFAULT_MOMENT_VALIDATION_CONFIG;
  const text = normalizeMomentText(input.text);
  const reasons: string[] = [];

  // —— specificity：锚点命中 + 具体信号 + 数字/长度 ——
  const anchorTokens = extractAnchorTokens(
    input.context,
    input.profile,
    validation.stopwords,
  );
  const anchorHit = anchorTokens.some((token) => text.includes(token));
  const concrete = hasConcreteSignal(text);
  let specificity = 0;
  if (anchorHit) specificity += 0.4;
  else reasons.push('无世界/话题锚点');
  if (concrete) specificity += 0.3;
  if (/\d/u.test(text)) specificity += 0.15;
  if (text.length >= 18) specificity += 0.15;
  specificity = clamp01(specificity);

  // —— naturalness：扣 meta / 舞台动作 / 提纲腔 ——
  let naturalness = 1;
  if (validation.metaPatterns.some((p) => p.test(text))) {
    naturalness -= 0.5;
    reasons.push('AI 口吻/解释腔');
  }
  if (validation.stageDirectionPatterns.some((p) => p.test(text))) {
    naturalness -= 0.4;
    reasons.push('舞台动作描写');
  }
  if (validation.structurePatterns.some((p) => p.test(text))) {
    naturalness -= 0.2;
    reasons.push('提纲/总结腔');
  }
  naturalness = clamp01(naturalness);

  // —— noTemplate：通用模板 / 结构模板 ——
  const hasGeneric = validation.genericPatterns.some((p) => p.test(text));
  const hasStructure = validation.structurePatterns.some((p) => p.test(text));
  let noTemplate = 1;
  if (hasGeneric) {
    noTemplate = 0;
    reasons.push('模板化措辞');
  } else if (hasStructure) {
    noTemplate = 0.4;
  }

  // —— novelty：对近期帖文的最大相似度 ——
  const recentTexts = input.recentTexts ?? [];
  const maxSim = maxSimilarityToRecent(text, recentTexts);
  const novelty = clamp01(1 - maxSim);
  const hardRejected = maxSim >= nearDupThreshold;
  if (hardRejected) reasons.push(`与近期帖近重复(${maxSim.toFixed(2)})`);

  // —— voiceFit：弱启发式（无 generic + 自然长度区间） ——
  let voiceFit = 0.5;
  if (!hasGeneric) voiceFit += 0.25;
  if (text.length >= 8 && text.length <= 140) voiceFit += 0.25;
  voiceFit = clamp01(voiceFit);

  const components: QualityScoreComponents = {
    specificity,
    voiceFit,
    naturalness,
    novelty,
    noTemplate,
  };
  let total = weightedTotal(components, weights);
  if (hardRejected) total = Math.min(total, 0.1);

  return { total, components, source: 'heuristic', reasons, hardRejected };
}

/**
 * 把 LLM 评委分量与启发式分量融合（judge 为主、heuristic 兜底锚点）。
 * 新颖度硬拒以 heuristic 为准（评委看不到近期帖）。
 */
export function combineWithJudge(
  heuristic: QualityScore,
  judge: QualityScoreComponents,
  weights: MomentScorerWeights = WEIGHTS,
): QualityScore {
  const components: QualityScoreComponents = {
    // 评委更可靠的语义维度以评委为主
    specificity: 0.4 * heuristic.components.specificity + 0.6 * clamp01(judge.specificity),
    voiceFit: clamp01(judge.voiceFit),
    naturalness: 0.3 * heuristic.components.naturalness + 0.7 * clamp01(judge.naturalness),
    noTemplate: 0.3 * heuristic.components.noTemplate + 0.7 * clamp01(judge.noTemplate),
    // 新颖度以本地 trigram 为准
    novelty: heuristic.components.novelty,
  };
  let total = weightedTotal(components, weights);
  if (heuristic.hardRejected) total = Math.min(total, 0.1);
  return {
    total,
    components,
    source: 'combined',
    reasons: heuristic.reasons,
    hardRejected: heuristic.hardRejected,
  };
}
// i18n-ignore-end
