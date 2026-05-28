// i18n-ignore-start: 内部生成质量逻辑，非用户可见 UI 文案。
// LLM 评委的「prompt 构造 + 响应解析」纯函数。实际调用走 orchestrator 的私有
// requestChatTaskWithFallback（复用兜底/配额/ledger），评委用便宜的默认实例模型
// （不指定 characterId）。一次批量给全部候选打分，失败 → 返回 null → 回落启发式。
import { extractJsonFromModelOutput } from './ai-text-sanitizer';
import type { QualityScoreComponents } from './moment-quality-scorer';

export interface JudgePrompt {
  system: string;
  user: string;
}

/** 构造评委 prompt：对一批朋友圈候选按 4 个维度打分（0..1）。 */
export function buildMomentJudgePrompt(input: {
  candidates: readonly string[];
  personaSummary: string;
}): JudgePrompt {
  const system = [
    '你是一个中文社交动态（朋友圈）质量评审。只评估文本质量，不改写、不解释。',
    '对每条候选按以下 4 个维度各打 0 到 1 的分（保留两位小数）：',
    '- specificity 具体度：有没有具体的细节/名词/数字/场景，而不是空泛抒情。',
    '- voiceFit 人设契合：是否像这个角色本人随手发的，而非通用 AI 腔。',
    '- naturalness 自然度：像真人此刻发的一句话，没有解释腔、提纲、舞台动作描写。',
    '- noTemplate 去模板：避开「记录一下/新的一天/继续加油/首先其次」等套话与结构化套路。',
    '严格只输出 JSON，形如 {"scores":[{"i":0,"specificity":0.0,"voiceFit":0.0,"naturalness":0.0,"noTemplate":0.0}]}，不要任何额外文字。',
  ].join('\n');

  const persona = input.personaSummary?.trim()
    ? `角色：${input.personaSummary.trim()}`
    : '角色：（未提供，按通用真人社交动态评估）';
  const list = input.candidates
    .map((text, i) => `[${i}] ${(text ?? '').replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  const user = `${persona}\n\n候选（共 ${input.candidates.length} 条）：\n${list}`;
  return { system, user };
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * 解析评委响应为「与候选等长」的分量数组；无法对应的项为 null（调用方回落启发式）。
 * 容忍 {scores:[...]} 或裸数组两种形态，乱序则按 i 字段归位。
 */
export function parseMomentJudgeResponse(
  raw: string,
  expectedCount: number,
): Array<QualityScoreComponents | null> {
  const out: Array<QualityScoreComponents | null> = new Array(expectedCount).fill(
    null,
  );
  // 评委理想输出是干净 JSON；真实模型常包一层 prose / code fence。
  // 先尝试直接 parse（保住裸数组形态），失败再走 extractJsonFromModelOutput
  // （注意它只抓 {...}，会丢失数组外壳，所以不能作为唯一路径）。
  let parsed: unknown;
  const directInput = (raw ?? '').trim();
  try {
    parsed = JSON.parse(directInput);
  } catch {
    try {
      parsed = JSON.parse(extractJsonFromModelOutput(raw));
    } catch {
      return out;
    }
  }
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { scores?: unknown })?.scores)
      ? ((parsed as { scores: unknown[] }).scores ?? [])
      : [];
  arr.forEach((item, fallbackIndex) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const idxRaw = row.i ?? row.index;
    const idx =
      typeof idxRaw === 'number' && Number.isInteger(idxRaw)
        ? idxRaw
        : fallbackIndex;
    if (idx < 0 || idx >= expectedCount) return;
    out[idx] = {
      specificity: clamp01(row.specificity),
      voiceFit: clamp01(row.voiceFit),
      naturalness: clamp01(row.naturalness),
      noTemplate: clamp01(row.noTemplate),
      // 新颖度不由评委给，占位 1（最终以 heuristic 的本地 trigram 为准）。
      novelty: 1,
    };
  });
  return out;
}
// i18n-ignore-end
