import { CyberAvatarService } from './cyber-avatar.service';
import type { CyberAvatarSignalEntity } from './cyber-avatar-signal.entity';

// 分身相遇撮合卡片隐私：「常聊 …」摘要必须是纯兴趣主题，绝不出现人名/角色名；
// 重建时引用已删角色的 signal 要被剔除（删角色后旧 signal 仍在，否则已删角色名复现）。
// 这两个方法都是纯逻辑（不碰注入依赖），用最小桩实例化直接调私有方法验证。
describe('CyberAvatarService matchmaking privacy', () => {
  const service = new CyberAvatarService(
    {} as never, // profileRepo
    {} as never, // signalRepo
    {} as never, // runRepo
    {} as never, // characterRepo
    {} as never, // ai
    {} as never, // worldOwnerService
    {} as never, // rulesService
    {} as never, // matchmakingSync
    {} as never, // passiveInference
    {} as never, // subscription
  );

  const callCollect = (
    live: unknown,
    recent: unknown,
    names: string[],
  ): string[] =>
    (service as unknown as {
      collectInterestTags: (
        l: unknown,
        r: unknown,
        n: string[],
      ) => string[];
    }).collectInterestTags(live, recent, names);

  const callFilter = (
    signals: CyberAvatarSignalEntity[],
    ids: Set<string>,
  ): CyberAvatarSignalEntity[] =>
    (service as unknown as {
      filterSignalsByLiveCharacters: (
        s: CyberAvatarSignalEntity[],
        i: Set<string>,
      ) => CyberAvatarSignalEntity[];
    }).filterSignalsByLiveCharacters(signals, ids);

  it('drops bare/segment character-name tags, keeps neutral topics', () => {
    const tags = callCollect(
      {
        activeTopics: [
          '顾棠和林眠的身份', // 分隔段 顾棠 命中 → 丢
          '东京出差准备',
          '阿澄、苏笺、江渡分别是谁', // 分隔段 阿澄/苏笺 命中 → 丢
          '阿澄', // 整条==人名 → 丢
        ],
      },
      { recurringTopics: ['健身计划'] },
      ['顾棠', '林眠', '阿澄', '苏笺', '江渡'],
    );
    expect(tags).toEqual(['东京出差准备', '健身计划']);
  });

  it('does NOT over-strip topics that merely contain a name as a substring', () => {
    // 角色名 小红/费曼 不应误伤 小红书/费曼学习法（保守匹配，非子串匹配）。
    const tags = callCollect(
      { activeTopics: ['小红书运营', '费曼学习法', '阅读'] },
      { recurringTopics: ['马斯克传记读后感'] },
      ['小红', '费曼', '马斯克'],
    );
    expect(tags).toEqual([
      '小红书运营',
      '费曼学习法',
      '阅读',
      '马斯克传记读后感',
    ]);
  });

  it('keeps all tags when no character names provided (back-compat)', () => {
    const tags = callCollect(
      { activeTopics: ['咖啡冲煮', '咖啡冲煮'] },
      { recurringTopics: ['露营'] },
      [],
    );
    expect(tags).toEqual(['咖啡冲煮', '露营']);
  });

  it('drops signals referencing a deleted character, keeps live or characterId-less ones', () => {
    const sig = (id: string, characterId?: string): CyberAvatarSignalEntity =>
      ({
        id,
        summaryText: `单聊对 X 发送：hi`,
        payload: characterId ? { characterId } : null,
      }) as unknown as CyberAvatarSignalEntity;

    const signals = [
      sig('a', 'char-live'),
      sig('b', 'char-deleted'),
      sig('c'), // 无 characterId → 保留
    ];
    const kept = callFilter(signals, new Set(['char-live']));
    expect(kept.map((s) => s.id)).toEqual(['a', 'c']);
  });
});
