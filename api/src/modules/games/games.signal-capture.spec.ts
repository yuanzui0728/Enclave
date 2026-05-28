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
    // 其余 repo 依赖在本用例不触达，传占位即可。
    const svc = new GamesService(
      {} as any,
      {} as any,
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

  it('打开游戏发 game_session，weight 0.8 + 小时桶 dedupeKey', async () => {
    const { svc, captureSignal } = makeService({});
    await invoke(svc, {
      signalType: 'game_session',
      gameId: 'g-farm',
      gameName: '开心农场',
      summaryText: '打开了游戏「开心农场」',
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
    expect(arg.summaryText).toContain('开心农场');
  });

  it('置顶发 game_action，weight 1.2（进共享记忆）', async () => {
    const { svc, captureSignal } = makeService({});
    await invoke(svc, {
      signalType: 'game_action',
      gameId: 'g-park',
      gameName: '停车大战',
      summaryText: '把游戏「停车大战」设为常玩（置顶）',
      weight: 1.2,
      dedupeKey: 'game_pin:g-park',
    });
    const arg = captureSignal.mock.calls[0][0];
    expect(arg.signalType).toBe('game_action');
    expect(arg.weight).toBe(1.2);
    expect(arg.dedupeKey).toBe('game_pin:g-park');
  });

  it('fire-and-forget：无 tenant 上下文时吞掉，不抛、不调 captureSignal', async () => {
    const { svc, captureSignal } = makeService({ ownerThrows: true });
    await expect(
      invoke(svc, {
        signalType: 'game_session',
        gameId: 'g-x',
        gameName: 'X',
        summaryText: 's',
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
    const { svc } = makeService({ captureImpl });
    await expect(
      invoke(svc, {
        signalType: 'game_session',
        gameId: 'g-x',
        gameName: 'X',
        summaryText: 's',
        weight: 0.8,
        dedupeKey: 'k',
      }),
    ).resolves.toBeUndefined();
    expect(captureImpl).toHaveBeenCalled();
  });
});
// i18n-ignore-end
