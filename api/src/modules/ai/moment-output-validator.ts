import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  MomentGenerationContext,
  PersonalityProfile,
  SceneKey,
} from './ai.types';
import { sanitizeAiText } from './ai-text-sanitizer';
import {
  DEFAULT_GENERIC_PATTERNS,
  DEFAULT_META_PATTERNS,
  DEFAULT_MOMENT_LENGTH_RANGES,
  DEFAULT_MOMENT_STOPWORDS,
  DEFAULT_STAGE_DIRECTION_PATTERNS,
  DEFAULT_STRUCTURE_PATTERNS,
  type MomentLengthRange,
} from './moment-quality-defaults';

export type MomentOutputValidationResult = {
  valid: boolean;
  normalizedText: string;
  reasons: string[];
};

// 兼容历史导出名：编译默认值即这些常量（moment-quality-scorer 等仍直接 import）。
export const META_PATTERNS = DEFAULT_META_PATTERNS;
export const GENERIC_PATTERNS = DEFAULT_GENERIC_PATTERNS;
export const STRUCTURE_PATTERNS = DEFAULT_STRUCTURE_PATTERNS;
export const STAGE_DIRECTION_PATTERNS = DEFAULT_STAGE_DIRECTION_PATTERNS;

const DEFAULT_STOPWORDS_SET: ReadonlySet<string> = new Set(
  DEFAULT_MOMENT_STOPWORDS,
);

/**
 * 已编译的校验配置。运行时由 reply_logic_runtime_rules.momentQuality.validation
 * 经 compileMomentValidationConfig 得到；未传则用 DEFAULT_MOMENT_VALIDATION_CONFIG
 * （= 历史硬编码默认值，行为逐字节不变）。
 */
export interface MomentValidationConfig {
  metaPatterns: readonly RegExp[];
  genericPatterns: readonly RegExp[];
  structurePatterns: readonly RegExp[];
  stageDirectionPatterns: readonly RegExp[];
  stopwords: ReadonlySet<string>;
  lengthRanges: {
    momentsPost: MomentLengthRange;
    feedPost: MomentLengthRange;
    channelPost: MomentLengthRange;
    default: MomentLengthRange;
  };
}

/** 云平台存储/编辑的原始（未编译）形态：正则以字符串源存储。 */
export interface RawMomentValidationConfig {
  metaPatterns?: readonly string[];
  genericPatterns?: readonly string[];
  structurePatterns?: readonly string[];
  stageDirectionPatterns?: readonly string[];
  stopwords?: readonly string[];
  lengthRanges?: {
    momentsPost?: Partial<MomentLengthRange>;
    feedPost?: Partial<MomentLengthRange>;
    channelPost?: Partial<MomentLengthRange>;
    default?: Partial<MomentLengthRange>;
  };
}

export const DEFAULT_MOMENT_VALIDATION_CONFIG: MomentValidationConfig = {
  metaPatterns: DEFAULT_META_PATTERNS,
  genericPatterns: DEFAULT_GENERIC_PATTERNS,
  structurePatterns: DEFAULT_STRUCTURE_PATTERNS,
  stageDirectionPatterns: DEFAULT_STAGE_DIRECTION_PATTERNS,
  stopwords: DEFAULT_STOPWORDS_SET,
  lengthRanges: DEFAULT_MOMENT_LENGTH_RANGES,
};

// 逐条编译正则源；非法 pattern 静默跳过（运营填错不崩生成）。`sources` 未提供 →
// 回落默认；提供空数组 → 视为运营有意清空该类（返回空，允许关闭某类校验）。
function compilePatterns(
  sources: readonly string[] | undefined,
  fallback: readonly RegExp[],
): readonly RegExp[] {
  if (!Array.isArray(sources)) return fallback;
  const out: RegExp[] = [];
  for (const src of sources) {
    if (typeof src !== 'string' || !src) continue;
    try {
      out.push(new RegExp(src, 'u'));
    } catch {
      // 跳过非法正则
    }
  }
  return out;
}

function resolveRange(
  raw: Partial<MomentLengthRange> | undefined,
  fallback: MomentLengthRange,
): MomentLengthRange {
  const min =
    typeof raw?.min === 'number' && Number.isFinite(raw.min)
      ? raw.min
      : fallback.min;
  const max =
    typeof raw?.max === 'number' && Number.isFinite(raw.max)
      ? raw.max
      : fallback.max;
  return { min, max };
}

/** 把云平台存的原始配置编译成运行时 MomentValidationConfig（缺省回落默认）。 */
export function compileMomentValidationConfig(
  raw?: RawMomentValidationConfig | null,
): MomentValidationConfig {
  if (!raw) return DEFAULT_MOMENT_VALIDATION_CONFIG;
  return {
    metaPatterns: compilePatterns(raw.metaPatterns, DEFAULT_META_PATTERNS),
    genericPatterns: compilePatterns(
      raw.genericPatterns,
      DEFAULT_GENERIC_PATTERNS,
    ),
    structurePatterns: compilePatterns(
      raw.structurePatterns,
      DEFAULT_STRUCTURE_PATTERNS,
    ),
    stageDirectionPatterns: compilePatterns(
      raw.stageDirectionPatterns,
      DEFAULT_STAGE_DIRECTION_PATTERNS,
    ),
    stopwords: Array.isArray(raw.stopwords)
      ? new Set(raw.stopwords.filter((s) => typeof s === 'string' && s))
      : DEFAULT_STOPWORDS_SET,
    lengthRanges: {
      momentsPost: resolveRange(
        raw.lengthRanges?.momentsPost,
        DEFAULT_MOMENT_LENGTH_RANGES.momentsPost,
      ),
      feedPost: resolveRange(
        raw.lengthRanges?.feedPost,
        DEFAULT_MOMENT_LENGTH_RANGES.feedPost,
      ),
      channelPost: resolveRange(
        raw.lengthRanges?.channelPost,
        DEFAULT_MOMENT_LENGTH_RANGES.channelPost,
      ),
      default: resolveRange(
        raw.lengthRanges?.default,
        DEFAULT_MOMENT_LENGTH_RANGES.default,
      ),
    },
  };
}

export function normalizeMomentText(value: string) {
  return sanitizeAiText(value)
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`]/g, '')
    .trim();
}

export function extractAnchorTokens(
  context: MomentGenerationContext | undefined,
  profile: PersonalityProfile,
  stopwords: ReadonlySet<string> = DEFAULT_STOPWORDS_SET,
) {
  const tokens = new Set<string>();
  const sourceValues = [
    context?.worldContext?.weather,
    context?.worldContext?.location,
    context?.worldContext?.holiday,
    ...(context?.relationshipContext?.recentTopics ?? []),
    ...(profile.realWorldContext?.signalTitles ?? []),
    profile.realWorldContext?.realityMomentBrief ?? undefined,
  ];

  for (const sourceValue of sourceValues) {
    const normalized = sourceValue?.trim();
    if (!normalized) {
      continue;
    }

    const parts = normalized
      .split(/[；;，,。！!？?\s/·|]+/u)
      .map((item) => item.trim())
      .filter(Boolean);
    for (const part of [normalized, ...parts]) {
      if (part.length < 2 || part.length > 18 || stopwords.has(part)) {
        continue;
      }
      tokens.add(part);
    }
  }

  return [...tokens];
}

export function hasConcreteSignal(text: string) {
  return (
    /\d/u.test(text) ||
    /(晴|雨|雪|风|云|雷|雾|降温|升温|堵|晚高峰|清晨|午后|夜里|凌晨|傍晚|周[一二三四五六日天])/u.test(
      text,
    ) ||
    /[·:：]/u.test(text)
  );
}

function resolveLengthRange(
  sceneKey: SceneKey,
  config: MomentValidationConfig,
): MomentLengthRange {
  switch (sceneKey) {
    case 'moments_post':
      return config.lengthRanges.momentsPost;
    case 'feed_post':
      return config.lengthRanges.feedPost;
    case 'channel_post':
      return config.lengthRanges.channelPost;
    default:
      return config.lengthRanges.default;
  }
}

function validateSceneSpecificRules(input: {
  normalizedText: string;
  sceneKey: SceneKey;
  reasons: string[];
  config: MomentValidationConfig;
}) {
  const { normalizedText, sceneKey, reasons, config } = input;

  if (
    config.stageDirectionPatterns.some((pattern) => pattern.test(normalizedText))
  ) {
    reasons.push('含有舞台动作描写');
  }

  if (
    (sceneKey === 'feed_post' || sceneKey === 'channel_post') &&
    config.structurePatterns.some((pattern) => pattern.test(normalizedText))
  ) {
    reasons.push('内容像提纲或总结稿');
  }

  if (
    (sceneKey === 'moments_post' || sceneKey === 'feed_post') &&
    config.genericPatterns.some((pattern) => pattern.test(normalizedText))
  ) {
    reasons.push('内容偏模板化');
  }
}

export function validateGeneratedSceneOutput(input: {
  text: string;
  context?: MomentGenerationContext;
  profile: PersonalityProfile;
  sceneKey?: SceneKey;
  config?: MomentValidationConfig;
}): MomentOutputValidationResult {
  const config = input.config ?? DEFAULT_MOMENT_VALIDATION_CONFIG;
  const normalizedText = normalizeMomentText(input.text);
  const reasons: string[] = [];
  const sceneKey = input.sceneKey ?? 'moments_post';

  if (!normalizedText) {
    return {
      valid: false,
      normalizedText,
      reasons: ['内容为空'],
    };
  }

  const lengthRange = resolveLengthRange(sceneKey, config);
  if (normalizedText.length < lengthRange.min) {
    reasons.push('内容过短');
  }
  if (normalizedText.length > lengthRange.max) {
    reasons.push('内容过长');
  }
  if (config.metaPatterns.some((pattern) => pattern.test(normalizedText))) {
    reasons.push('带有解释或 AI 口吻');
  }

  validateSceneSpecificRules({
    normalizedText,
    sceneKey,
    reasons,
    config,
  });

  if (sceneKey === 'moments_post') {
    const anchorTokens = extractAnchorTokens(
      input.context,
      input.profile,
      config.stopwords,
    );
    const hasAnchorHit = anchorTokens.some((token) =>
      normalizedText.includes(token),
    );
    const hasGenericPattern = config.genericPatterns.some((pattern) =>
      pattern.test(normalizedText),
    );
    const concreteSignal = hasConcreteSignal(normalizedText);

    if (!hasAnchorHit && !concreteSignal && normalizedText.length < 14) {
      reasons.push('缺少具体锚点');
    }
    if (hasGenericPattern && !hasAnchorHit && !concreteSignal) {
      reasons.push('内容偏空泛');
    }
  }

  return {
    valid: reasons.length === 0,
    normalizedText,
    reasons,
  };
}

export const validateGeneratedMomentOutput = validateGeneratedSceneOutput;
// i18n-ignore-end
