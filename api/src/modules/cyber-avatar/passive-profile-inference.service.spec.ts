// i18n-ignore-start: test fixtures — not user-facing UI.
import { PassiveProfileInferenceService } from './passive-profile-inference.service';

describe('PassiveProfileInferenceService (Phase 4 被动推断)', () => {
  function makeService() {
    const filledCalls: any[] = [];
    const worldOwner = {
      fillInferredProfileFields: jest.fn(async (inferred: any) => {
        filledCalls.push(inferred);
        // 模拟：返回所有非空字段为「已填」
        const filled = Object.entries(inferred)
          .filter(([, v]) => typeof v === 'string' && v)
          .map(([k]) => k);
        return { filled };
      }),
    } as any;
    const svc = new PassiveProfileInferenceService(worldOwner);
    return { svc, worldOwner, filledCalls };
  }

  const richProfile = {
    signalCount: 40,
    confidence: { stableCore: 0.7 },
    stableCore: {
      identitySummary: '一名独立开发的工程师，常驻杭州',
      communicationStyle: ['直接', '简洁', '不喜欢客套'],
      routinePatterns: ['早起写代码'],
      preferenceModel: [],
      decisionStyle: [],
      socialPosture: [],
      boundaries: [],
      riskTolerance: [],
    },
    recentState: {
      recurringTopics: ['创业', 'AI', '独立开发'],
      recentGoals: [],
      recentFriction: [],
      recentPreferenceSignals: [],
      recentRelationshipSignals: [],
    },
    liveState: {
      activeTopics: ['Phase 4 实现'],
      focus: [],
      mood: '',
      energy: '',
      socialTemperature: '',
      openLoops: [],
    },
  };

  it('does nothing when signalCount below threshold', async () => {
    const { svc, worldOwner } = makeService();
    const res = await svc.inferAndFillFromProfile({
      ...richProfile,
      signalCount: 3,
    });
    expect(res.filled).toEqual([]);
    expect(worldOwner.fillInferredProfileFields).not.toHaveBeenCalled();
  });

  it('does nothing when stableCore confidence too low', async () => {
    const { svc, worldOwner } = makeService();
    const res = await svc.inferAndFillFromProfile({
      ...richProfile,
      confidence: { stableCore: 0.1 },
    });
    expect(res.filled).toEqual([]);
    expect(worldOwner.fillInferredProfileFields).not.toHaveBeenCalled();
  });

  it('infers occupation / region / interests / addressTone from a rich profile', async () => {
    const { svc, filledCalls } = makeService();
    await svc.inferAndFillFromProfile(richProfile);
    expect(filledCalls).toHaveLength(1);
    const inferred = filledCalls[0];
    expect(inferred.occupation).toBe('工程师');
    expect(inferred.region).toBe('杭州');
    expect(inferred.interests).toContain('创业');
    expect(inferred.interests).toContain('AI');
    expect(inferred.aiAddressTone).toContain('直接');
  });

  it('caps interests at 5 unique topics', async () => {
    const { svc, filledCalls } = makeService();
    await svc.inferAndFillFromProfile({
      ...richProfile,
      recentState: {
        ...richProfile.recentState,
        recurringTopics: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      },
      liveState: { ...richProfile.liveState, activeTopics: ['a', 'h'] }, // 'a' dup
    });
    const interests = filledCalls[0].interests.split('、');
    expect(interests.length).toBe(5);
    // dedupe: 'a' 只出现一次
    expect(interests.filter((x: string) => x === 'a').length).toBe(1);
  });

  it('returns no inferences (undefined fields) when profile has nothing recognizable', async () => {
    const { svc, filledCalls } = makeService();
    await svc.inferAndFillFromProfile({
      signalCount: 40,
      confidence: { stableCore: 0.7 },
      stableCore: {
        identitySummary: '一个普通人',
        communicationStyle: [],
        routinePatterns: [],
        preferenceModel: [],
        decisionStyle: [],
        socialPosture: [],
        boundaries: [],
        riskTolerance: [],
      },
      recentState: {
        recurringTopics: [],
        recentGoals: [],
        recentFriction: [],
        recentPreferenceSignals: [],
        recentRelationshipSignals: [],
      },
      liveState: {
        activeTopics: [],
        focus: [],
        mood: '',
        energy: '',
        socialTemperature: '',
        openLoops: [],
      },
    });
    const inferred = filledCalls[0];
    expect(inferred.occupation).toBeUndefined();
    expect(inferred.region).toBeUndefined();
    expect(inferred.interests).toBeUndefined();
    expect(inferred.aiAddressTone).toBeUndefined();
  });

  it('swallows errors and returns empty', async () => {
    const worldOwner = {
      fillInferredProfileFields: jest.fn(async () => {
        throw new Error('db down');
      }),
    } as any;
    const svc = new PassiveProfileInferenceService(worldOwner);
    await expect(svc.inferAndFillFromProfile(richProfile)).resolves.toEqual({
      filled: [],
    });
  });
});
// i18n-ignore-end
