// i18n-ignore-start: 测试，不出现在 UI。
import type { MomentGenerationContext, PersonalityProfile } from './ai.types';
import { combineWithJudge, scoreHeuristic } from './moment-quality-scorer';
import {
  buildDiversityPromptSection,
  extractOpening,
  maxSimilarityToRecent,
  trigramSimilarity,
} from '../moments/moment-diversity';
import { planMomentAngle } from '../moments/moment-editorial-planner';
import { parseMomentJudgeResponse, buildMomentJudgePrompt } from './moment-judge';

function makeProfile(overrides: Partial<PersonalityProfile> = {}): PersonalityProfile {
  return {
    characterId: 'char-test',
    name: '测试角色',
    relationship: '朋友',
    expertDomains: ['咖啡', '城市漫步'],
    traits: {
      speechPatterns: [],
      catchphrases: [],
      topicsOfInterest: [],
      emotionalTone: 'grounded',
      responseLength: 'short',
      emojiUsage: 'none',
    },
    memorySummary: '',
    ...overrides,
  };
}

const ctxWithAnchor: MomentGenerationContext = {
  worldContext: { dateTimeText: '', timeText: '', weather: '下雨', location: '静安' },
  relationshipContext: {
    hasRecentConversation: true,
    recentTopics: ['第一杯咖啡', '加班'],
    avoidDirectQuote: true,
  },
};

describe('moment-quality-scorer · scoreHeuristic', () => {
  it('具体且命中锚点的候选 > 空泛模板候选', () => {
    const profile = makeProfile();
    const concrete = scoreHeuristic({
      text: '下雨的静安路上，第一杯咖啡还有点烫手',
      profile,
      context: ctxWithAnchor,
      recentTexts: [],
    });
    const generic = scoreHeuristic({
      text: '新的一天，继续加油',
      profile,
      context: ctxWithAnchor,
      recentTexts: [],
    });
    expect(concrete.total).toBeGreaterThan(generic.total);
    expect(generic.components.noTemplate).toBe(0);
    expect(generic.reasons).toEqual(expect.arrayContaining(['模板化措辞']));
  });

  it('近重复候选被 hardRejected 且 total ≤ 0.1', () => {
    const profile = makeProfile();
    const recent = ['下雨的静安路上，第一杯咖啡还有点烫手'];
    const dupe = scoreHeuristic({
      text: '下雨的静安路上，第一杯咖啡还有点烫手呢',
      profile,
      context: ctxWithAnchor,
      recentTexts: recent,
    });
    expect(dupe.hardRejected).toBe(true);
    expect(dupe.total).toBeLessThanOrEqual(0.1);
  });

  it('AI 口吻 / 舞台动作描写 / 提纲腔显著降 naturalness', () => {
    const profile = makeProfile();
    const meta = scoreHeuristic({
      text: '作为AI，今天的静安天气下雨了，我建议你带伞。',
      profile,
      context: ctxWithAnchor,
      recentTexts: [],
    });
    expect(meta.components.naturalness).toBeLessThan(0.6);
    expect(meta.reasons).toEqual(expect.arrayContaining(['AI 口吻/解释腔']));

    const structure = scoreHeuristic({
      text: '首先，下雨天要注意保暖。其次，多喝热水。最后，早点睡。',
      profile,
      context: ctxWithAnchor,
      recentTexts: [],
    });
    expect(structure.components.naturalness).toBeLessThan(1);
  });

  it('combineWithJudge 融合：judge 拉低自然度 → 总分被拉低', () => {
    const profile = makeProfile();
    const heuristic = scoreHeuristic({
      text: '下雨的静安路上，第一杯咖啡还有点烫手',
      profile,
      context: ctxWithAnchor,
      recentTexts: [],
    });
    const combined = combineWithJudge(heuristic, {
      specificity: heuristic.components.specificity,
      voiceFit: 0.2,
      naturalness: 0.1,
      noTemplate: 0.3,
      novelty: 1,
    });
    expect(combined.source).toBe('combined');
    expect(combined.total).toBeLessThan(heuristic.total);
    // 新颖度仍以 heuristic 本地 trigram 为准
    expect(combined.components.novelty).toBe(heuristic.components.novelty);
  });
});

describe('moment-diversity', () => {
  it('trigramSimilarity 同文=1，无交集≈0', () => {
    expect(trigramSimilarity('下雨天加班', '下雨天加班')).toBe(1);
    expect(trigramSimilarity('abcdef', 'zyxwvu')).toBe(0);
  });

  it('extractOpening 取首分句或前 12 字', () => {
    expect(extractOpening('今天下雨了，路上没人')).toBe('今天下雨了');
    expect(extractOpening('一句很长的话没有标点也得截断到十二个字之内')).toBe('一句很长的话没有标点也得');
  });

  it('maxSimilarityToRecent 命中近重复阈值', () => {
    const sim = maxSimilarityToRecent('下雨的静安路上喝咖啡', [
      '随便',
      '下雨的静安路上喝着咖啡',
    ]);
    expect(sim).toBeGreaterThan(0.5);
  });

  it('buildDiversityPromptSection 返回避让指引 / 空输入返回空串', () => {
    expect(
      buildDiversityPromptSection({ ownOpenings: [], ownTopics: [], globalOpenings: [] }),
    ).toBe('');
    const section = buildDiversityPromptSection({
      ownOpenings: ['今天下雨'],
      ownTopics: ['加班'],
      globalOpenings: ['周五晚上'],
    });
    expect(section).toMatch(/避免重复/);
    expect(section).toMatch(/今天下雨/);
    expect(section).toMatch(/加班/);
  });
});

describe('moment-editorial-planner', () => {
  it('同一角色同一天 → 同一 angleKey（确定性）', () => {
    const a = planMomentAngle({ characterId: 'A', now: new Date('2026-05-28T10:00:00Z') });
    const b = planMomentAngle({ characterId: 'A', now: new Date('2026-05-28T22:30:00Z') });
    expect(a.angleKey).toBe(b.angleKey);
  });

  it('不同角色同一天 → 通常不同 angle（错开撞题）', () => {
    const now = new Date('2026-05-28T10:00:00Z');
    const a = planMomentAngle({ characterId: 'alpha', now });
    const b = planMomentAngle({ characterId: 'beta-different', now });
    expect(a.angleKey).not.toBe(b.angleKey);
  });

  it('avoidTopics 拼入 promptSection', () => {
    const result = planMomentAngle({
      characterId: 'A',
      now: new Date('2026-05-28T10:00:00Z'),
      recentOwnTopics: ['咖啡'],
      globalRecentTopics: ['下雨'],
    });
    expect(result.promptSection).toMatch(/咖啡|下雨/);
    expect(result.promptSection).toMatch(/今天写哪类/);
  });
});

describe('moment-judge prompt/parse', () => {
  it('buildMomentJudgePrompt 列出候选并要求 JSON', () => {
    const { system, user } = buildMomentJudgePrompt({
      candidates: ['候选一', '候选二'],
      personaSummary: '测试角色；关系：朋友',
    });
    expect(system).toMatch(/JSON/);
    expect(user).toMatch(/\[0\] 候选一/);
    expect(user).toMatch(/\[1\] 候选二/);
  });

  it('parseMomentJudgeResponse 容忍 {scores:[]} / 裸数组 / 缺失项', () => {
    const wrapped = parseMomentJudgeResponse(
      '{"scores":[{"i":0,"specificity":0.8,"voiceFit":0.7,"naturalness":0.9,"noTemplate":1.0},{"i":1,"specificity":0.2,"voiceFit":0.3,"naturalness":0.4,"noTemplate":0.0}]}',
      2,
    );
    expect(wrapped[0]?.specificity).toBe(0.8);
    expect(wrapped[1]?.noTemplate).toBe(0);

    const bare = parseMomentJudgeResponse(
      '[{"specificity":0.5,"voiceFit":0.5,"naturalness":0.5,"noTemplate":0.5}]',
      1,
    );
    expect(bare[0]?.specificity).toBe(0.5);

    const bad = parseMomentJudgeResponse('not json', 2);
    expect(bad).toEqual([null, null]);
  });
});
// i18n-ignore-end
