// i18n-ignore-start: test fixtures — not user-facing UI.
import { WorldContextHubService } from './world-context-hub.service';

describe('WorldContextHubService.buildOwnerPortrait', () => {
  function makeHub(getProfileImpl: () => Promise<unknown>) {
    const cyberAvatar = { getProfile: jest.fn(getProfileImpl) } as any;
    return new WorldContextHubService(cyberAvatar);
  }

  it('returns empty string when no signals captured yet', async () => {
    const hub = makeHub(async () => ({
      signalCount: 0,
      stableCore: { identitySummary: '应忽略' },
      recentState: {},
      liveState: {},
      confidence: { stableCore: 0.9, recentState: 0.9, liveState: 0.9 },
    }));
    await expect(hub.buildOwnerPortrait()).resolves.toBe('');
  });

  it('returns empty string when getProfile throws (no tenant / no row)', async () => {
    const hub = makeHub(async () => {
      throw new Error('no tenant context');
    });
    await expect(hub.buildOwnerPortrait()).resolves.toBe('');
  });

  it('renders third-person owner portrait with stable + recent + live fields', async () => {
    const hub = makeHub(async () => ({
      signalCount: 42,
      stableCore: {
        identitySummary: '工程师，独立开发者',
        communicationStyle: ['直接', '简洁'],
        decisionStyle: ['看数据', '小步快跑'],
        preferenceModel: ['偏好开源工具'],
        socialPosture: ['内向但乐于深聊'],
        routinePatterns: ['早起'],
        boundaries: ['不聊政治'],
        riskTolerance: ['中等'],
      },
      recentState: {
        recurringTopics: ['创业', 'AI'],
        recentGoals: ['上线 MVP'],
        recentFriction: ['资金紧张'],
        recentPreferenceSignals: [],
        recentRelationshipSignals: [],
      },
      liveState: {
        focus: [],
        mood: '专注',
        energy: '充沛',
        socialTemperature: '',
        activeTopics: ['Phase 1 实现'],
        openLoops: ['等并发会话完成'],
      },
      confidence: { stableCore: 0.7, recentState: 0.7, liveState: 0.7 },
    }));

    const out = await hub.buildOwnerPortrait();

    expect(out).toContain('<owner_portrait>');
    expect(out).toContain('</owner_portrait>');
    expect(out).toContain('关于你正在服务的这个人');
    expect(out).toContain('工程师');
    expect(out).toContain('直接、简洁');
    expect(out).toContain('反复在意的主题：创业、AI');
    expect(out).toContain('最近的目标：上线 MVP');
    expect(out).toContain('当前情绪：专注');
    expect(out).toContain('还没了结、可能在意的事：等并发会话完成');
    // 高置信不应附加 "了解还不深" 软化提示
    expect(out).not.toContain('了解还不深');
  });

  it('adds low-confidence softener when stableCore confidence < 0.4', async () => {
    const hub = makeHub(async () => ({
      signalCount: 5,
      stableCore: { identitySummary: '初步看像写代码的' },
      recentState: { recurringTopics: ['代码'] },
      liveState: { mood: '一般' },
      confidence: { stableCore: 0.2, recentState: 0.2, liveState: 0.2 },
    }));

    const out = await hub.buildOwnerPortrait();
    expect(out).toContain('了解还不深');
    expect(out).toContain('初步看像写代码的');
  });

  it('skips entirely when all stratum fields are blank (e.g. fresh empty profile row)', async () => {
    const hub = makeHub(async () => ({
      signalCount: 1, // > 0 but everything else empty
      stableCore: {
        identitySummary: '',
        communicationStyle: [],
        decisionStyle: [],
        preferenceModel: [],
        socialPosture: [],
        routinePatterns: [],
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
        focus: [],
        mood: '',
        energy: '',
        socialTemperature: '',
        activeTopics: [],
        openLoops: [],
      },
      confidence: { stableCore: 0.5, recentState: 0.5, liveState: 0.5 },
    }));

    await expect(hub.buildOwnerPortrait()).resolves.toBe('');
  });

  it('caps long arrays at 6 items so prompts stay bounded', async () => {
    const tenItems = Array.from({ length: 10 }, (_, i) => `主题${i + 1}`);
    const hub = makeHub(async () => ({
      signalCount: 10,
      stableCore: { identitySummary: '测试' },
      recentState: { recurringTopics: tenItems },
      liveState: {},
      confidence: { stableCore: 0.5 },
    }));

    const out = await hub.buildOwnerPortrait();
    // 取到的应仅前 6 项
    expect(out).toContain('主题6');
    expect(out).not.toContain('主题7');
  });
});
// i18n-ignore-end
