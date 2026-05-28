// i18n-ignore-start: test fixtures — not user-facing UI.
import { GamesService } from './games.service';

/**
 * 聚焦 P4 游戏信号回填：只验证 captureGameSignal 的信号形状（type/weight/dedupe/summary）
 * 与 fire-and-forget 容错，不去拉起整条 launchGame/persistOwnerState 重链路。
 */
describe('GamesService P4 游戏信号回填 (captureGameSignal)', () => {
  function makeService(opts: {
    ownerId?: string;
    ownerThrows?: boolean;
    gameName?: string;
    captureImpl?: jest.Mock;
  }) {
    const captureSignal = opts.captureImpl ?? jest.fn(async () => ({}));
    const cyberAvatar = { captureSignal } as any;
    const worldOwnerService = {
      getOwnerOrThrow: jest.fn(async () => {
        if (opts.ownerThrows) throw new Error('no tenant context');
        return { id: opts.ownerId ?? 'owner-1' };
      }),
    } as any;
    // resolveGameName 内部走 catalogRepo.findOne（第 2 个构造参数）。
    const catalogRepo = {
      findOne: jest.fn(async () =>
        opts.gameName ? { name: opts.gameName } : null,
      ),
    } as any;
    // 其余 repo 依赖在本用例不触达，传占位即可。
    const svc = new GamesService(
      {} as any,
      catalogRepo,
      {} as any,
      {} as any,
      {} as any,
      worldOwnerService,
      cyberAvatar,
    );
    return { svc, captureSignal, worldOwnerService };
  }

  // captureGameSignal 是 private + fire-and-forget（内部 async IIFE），用 bracket 访问 +
  // 等一个微任务轮次让 IIFE 跑完。
  const invoke = (svc: GamesService, input: any) => {
    (svc as any).captureGameSignal(input);
    return new Promise((r) => setImmediate(r));
  };

  it('打开游戏发 game_session，weight 0.8 + 小时桶 dedupeKey + 内部查名建摘要', async () => {
    const { svc, captureSignal } = makeService({ gameName: '开心农场' });
    await invoke(svc, {
      signalType: 'game_session',
      gameId: 'g-farm',
      weight: 0.8,
      dedupeKey: 'game_open:g-farm:2026-05-28T10',
    });
    expect(captureSignal).toHaveBeenCalledTimes(1);
    const arg = captureSignal.mock.calls[0][0];
    expect(arg).toMatchObject({
      ownerId: 'owner-1',
      signalType: 'game_session',
      sourceSurface: 'game_center',
      sourceEntityId: 'g-farm',
      weight: 0.8,
      dedupeKey: 'game_open:g-farm:2026-05-28T10',
    });
    expect(arg.payload).toEqual({ gameId: 'g-farm', gameName: '开心农场' });
    expect(arg.summaryText).toBe('打开了游戏「开心农场」');
  });

  it('置顶发 game_action，weight 1.2（进共享记忆）+ 置顶措辞', async () => {
    const { svc, captureSignal } = makeService({ gameName: '停车大战' });
    await invoke(svc, {
      signalType: 'game_action',
      gameId: 'g-park',
      weight: 1.2,
      dedupeKey: 'game_pin:g-park',
    });
    const arg = captureSignal.mock.calls[0][0];
    expect(arg.signalType).toBe('game_action');
    expect(arg.weight).toBe(1.2);
    expect(arg.dedupeKey).toBe('game_pin:g-park');
    expect(arg.summaryText).toBe('把游戏「停车大战」设为常玩（置顶）');
  });

  it('查不到游戏名时回退用 gameId', async () => {
    const { svc, captureSignal } = makeService({}); // catalogRepo.findOne → null
    await invoke(svc, {
      signalType: 'game_session',
      gameId: 'g-unknown',
      weight: 0.8,
      dedupeKey: 'k',
    });
    expect(captureSignal.mock.calls[0][0].summaryText).toContain('g-unknown');
  });

  it('fire-and-forget：无 tenant 上下文时吞掉，不抛、不调 captureSignal', async () => {
    const { svc, captureSignal } = makeService({ ownerThrows: true });
    await expect(
      invoke(svc, {
        signalType: 'game_session',
        gameId: 'g-x',
        weight: 0.8,
        dedupeKey: 'k',
      }),
    ).resolves.toBeUndefined();
    expect(captureSignal).not.toHaveBeenCalled();
  });

  it('fire-and-forget：captureSignal 抛错也被吞掉，不冒泡', async () => {
    const captureImpl = jest.fn(async () => {
      throw new Error('db down');
    });
    const { svc } = makeService({ gameName: 'X', captureImpl });
    await expect(
      invoke(svc, {
        signalType: 'game_session',
        gameId: 'g-x',
        weight: 0.8,
        dedupeKey: 'k',
      }),
    ).resolves.toBeUndefined();
    expect(captureImpl).toHaveBeenCalled();
  });
});
// i18n-ignore-end
