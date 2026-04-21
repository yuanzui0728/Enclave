import * as fs from 'fs';
import * as path from 'path';

import { validateGeneratedMomentOutput } from '../ai/moment-output-validator';
import { buildBarExpertCharacter } from './bar-expert-character';
import { BAR_EXPERT_MOMENT_BASELINES } from './bar-expert-moment-baselines';

type EvalDatasetManifestFixture = {
  id: string;
  caseIds: string[];
};

function readFixture<T>(relativePath: string): T {
  const filePath = path.resolve(__dirname, '../../../../', relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

describe('bar expert moment baselines', () => {
  it('keeps baseline sample ids and case ids unique', () => {
    expect(new Set(BAR_EXPERT_MOMENT_BASELINES.map((item) => item.id)).size).toBe(
      BAR_EXPERT_MOMENT_BASELINES.length,
    );
    expect(
      new Set(BAR_EXPERT_MOMENT_BASELINES.map((item) => item.caseId)).size,
    ).toBe(BAR_EXPERT_MOMENT_BASELINES.length);
  });

  it('covers every moment eval case with one baseline sample', () => {
    const manifest = readFixture<EvalDatasetManifestFixture>(
      'datasets/evals/manifests/bar-expert-moments.json',
    );

    expect(manifest.id).toBe('bar-expert-moments');
    expect(
      BAR_EXPERT_MOMENT_BASELINES.map((item) => item.caseId).sort(),
    ).toEqual([...manifest.caseIds].sort());
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

  it('keeps the role stance across low-abv, service, budget, and pace moments', () => {
    const lowAbvBaseline = BAR_EXPERT_MOMENT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-low-abv-moment-not-second-best',
    );
    const firstDrinkBaseline = BAR_EXPERT_MOMENT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-late-rush-first-drink',
    );
    const serviceBaseline = BAR_EXPERT_MOMENT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-bar-service-catch-people',
    );
    const budgetBaseline = BAR_EXPERT_MOMENT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-budget-moment-not-awkward',
    );
    const secondRoundBaseline = BAR_EXPERT_MOMENT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-second-round-pace-moment',
    );

    expect(lowAbvBaseline?.text).toMatch(/低度|轻一点|空间/u);
    expect(lowAbvBaseline?.text).not.toMatch(/不能喝才点|凑合|退而求其次/u);

    expect(firstDrinkBaseline?.text).toMatch(/第一杯|后半夜|推太快/u);
    expect(firstDrinkBaseline?.text).not.toMatch(/教程|配方|第.?一步/u);

    expect(serviceBaseline?.text).toMatch(/随便|先把人接住/u);
    expect(serviceBaseline?.text).toContain('不是立刻教育他');
    expect(serviceBaseline?.text).not.toMatch(/不懂别来|外行活该|先教育再说/u);

    expect(budgetBaseline?.text).toMatch(/预算|价格|舒服/u);
    expect(budgetBaseline?.text).toContain('不是把人往最贵那页推');
    expect(budgetBaseline?.text).not.toMatch(/便宜就是将就|消费升级|预算不够别来/u);

    expect(secondRoundBaseline?.text).toMatch(/第二杯|节奏|加码题/u);
    expect(secondRoundBaseline?.text).not.toMatch(/一定更重|越喝越猛|再上强度/u);
  });
});
