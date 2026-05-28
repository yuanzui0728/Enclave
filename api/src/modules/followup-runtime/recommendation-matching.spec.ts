import { DEFAULT_FOLLOWUP_RUNTIME_RULES } from './followup-runtime.types';
import {
  computeDomainRelevance,
  computeKeywordRelevance,
  computeRelevance,
  computeTopicsRelevance,
  domainTermSimilarity,
  scoreCandidate,
  selectBestRecommendation,
  type RecommendationCandidateInput,
  type RecommendationLoopInput,
  type RecommendationScoringWeights,
} from './recommendation-matching';

// 直接复用线上默认权重，保证测试钉死的是真实默认行为（改默认若破矩阵即 CI 失败）。
const WEIGHTS: RecommendationScoringWeights =
  DEFAULT_FOLLOWUP_RUNTIME_RULES.candidateWeights;

let idCounter = 0;
function makeCandidate(
  overrides: Partial<RecommendationCandidateInput> = {},
): RecommendationCandidateInput {
  idCounter += 1;
  return {
    id: overrides.id ?? `c-${idCounter}`,
    name: overrides.name ?? `角色${idCounter}`,
    expertDomains: [],
    relationshipType: null,
    topicsOfInterest: [],
    bio: null,
    personality: null,
    relationshipState: 'not_friend',
    isSameSource: false,
    isRecentlyRecommended: false,
    ...overrides,
  };
}

function makeLoop(
  overrides: Partial<RecommendationLoopInput> = {},
): RecommendationLoopInput {
  return {
    domainHints: [],
    targetRelationshipType: null,
    summary: '',
    urgencyScore: 0.7,
    closureScore: 0.3,
    handoffNeedScore: 0.7,
    ...overrides,
  };
}

describe('recommendation-matching — fuzzy domain relevance', () => {
  it('matches near-miss tags via bidirectional substring containment', () => {
    expect(computeDomainRelevance(['睡眠'], ['睡眠医学'])).toBeGreaterThan(0.5);
    expect(computeDomainRelevance(['情绪'], ['情绪支持'])).toBeGreaterThan(0.5);
    expect(computeDomainRelevance(['焦虑'], ['焦虑症'])).toBeGreaterThan(0.5);
  });

  it('matches multi-word english tags', () => {
    expect(computeDomainRelevance(['sleep'], ['sleep medicine'])).toBeGreaterThan(
      0.5,
    );
  });

  it('returns 0 for unrelated tags (no spurious noise match)', () => {
    expect(computeDomainRelevance(['睡眠'], ['股票'])).toBe(0);
    expect(computeDomainRelevance(['睡眠'], ['财务投资'])).toBe(0);
  });

  it('matches sibling tags sharing a meaningful bigram (情绪支持 ↔ 情绪疏导)', () => {
    // 两边都不是另一方的子串、各自只有一个 token，但共享 bigram「情绪」——靠 bigram-Dice
    // 兜底击穿 RELEVANCE_FLOOR；典型的「新角色用近义标签」需要被推荐的场景。
    const rel = computeDomainRelevance(['情绪支持'], ['情绪疏导']);
    expect(rel).toBeGreaterThan(0.15);
    expect(rel).toBeLessThan(0.5); // 弱于整串包含/精确匹配，不喧宾夺主
  });

  it('bigram noise does not fabricate spurious matches', () => {
    // 完全无关的 CJK 短串，bigram 无交集 → 应为 0
    expect(computeDomainRelevance(['学生'], ['学校'])).toBe(0);
    expect(computeDomainRelevance(['健康'], ['健身'])).toBe(0);
  });

  it('exact match scores higher than partial match', () => {
    expect(domainTermSimilarity('睡眠', '睡眠')).toBe(1);
    const partial = domainTermSimilarity('睡眠', '睡眠医学');
    expect(partial).toBeGreaterThan(0.5);
    expect(partial).toBeLessThan(1);
  });

  it('averages per-loop-term best match (1 of 2 hints ≈ 0.5)', () => {
    const rel = computeDomainRelevance(['睡眠', '股票'], ['睡眠医学']);
    expect(rel).toBeGreaterThan(0.35);
    expect(rel).toBeLessThan(0.5);
  });
});

describe('recommendation-matching — secondary signals', () => {
  it('computeTopicsRelevance matches topicsOfInterest fuzzily', () => {
    expect(computeTopicsRelevance(['睡眠'], ['睡眠管理', '跑步'])).toBeGreaterThan(
      0.5,
    );
    expect(computeTopicsRelevance(['睡眠'], ['理财', '跑步'])).toBe(0);
  });

  it('computeKeywordRelevance picks up summary keywords in character text', () => {
    expect(
      computeKeywordRelevance('用户还在纠结要不要换工作', '我是职业顾问，帮人换工作'),
    ).toBeGreaterThan(0);
    expect(computeKeywordRelevance('换工作', '我教做菜')).toBe(0);
  });

  it('keyword signal alone cannot clear the relevance gate', () => {
    const loop = makeLoop({
      domainHints: ['职业规划'],
      summary: '用户还在纠结要不要换工作',
    });
    const candidate = makeCandidate({
      expertDomains: ['园艺'], // 与 domainHints 无关
      topicsOfInterest: [],
      bio: '帮人换工作', // 命中 summary 关键词
    });
    const scored = scoreCandidate(loop, candidate, WEIGHTS);
    expect(scored.relevance).toBeGreaterThan(0); // 关键词确有贡献
    expect(scored.relevance).toBeLessThan(WEIGHTS.minRelevanceToRecommend);
    expect(scored.eligible).toBe(false); // 但不足以过门槛
  });

  it('combined relevance keeps domain primary, topics/keyword as capped boosts', () => {
    const loop = makeLoop({ domainHints: ['睡眠'] });
    const onlyTopics = computeRelevance(
      loop,
      makeCandidate({ topicsOfInterest: ['睡眠'] }),
      WEIGHTS,
    );
    // topics 单独命中：0.35 加成，足以过门槛但低于领域直命中
    expect(onlyTopics).toBeGreaterThan(WEIGHTS.minRelevanceToRecommend);
    expect(onlyTopics).toBeLessThan(
      computeRelevance(loop, makeCandidate({ expertDomains: ['睡眠'] }), WEIGHTS),
    );
  });
});

describe('selectBestRecommendation — relevance gate over friend boost', () => {
  it('picks the relevant new non-friend over an irrelevant existing friend', () => {
    const loop = makeLoop({ domainHints: ['睡眠'] });
    const relevantNonFriend = makeCandidate({
      id: 'relevant',
      expertDomains: ['睡眠医学'],
      relationshipState: 'not_friend',
    });
    const irrelevantFriend = makeCandidate({
      id: 'friend',
      expertDomains: ['股票投资'],
      relationshipState: 'friend',
    });

    const best = selectBestRecommendation(
      loop,
      [irrelevantFriend, relevantNonFriend],
      WEIGHTS,
    );
    expect(best?.candidateId).toBe('relevant');

    // 无关老好友被门槛挡在外面：+existingFriendBoost 加在已淘汰候选上无从取胜。
    expect(scoreCandidate(loop, irrelevantFriend, WEIGHTS).eligible).toBe(false);
  });

  it('a relevant existing friend still legitimately wins (no regression)', () => {
    const loop = makeLoop({ domainHints: ['睡眠'] });
    const relevantFriend = makeCandidate({
      id: 'friend',
      expertDomains: ['睡眠医学'],
      relationshipState: 'friend',
    });
    const relevantStranger = makeCandidate({
      id: 'stranger',
      expertDomains: ['睡眠医学'],
      relationshipState: 'not_friend',
    });
    const best = selectBestRecommendation(
      loop,
      [relevantStranger, relevantFriend],
      WEIGHTS,
    );
    expect(best?.candidateId).toBe('friend'); // 同样相关时好友靠 boost 胜出
  });
});

describe('selectBestRecommendation — precision among ~300 characters', () => {
  const NOISE_DOMAINS = [
    '财务',
    '法律',
    '健身',
    '烹饪',
    '摄影',
    '旅行',
    '编程',
    '音乐',
    '园艺',
    '汽车',
  ];

  function buildNoise(count: number): RecommendationCandidateInput[] {
    return Array.from({ length: count }, (_unused, i) =>
      makeCandidate({
        id: `noise-${i}`,
        expertDomains: [NOISE_DOMAINS[i % NOISE_DOMAINS.length]],
        // 约半数是老好友，带 +0.45 boost —— 这正是旧逻辑会误选的陷阱
        relationshipState: i % 2 === 0 ? 'friend' : 'not_friend',
      }),
    );
  }

  it('selects the single relevant character buried among 300 irrelevant ones', () => {
    const loop = makeLoop({ domainHints: ['睡眠'] });
    const target = makeCandidate({
      id: 'target',
      expertDomains: ['睡眠医学'],
      relationshipState: 'not_friend',
    });
    const pool = [...buildNoise(300), target];

    const best = selectBestRecommendation(loop, pool, WEIGHTS);
    expect(best?.candidateId).toBe('target');
  });

  it('returns null when nothing is topically relevant (gate, not score>0)', () => {
    const loop = makeLoop({ domainHints: ['睡眠'], targetRelationshipType: null });
    const pool = buildNoise(300); // 全无关，含大量老好友
    expect(selectBestRecommendation(loop, pool, WEIGHTS)).toBeNull();
  });
});

describe('selectBestRecommendation — new character needs zero config', () => {
  it('surfaces a brand-new tag never seen before using default weights', () => {
    const loop = makeLoop({ domainHints: ['冲浪'] });
    const fresh = makeCandidate({
      id: 'fresh',
      expertDomains: ['冲浪运动'], // 全新标签，从未出现在任何目录里
      relationshipState: 'not_friend',
    });
    const best = selectBestRecommendation(loop, [fresh], WEIGHTS);
    expect(best?.candidateId).toBe('fresh');
  });
});

describe('relevance — generalist vs specialist', () => {
  it('does not penalize a generalist with many domains for breadth', () => {
    const loop = makeLoop({ domainHints: ['睡眠'] });
    const specialist = makeCandidate({ expertDomains: ['睡眠医学'] });
    const generalist = makeCandidate({
      expertDomains: ['睡眠', '心理', '营养', '运动', '育儿', '理财'],
    });
    const specialistRel = scoreCandidate(loop, specialist, WEIGHTS).relevance;
    const generalistRel = scoreCandidate(loop, generalist, WEIGHTS).relevance;
    // 含精确「睡眠」的通才不因领域多被稀释（旧 /max(size) 会把它压到 ~0.17）
    expect(generalistRel).toBeGreaterThanOrEqual(specialistRel);
  });

  it('a generalist with no matching tag stays below the gate', () => {
    const loop = makeLoop({ domainHints: ['睡眠'] });
    const offTopic = makeCandidate({
      expertDomains: ['心理', '营养', '运动', '育儿', '理财'],
    });
    expect(scoreCandidate(loop, offTopic, WEIGHTS).eligible).toBe(false);
  });
});

describe('scoreCandidate — penalties and relationship match preserved', () => {
  const loop = makeLoop({ domainHints: ['睡眠'] });
  const base = () => makeCandidate({ expertDomains: ['睡眠医学'] });

  it('applies the same-source penalty (-0.9)', () => {
    const plain = scoreCandidate(loop, base(), WEIGHTS);
    const sameSource = scoreCandidate(
      loop,
      makeCandidate({ expertDomains: ['睡眠医学'], isSameSource: true }),
      WEIGHTS,
    );
    expect(sameSource.score).toBeCloseTo(
      plain.score - WEIGHTS.sameSourcePenalty,
      6,
    );
  });

  it('applies the recently-recommended penalty (-0.35)', () => {
    const plain = scoreCandidate(loop, base(), WEIGHTS);
    const recent = scoreCandidate(
      loop,
      makeCandidate({ expertDomains: ['睡眠医学'], isRecentlyRecommended: true }),
      WEIGHTS,
    );
    expect(recent.score).toBeCloseTo(
      plain.score - WEIGHTS.recentRecommendationPenalty,
      6,
    );
  });

  it('applies the pending-request penalty (-0.2)', () => {
    const plain = scoreCandidate(loop, base(), WEIGHTS);
    const pending = scoreCandidate(
      loop,
      makeCandidate({
        expertDomains: ['睡眠医学'],
        relationshipState: 'pending',
      }),
      WEIGHTS,
    );
    expect(pending.score).toBeCloseTo(
      plain.score - WEIGHTS.pendingRequestPenalty,
      6,
    );
  });

  it('lets a relationship match make an off-topic candidate eligible (+bonus)', () => {
    const relLoop = makeLoop({
      domainHints: ['睡眠'],
      targetRelationshipType: 'expert',
    });
    const offTopicExpert = makeCandidate({
      expertDomains: ['股票'], // 与 domainHints 无关 → relevance 0
      relationshipType: 'expert', // 但关系定位匹配
    });
    const scored = scoreCandidate(relLoop, offTopicExpert, WEIGHTS);
    expect(scored.relevance).toBe(0);
    expect(scored.relationshipMatch).toBe(true);
    expect(scored.eligible).toBe(true); // gate 的 OR 分支
  });

  it('prefers a more relevant candidate over a relationship-only match', () => {
    const relLoop = makeLoop({
      domainHints: ['睡眠'],
      targetRelationshipType: 'expert',
    });
    const offTopicExpert = makeCandidate({
      id: 'rel-only',
      expertDomains: ['股票'],
      relationshipType: 'expert',
    });
    const onTopicStranger = makeCandidate({
      id: 'on-topic',
      expertDomains: ['睡眠医学'],
      relationshipType: 'friend',
    });
    const best = selectBestRecommendation(
      relLoop,
      [offTopicExpert, onTopicStranger],
      WEIGHTS,
    );
    expect(best?.candidateId).toBe('on-topic');
  });
});
