// i18n-ignore-start: 内部生成质量逻辑，非用户可见 UI 文案。
// 全局共享池朋友圈「跨帖去重 / 多样性」工具。纯函数，无 DB / DI 依赖：
//   - 给生成 prompt 注入「避开这些开头/选题」段（预防撞题撞开头）
//   - 给质量打分器提供 trigram 相似度（事后对近重复候选硬扣分）
// 全局帧里所有真实用户看同一份广场，重复/同质内容尤其刺眼，故跨角色一起去重。

/** 取一条朋友圈的「开头」——首个分句或前 12 字，用来识别「又是这个开头」。 */
export function extractOpening(text: string): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const firstClause = normalized.split(/[，,。.！!？?；;~～\n]/u)[0]?.trim() ?? '';
  const candidate = firstClause || normalized;
  return candidate.length > 12 ? candidate.slice(0, 12) : candidate;
}

/** 归一化：去空白、去常见标点、英文转小写。trigram 之前统一形态。 */
function normalizeForTrigram(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[\s，,。.！!？?；;：:、~～·…\-—()（）"'“”]/gu, '');
}

/** 字符级 3-gram 集合（中英文通用）。 */
export function toTrigrams(text: string): Set<string> {
  const normalized = normalizeForTrigram(text);
  const grams = new Set<string>();
  if (normalized.length < 3) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let i = 0; i + 3 <= normalized.length; i += 1) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

/** 两段文本 trigram Jaccard 相似度 0..1。 */
export function trigramSimilarity(a: string, b: string): number {
  const ga = toTrigrams(a);
  const gb = toTrigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let intersect = 0;
  for (const g of ga) {
    if (gb.has(g)) intersect += 1;
  }
  const union = ga.size + gb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** 候选文本对一批近期文本的最大相似度（用于近重复硬扣分）。 */
export function maxSimilarityToRecent(
  candidate: string,
  recentTexts: readonly string[],
): number {
  let max = 0;
  for (const recent of recentTexts) {
    const sim = trigramSimilarity(candidate, recent);
    if (sim > max) max = sim;
    if (max >= 1) break;
  }
  return max;
}

export interface DiversitySignals {
  /** 本角色近期已发的开头短语（避免自我重复）。 */
  ownOpenings: string[];
  /** 本角色近期选题词（延续或换题用）。 */
  ownTopics: string[];
  /** 全局池其它角色近期开头（避免全广场撞开头）。 */
  globalOpenings: string[];
}

/**
 * 拼一段注入 system prompt 的「多样性避让」指引。返回空串时调用方不注入。
 * 只放「避开什么」，不规定「写什么」——选题方向交给 editorial planner。
 */
export function buildDiversityPromptSection(signals: DiversitySignals): string {
  const ownOpenings = dedupeShort(signals.ownOpenings, 6);
  const globalOpenings = dedupeShort(signals.globalOpenings, 6);
  const lines: string[] = [];
  if (ownOpenings.length || globalOpenings.length) {
    const avoid = dedupeShort([...ownOpenings, ...globalOpenings], 8);
    lines.push(
      `【避免重复】最近这些开头/句式已经出现过，换一个完全不同的开头，别用类似措辞：${avoid
        .map((o) => `「${o}…」`)
        .join('、')}`,
    );
  }
  if (signals.ownTopics.length) {
    lines.push(
      `【你最近聊过】${dedupeShort(signals.ownTopics, 6).join('、')}。可以换个新角度或新话题，别原样复述。`,
    );
  }
  return lines.join('\n');
}

function dedupeShort(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = (raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
// i18n-ignore-end
