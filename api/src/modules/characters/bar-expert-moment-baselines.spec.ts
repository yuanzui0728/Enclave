import { validateGeneratedMomentOutput } from '../ai/moment-output-validator';
import { buildBarExpertCharacter } from './bar-expert-character';
import { BAR_EXPERT_MOMENT_BASELINES } from './bar-expert-moment-baselines';

describe('bar expert moment baselines', () => {
  it('keeps baseline sample ids unique', () => {
    expect(
      new Set(BAR_EXPERT_MOMENT_BASELINES.map((item) => item.id)).size,
    ).toBe(BAR_EXPERT_MOMENT_BASELINES.length);
  });

  it('ships moment samples that pass the moment validator', () => {
    const character = buildBarExpertCharacter();
    const profile = character.profile;

    expect(profile).toBeDefined();

    for (const baseline of BAR_EXPERT_MOMENT_BASELINES) {
      const result = validateGeneratedMomentOutput({
        text: baseline.text,
        profile: profile!,
        sceneKey: 'moments_post',
        context: {
          worldContext: {
            dateTimeText: '2026年4月20日 周一 21:25',
            timeText: '晚上',
            weather: '下雨',
            location: '静安',
            localTime: '周一晚上九点二十五',
          },
          relationshipContext: {
            hasRecentConversation: true,
            recentTopics: ['第一杯', '低度'],
            recentUserIntentSummary: '最近和用户聊过：第一杯；低度',
            avoidDirectQuote: true,
          },
          generationHints: {
            anchorPriority: ['weather', 'recent_chat', 'life'],
            mustAvoidGeneric: true,
            preferObservationOverAnnouncement: true,
          },
        },
      });

      expect(result.valid).toBe(true);
      expect(result.reasons).toEqual([]);
    }
  });

  it('keeps the samples away from promo and lecture tone', () => {
    for (const baseline of BAR_EXPERT_MOMENT_BASELINES) {
      expect(baseline.text).not.toMatch(/欢迎来喝|营业中|特调上新/u);
      expect(baseline.text).not.toMatch(/首先|其次|最后|总之/u);
      expect(baseline.text).not.toMatch(/酒吧营销号|品牌合作|点击下单/u);
    }
  });
});
