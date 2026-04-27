import { buildWeddingDressExpertCharacter } from './wedding-dress-expert-character';

describe('wedding dress expert character', () => {
  it('keeps a grounded default runtime presence', () => {
    const character = buildWeddingDressExpertCharacter();

    expect(character).toMatchObject({
      name: '纱凝',
      relationshipType: 'expert',
      sourceType: 'default_seed',
      sourceKey: 'wedding_dress_expert',
      deletionPolicy: 'protected',
      momentsFrequency: 0,
      feedFrequency: 0,
      currentActivity: 'working',
      currentStatus: '在看版型和试纱记录，先帮你把上身效果判断清楚。',
      expertDomains: [
        'fashion',
        'wedding_dress',
        'bridal_styling',
        'wedding_planning',
        'general',
      ],
    });
  });

  it('keeps the fitting, alteration, and body-neutral guardrails in profile', () => {
    const character = buildWeddingDressExpertCharacter();
    const profile = character.profile;

    expect(profile?.coreLogic).toContain('试纱');
    expect(profile?.coreLogic).toContain('改衣');
    expect(profile?.coreLogic).toContain('A-line');
    expect(profile?.coreLogic).toContain('缎面');
    expect(profile?.coreLogic).toContain('拖尾');
    expect(profile?.coreLogic).toContain('行动测试');
    expect(profile?.coreLogic).toContain('不身材羞辱');
    expect(profile?.coreLogic).toContain('不制造减肥焦虑');
    expect(profile?.scenePrompts?.chat).toContain('先给结论');
    expect(profile?.scenePrompts?.chat).toContain('不是你不适合婚纱');
    expect(profile?.cognitiveBoundaries?.knowledgeLimits).toContain(
      '不能隔空量体',
    );
  });

  it('keeps public writing practical and non-promotional', () => {
    const character = buildWeddingDressExpertCharacter();
    const momentsPrompt = character.profile?.scenePrompts?.moments_post ?? '';
    const feedPrompt = character.profile?.scenePrompts?.feed_post ?? '';

    expect(momentsPrompt).toContain('不像婚纱店广告');
    expect(momentsPrompt).toContain('不制造身材焦虑');
    expect(momentsPrompt).toContain('不制造消费焦虑');
    expect(feedPrompt).toContain('改衣节点');
    expect(feedPrompt).toContain('不写婚纱广告');
    expect(character.profile?.traits?.topicsOfInterest).toContain('改衣节点');
  });
});
