// i18n-ignore-start: test fixtures — not user-facing UI.
import { WorldContextHubService } from './world-context-hub.service';

describe('WorldContextHubService.buildOwnerPortrait', () => {
  function makeHub(
    getProfileImpl: () => Promise<unknown>,
    listSignalsImpl: (opts?: { limit?: number }) => Promise<unknown> = async () =>
      [],
  ) {
    const cyberAvatar = {
      getProfile: jest.fn(getProfileImpl),
      listSignals: jest.fn(listSignalsImpl),
    } as any;
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

describe('WorldContextHubService.buildWorldRecentEpisodes (Stratum B 跨角色共享记忆)', () => {
  function makeHub(listSignalsImpl: (opts?: { limit?: number }) => Promise<unknown>) {
    const cyberAvatar = {
      getProfile: jest.fn(async () => null),
      listSignals: jest.fn(listSignalsImpl),
    } as any;
    return new WorldContextHubService(cyberAvatar);
  }

  it('returns empty string when there are no signals', async () => {
    const hub = makeHub(async () => []);
    await expect(hub.buildWorldRecentEpisodes()).resolves.toBe('');
  });

  it('returns empty string when listSignals throws', async () => {
    const hub = makeHub(async () => {
      throw new Error('no tenant');
    });
    await expect(hub.buildWorldRecentEpisodes()).resolves.toBe('');
  });

  it('renders recent cross-character episodes ordered + dated, filtering low-weight noise', async () => {
    const now = Date.now();
    const day = 86_400_000;
    const hub = makeHub(async () => [
      {
        id: '1',
        summaryText: '单聊对 Alice 发送：我下周三要去东京见客户',
        weight: 1.5,
        occurredAt: new Date(now - 1 * day).toISOString(),
      },
      {
        id: '2',
        summaryText: '发了朋友圈：今天养了只新猫，叫煤球',
        weight: 1.4,
        occurredAt: new Date(now - 3 * day).toISOString(),
      },
      {
        id: 'noise-low-weight',
        summaryText: '位置更新到杭州',
        weight: 0.6, // 低于阈值 1.0
        occurredAt: new Date(now - 2 * day).toISOString(),
      },
      {
        id: '3',
        summaryText: '单聊对 工程教练 发送：MVP 卡在认证模块',
        weight: 1.5,
        occurredAt: new Date(now - 5 * day).toISOString(),
      },
      {
        id: 'too-old',
        summaryText: '半年前提过的旧事',
        weight: 1.5,
        occurredAt: new Date(now - 200 * day).toISOString(), // 超出 30 天窗口
      },
    ]);

    const out = await hub.buildWorldRecentEpisodes();

    expect(out).toContain('<world_recent_episodes>');
    expect(out).toContain('</world_recent_episodes>');
    expect(out).toContain('近期世界对 Ta 的具体观察');
    // 跨角色三条都在
    expect(out).toContain('Alice 发送：我下周三要去东京见客户');
    expect(out).toContain('养了只新猫');
    expect(out).toContain('工程教练');
    // 时间标签
    expect(out).toContain('昨天');
    expect(out).toContain('3天前');
    expect(out).toContain('5天前');
    // 低权重噪声被过滤
    expect(out).not.toContain('位置更新到杭州');
    // 超窗事件被过滤
    expect(out).not.toContain('旧事');
  });

  it('dedupes near-identical signal summaries (first 50 chars match)', async () => {
    const now = Date.now();
    const hub = makeHub(async () => [
      {
        id: 'a',
        summaryText: '单聊对 Alice 发送：明天早八起床跑步，每周三次',
        weight: 1.5,
        occurredAt: new Date(now - 86_400_000).toISOString(),
      },
      {
        id: 'a-dup',
        summaryText: '单聊对 Alice 发送：明天早八起床跑步，每周三次',
        weight: 1.5,
        occurredAt: new Date(now - 2 * 86_400_000).toISOString(),
      },
    ]);

    const out = await hub.buildWorldRecentEpisodes();
    // 只保留一条
    expect((out.match(/早八起床跑步/g) ?? []).length).toBe(1);
  });

  it('buildOwnerContextBlocks returns both blocks in parallel', async () => {
    const cyberAvatar = {
      getProfile: jest.fn(async () => ({
        signalCount: 1,
        stableCore: { identitySummary: '测试' },
        recentState: {},
        liveState: {},
        confidence: { stableCore: 0.8 },
      })),
      listSignals: jest.fn(async () => [
        {
          id: '1',
          summaryText: '单聊对 Bob 发送：测试事件',
          weight: 1.5,
          occurredAt: new Date().toISOString(),
        },
      ]),
    } as any;
    const hub = new WorldContextHubService(cyberAvatar);

    const result = await hub.buildOwnerContextBlocks();
    expect(result.portrait).toContain('<owner_portrait>');
    expect(result.sharedMemory).toContain('<world_recent_episodes>');
    expect(result.sharedMemory).toContain('测试事件');
  });
});
// i18n-ignore-end
