import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  MomentGenerationContext,
  PersonalityProfile,
  SceneKey,
} from './ai.types';
import { sanitizeAiText } from './ai-text-sanitizer';

export type MomentOutputValidationResult = {
  valid: boolean;
  normalizedText: string;
  reasons: string[];
};

export const META_PATTERNS = [
  /作为AI/u,
  /语言模型/u,
  /^朋友圈[：:]/u,
  /^文案[：:]/u,
  /(以下|下面).{0,4}(朋友圈|文案|内容)/u,
  /(只输出|不要解释|说明如下)/u,
];

export const GENERIC_PATTERNS = [
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

export const STRUCTURE_PATTERNS = [
  /首先/u,
  /其次/u,
  /最后/u,
  /总之/u,
  /以下(?:几点|几个方面|内容)/u,
  /分(?:三|3)点/u,
];

export const STAGE_DIRECTION_PATTERNS = [
  /^[（(](?:轻笑|笑了笑|笑|苦笑|叹气|叹了口气|沉默|停顿|顿了顿|停了停|想了想|看了看|看向|看着|低头|抬头|耸肩|皱眉|挑眉|扶额|点头|摇头|拍拍|抱抱|凑近|后退|清了清嗓|咳了一声|压低声音|轻声|无奈|认真)[^）)]{0,12}[)）]/u,
  /^[*＊](?:轻笑|笑了笑|笑|苦笑|叹气|叹了口气|沉默|停顿|顿了顿|停了停|想了想|看了看|看向|看着|低头|抬头|耸肩|皱眉|挑眉|扶额|点头|摇头|拍拍|抱抱|凑近|后退|清了清嗓|咳了一声|压低声音|轻声|无奈|认真)[^*＊\n]{0,12}[*＊]/u,
];

const STOPWORDS = new Set([
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
]);

export function normalizeMomentText(value: string) {
  return sanitizeAiText(value)
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`]/g, '')
    .trim();
}

export function extractAnchorTokens(
  context: MomentGenerationContext | undefined,
  profile: PersonalityProfile,
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
      if (part.length < 2 || part.length > 18 || STOPWORDS.has(part)) {
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

function resolveLengthRange(sceneKey: SceneKey) {
  switch (sceneKey) {
    case 'moments_post':
      return { min: 5, max: 160 };
    case 'feed_post':
      return { min: 8, max: 220 };
    case 'channel_post':
      return { min: 16, max: 320 };
    default:
      return { min: 4, max: 180 };
  }
}

function validateSceneSpecificRules(input: {
  normalizedText: string;
  sceneKey: SceneKey;
  reasons: string[];
}) {
  const { normalizedText, sceneKey, reasons } = input;

  if (
    STAGE_DIRECTION_PATTERNS.some((pattern) => pattern.test(normalizedText))
  ) {
    reasons.push('含有舞台动作描写');
  }

  if (
    (sceneKey === 'feed_post' || sceneKey === 'channel_post') &&
    STRUCTURE_PATTERNS.some((pattern) => pattern.test(normalizedText))
  ) {
    reasons.push('内容像提纲或总结稿');
  }

  if (
    (sceneKey === 'moments_post' || sceneKey === 'feed_post') &&
    GENERIC_PATTERNS.some((pattern) => pattern.test(normalizedText))
  ) {
    reasons.push('内容偏模板化');
  }
}

export function validateGeneratedSceneOutput(input: {
  text: string;
  context?: MomentGenerationContext;
  profile: PersonalityProfile;
  sceneKey?: SceneKey;
}): MomentOutputValidationResult {
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

  const lengthRange = resolveLengthRange(sceneKey);
  if (normalizedText.length < lengthRange.min) {
    reasons.push('内容过短');
  }
  if (normalizedText.length > lengthRange.max) {
    reasons.push('内容过长');
  }
  if (META_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    reasons.push('带有解释或 AI 口吻');
  }

  validateSceneSpecificRules({
    normalizedText,
    sceneKey,
    reasons,
  });

  if (sceneKey === 'moments_post') {
    const anchorTokens = extractAnchorTokens(input.context, input.profile);
    const hasAnchorHit = anchorTokens.some((token) =>
      normalizedText.includes(token),
    );
    const hasGenericPattern = GENERIC_PATTERNS.some((pattern) =>
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
