// i18n-ignore-start: 纯打分逻辑 / 内部数据，无用户可见文案。
//
// 「我」角色主动跟进好友推荐的候选打分核心。从 followup-runtime.service 抽出的纯函数模块
// （仿 social/scene-matching.ts）：无 DB、无 NestJS 依赖、确定性，可直接单测。
// 多租户隔离仍只在 service 的 DB 加载层（findAllVisibleToOwner(ownerId) + ownerId-scoped
// 查询）完成；本模块只处理 caller 已加载好的纯数据，不感知 tenant。

export type RecommendationRelationshipState = 'friend' | 'pending' | 'not_friend';

/** 打分所需的候选角色视图（service 把 CharacterEntity 映射成它，解耦实体）。 */
export interface RecommendationCandidateInput {
  id: string;
  name: string;
  expertDomains: string[];
  relationshipType: string | null;
  topicsOfInterest: string[];
  bio?: string | null;
  personality?: string | null;
  relationshipState: RecommendationRelationshipState;
  /** 候选是否就是话题来源角色（推荐它=原地踏步）。 */
  isSameSource: boolean;
  /** 冷却窗口内是否已推过该角色。 */
  isRecentlyRecommended: boolean;
}

/** 一个未闭环话题（open loop）打分所需的视图。 */
export interface RecommendationLoopInput {
  domainHints: string[];
  targetRelationshipType: string | null;
  summary: string;
  urgencyScore: number;
  closureScore: number;
  handoffNeedScore: number;
}

export interface RecommendationScoringWeights {
  existingFriendBoost: number;
  domainMatchWeight: number;
  relationshipMatchWeight: number;
  sameSourcePenalty: number;
  pendingRequestPenalty: number;
  recentRecommendationPenalty: number;
  /** 相关性门槛：低于它且关系不匹配的候选直接出局（修复「阈值>0 形同虚设」）。 */
  minRelevanceToRecommend: number;
  /** profile.traits.topicsOfInterest 次级相关性权重（封顶加成）。 */
  topicsOfInterestWeight: number;
  /** loop.summary 关键词次级相关性权重（最弱信号，单独不足以过门槛）。 */
  keywordRelevanceWeight: number;
}

export interface ScoredRecommendation {
  candidateId: string;
  relationshipState: RecommendationRelationshipState;
  /** [0,1] 分级话题相关性，门槛判定就用它。 */
  relevance: number;
  score: number;
  /** 是否通过相关性/关系门槛。 */
  eligible: boolean;
  relationshipMatch: boolean;
  matchReasons: string[];
}

const RELEVANCE_FLOOR = 0.2;
const DOMAIN_SPLIT_RE = /[\s/、,，·\-_|]+/;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function normalizeDomainKey(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueDomainKeys(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const key = normalizeDomainKey(raw ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function tokenize(value: string): string[] {
  return value
    .split(DOMAIN_SPLIT_RE)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 多 token 标签的词重合（缩放到 [0,0.6]，弱于整串包含）。 */
function tokenOverlapScore(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length <= 1 && tokensB.length <= 1) return 0;
  if (!tokensA.length || !tokensB.length) return 0;
  let matched = 0;
  for (const ta of tokensA) {
    const hit = tokensB.some(
      (tb) => tb === ta || tb.includes(ta) || ta.includes(tb),
    );
    if (hit) matched += 1;
  }
  return (matched / tokensA.length) * 0.6;
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>();
  if (value.length <= 1) {
    if (value.length === 1) out.add(value);
    return out;
  }
  for (let i = 0; i < value.length - 1; i += 1) {
    out.add(value.slice(i, i + 2));
  }
  return out;
}

/** 字符 bigram Dice 系数（缩放到 [0,0.5]，CJK 无分隔时兜底）。 */
function bigramDiceScore(a: string, b: string): number {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const gram of setA) {
    if (setB.has(gram)) inter += 1;
  }
  const dice = (2 * inter) / (setA.size + setB.size);
  return dice * 0.5;
}

/** 单个 loop 领域词 vs 单个角色领域词的模糊相似度 -> [0,1]。 */
export function domainTermSimilarity(loopTerm: string, charTerm: string): number {
  const a = normalizeDomainKey(loopTerm);
  const b = normalizeDomainKey(charTerm);
  if (!a || !b) return 0;
  if (a === b) return 1;

  let best = 0;
  // 双向子串包含：长串含短串则强相关，按长度比衰减。
  if (a.includes(b) || b.includes(a)) {
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    best = Math.max(best, 0.6 + 0.4 * (minLen / maxLen));
  }
  best = Math.max(best, tokenOverlapScore(a, b));
  best = Math.max(best, bigramDiceScore(a, b));

  return best < RELEVANCE_FLOOR ? 0 : best;
}

/**
 * loop 领域 vs 角色领域的分级相关性 -> [0,1]。
 * 每个 loop 词取在所有角色词上的最大相似度，再取这些最大值的平均：
 * 匹配 1/2 → ~0.5，全中 → ~1.0。不用 /max(size) 分母，故不惩罚领域多的通才。
 */
export function computeDomainRelevance(
  loopDomains: string[],
  charDomains: string[],
): number {
  const loopKeys = uniqueDomainKeys(loopDomains);
  const charKeys = uniqueDomainKeys(charDomains);
  if (!loopKeys.length || !charKeys.length) return 0;

  let sum = 0;
  for (const loopKey of loopKeys) {
    let bestForTerm = 0;
    for (const charKey of charKeys) {
      const sim = domainTermSimilarity(loopKey, charKey);
      if (sim > bestForTerm) bestForTerm = sim;
      if (bestForTerm >= 1) break;
    }
    sum += bestForTerm;
  }
  return clamp01(sum / loopKeys.length);
}

/** 同法对 profile.traits.topicsOfInterest 求相关性。 */
export function computeTopicsRelevance(
  loopDomains: string[],
  topicsOfInterest: string[],
): number {
  return computeDomainRelevance(loopDomains, topicsOfInterest);
}

function summaryTokens(summary: string): string[] {
  const text = (summary ?? '').toLowerCase();
  if (!text.trim()) return [];
  const tokens = new Set<string>();
  // ascii 词（>=2 字符）
  const asciiMatches = text.match(/[a-z0-9]{2,}/g) ?? [];
  for (const word of asciiMatches) tokens.add(word);
  // CJK 字符 bigram
  const cjk = text.match(/[一-鿿]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) {
      tokens.add(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      tokens.add(run.slice(i, i + 2));
    }
  }
  return Array.from(tokens);
}

/**
 * loop.summary 关键词在角色文本（bio/personality/domains/topics）中的命中比例 -> [0,1]。
 * 最弱、最噪的信号：只作微弱加成，权重默认低于门槛，单独不足以让候选 eligible。
 */
export function computeKeywordRelevance(
  loopSummary: string,
  charText: string,
): number {
  const tokens = summaryTokens(loopSummary);
  if (!tokens.length) return 0;
  const haystack = (charText ?? '').toLowerCase();
  if (!haystack.trim()) return 0;
  let hit = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hit += 1;
  }
  return clamp01(hit / tokens.length);
}

function candidateHaystack(candidate: RecommendationCandidateInput): string {
  return [
    candidate.bio ?? '',
    candidate.personality ?? '',
    candidate.expertDomains.join(' '),
    candidate.topicsOfInterest.join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

/** 综合相关性：领域为主，topics / 关键词为封顶次级加成。 */
export function computeRelevance(
  loop: RecommendationLoopInput,
  candidate: RecommendationCandidateInput,
  weights: RecommendationScoringWeights,
): number {
  const domain = computeDomainRelevance(loop.domainHints, candidate.expertDomains);
  const topics = computeTopicsRelevance(
    loop.domainHints,
    candidate.topicsOfInterest,
  );
  const keyword = computeKeywordRelevance(
    loop.summary,
    candidateHaystack(candidate),
  );
  return clamp01(
    domain +
      topics * weights.topicsOfInterestWeight +
      keyword * weights.keywordRelevanceWeight,
  );
}

function isRelationshipMatch(
  loop: RecommendationLoopInput,
  candidate: RecommendationCandidateInput,
): boolean {
  const target = normalizeText(loop.targetRelationshipType);
  if (!target) return false;
  const candType = normalizeText(candidate.relationshipType);
  return candType !== null && candType.toLowerCase() === target.toLowerCase();
}

/** 给单个候选打分（保留原公式，overlap → relevance）。 */
export function scoreCandidate(
  loop: RecommendationLoopInput,
  candidate: RecommendationCandidateInput,
  weights: RecommendationScoringWeights,
): ScoredRecommendation {
  const relevance = computeRelevance(loop, candidate, weights);
  const relationshipMatch = isRelationshipMatch(loop, candidate);
  const matchReasons: string[] = [];

  let score =
    0.22 +
    loop.handoffNeedScore * 0.3 +
    loop.urgencyScore * 0.18 +
    (1 - loop.closureScore) * 0.14 +
    relevance * weights.domainMatchWeight;

  if (candidate.relationshipState === 'friend') {
    score += weights.existingFriendBoost;
    matchReasons.push('已有好友，能直接细聊');
  }
  if (relationshipMatch) {
    score += weights.relationshipMatchWeight;
    matchReasons.push('关系定位匹配');
  }
  if (relevance > 0) {
    matchReasons.push(`话题相关度 ${Math.round(relevance * 100)}%`);
  }
  if (candidate.isSameSource) {
    score -= weights.sameSourcePenalty;
  }
  if (candidate.relationshipState === 'pending') {
    score -= weights.pendingRequestPenalty;
  }
  if (candidate.isRecentlyRecommended) {
    score -= weights.recentRecommendationPenalty;
  }

  const eligible =
    relevance >= weights.minRelevanceToRecommend || relationshipMatch;

  return {
    candidateId: candidate.id,
    relationshipState: candidate.relationshipState,
    relevance,
    score,
    eligible,
    relationshipMatch,
    matchReasons,
  };
}

function relationshipPriority(state: RecommendationRelationshipState): number {
  switch (state) {
    case 'friend':
      return 3;
    case 'not_friend':
      return 2;
    case 'pending':
      return 1;
    default:
      return 0;
  }
}

/**
 * 相关性门槛 + 确定性选优。
 * 1) 全打分；2) 只留 eligible（相关性达标 或 关系定位匹配）——无关老好友的 +boost
 *    加在已淘汰候选上无从取胜；3) 无 eligible → null；4) 按 score 降序，tie-break：
 *    relevance → 关系优先级 → 稳定 candidateId（确定性，推荐要落库去重，不引随机）；
 *    5) 末位保留 score>0 兜底。
 */
export function selectBestRecommendation(
  loop: RecommendationLoopInput,
  candidates: RecommendationCandidateInput[],
  weights: RecommendationScoringWeights,
): ScoredRecommendation | null {
  const eligible = candidates
    .map((candidate) => scoreCandidate(loop, candidate, weights))
    .filter((scored) => scored.eligible);

  if (!eligible.length) return null;

  eligible.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.relevance !== left.relevance) return right.relevance - left.relevance;
    const prio =
      relationshipPriority(right.relationshipState) -
      relationshipPriority(left.relationshipState);
    if (prio !== 0) return prio;
    return left.candidateId < right.candidateId ? -1 : 1;
  });

  const best = eligible[0];
  if (!best || best.score <= 0) return null;
  return best;
}
// i18n-ignore-end
