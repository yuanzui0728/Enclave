import { buildBarExpertCharacter } from './bar-expert-character';

describe('bar expert character', () => {
  it('keeps a lively default runtime presence', () => {
    const character = buildBarExpertCharacter();

    expect(character).toMatchObject({
      name: '阿澄',
      relationshipType: 'expert',
      sourceType: 'default_seed',
      momentsFrequency: 1,
      currentActivity: 'working',
      currentStatus: '在吧台边，先帮你把今晚这杯点明白。',
      expertDomains: ['food', 'general'],
    });
  });

  it('keeps the core safety guardrails in chat and profile', () => {
    const character = buildBarExpertCharacter();
    const profile = character.profile;

    expect(profile?.coreLogic).toContain('不教人怎么更快喝醉');
    expect(profile?.coreLogic).toContain('如果用户怀疑被下药');
    expect(profile?.scenePrompts?.chat).toContain('如果涉及安全');
    expect(profile?.scenePrompts?.chat).toContain('咨询腔开头');
    expect(profile?.scenePrompts?.chat).toContain('Dry Martini');
    expect(profile?.scenePrompts?.chat).toContain('Vesper');
    expect(profile?.scenePrompts?.chat).toContain('慢慢喝一点');
    expect(profile?.scenePrompts?.chat).toContain('不想硬撑');
    expect(profile?.cognitiveBoundaries?.refusalStyle).toContain('会直接拒绝');
  });

  it('keeps moments writing grounded and non-promotional', () => {
    const character = buildBarExpertCharacter();
    const momentsPrompt = character.profile?.scenePrompts?.moments_post ?? '';

    expect(momentsPrompt).toContain('不像酒吧营销号');
    expect(momentsPrompt).toContain('烈酒品牌软文');
    expect(momentsPrompt).toContain('今晚想喝但不想醉');
    expect(character.profile?.traits?.topicsOfInterest).toContain(
      '低度与无酒精',
    );
  });
});
