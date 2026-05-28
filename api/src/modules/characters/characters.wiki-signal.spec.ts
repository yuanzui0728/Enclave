// i18n-ignore-start: test fixtures — not user-facing UI.
import { CharactersService } from './characters.service';

/**
 * 聚焦 P4 wiki 私有角色导入信号：只验证 captureWikiCharacterSignal 的信号形状与
 * fire-and-forget 容错，不拉起整条 importPersonalCharacter 重链路（9 个依赖）。
 */
describe('CharactersService P4 wiki 私有角色导入信号 (captureWikiCharacterSignal)', () => {
  function make(opts: { captureImpl?: jest.Mock } = {}) {
    const captureSignal = opts.captureImpl ?? jest.fn(async () => ({}));
    const cyberAvatar = { captureSignal } as any;
    // CharactersService 构造签名：repo, friendshipRepo, worldOwnerService, dataSource,
    // realWorldRuntimeProfile, blueprintService, importRegisterClient, cyberAvatar。
    const svc = new CharactersService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cyberAvatar,
    );
    return { svc, captureSignal };
  }

  const invoke = (svc: CharactersService, ...args: any[]) => {
    (svc as any).captureWikiCharacterSignal(...args);
    return new Promise((r) => setImmediate(r));
  };

  it('新导入发 wiki_character_created，weight 1.4 + 领域进 summary', async () => {
    const { svc, captureSignal } = make();
    await invoke(
      svc,
      'owner-1',
      { id: 'c-1', name: '心理咨询师 Alice' },
      ['心理健康', '情绪管理'],
      false,
    );
    expect(captureSignal).toHaveBeenCalledTimes(1);
    const arg = captureSignal.mock.calls[0][0];
    expect(arg).toMatchObject({
      ownerId: 'owner-1',
      signalType: 'wiki_character_created',
      sourceSurface: 'wiki',
      sourceEntityId: 'c-1',
      weight: 1.4,
      dedupeKey: 'wiki_char_create:c-1',
    });
    expect(arg.summaryText).toContain('心理咨询师 Alice');
    expect(arg.summaryText).toContain('心理健康/情绪管理');
    expect(arg.payload).toMatchObject({ characterId: 'c-1', domains: ['心理健康', '情绪管理'] });
  });

  it('更新已存在发 wiki_character_edited，weight 1.0 + 按天 dedupe', async () => {
    const { svc, captureSignal } = make();
    await invoke(svc, 'owner-1', { id: 'c-2', name: '法律顾问' }, [], true);
    const arg = captureSignal.mock.calls[0][0];
    expect(arg.signalType).toBe('wiki_character_edited');
    expect(arg.weight).toBe(1.0);
    expect(arg.dedupeKey).toMatch(/^wiki_char_edit:c-2:\d{4}-\d{2}-\d{2}$/);
    expect(arg.summaryText).toContain('更新了私有角色「法律顾问」');
  });

  it('无名字 → 不发信号', async () => {
    const { svc, captureSignal } = make();
    await invoke(svc, 'owner-1', { id: 'c-3', name: '  ' }, ['x'], false);
    expect(captureSignal).not.toHaveBeenCalled();
  });

  it('fire-and-forget：captureSignal 抛错被吞掉，不冒泡', async () => {
    const captureImpl = jest.fn(async () => {
      throw new Error('db down');
    });
    const { svc } = make({ captureImpl });
    await expect(
      invoke(svc, 'owner-1', { id: 'c-4', name: 'X' }, [], false),
    ).resolves.toBeUndefined();
    expect(captureImpl).toHaveBeenCalled();
  });
});
// i18n-ignore-end
