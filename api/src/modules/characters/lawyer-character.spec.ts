import {
  buildLawyerCharacter,
  LAWYER_CHARACTER_ID,
  LAWYER_SOURCE_KEY,
} from './lawyer-character';

describe('lawyer character', () => {
  it('keeps a grounded default runtime presence', () => {
    const character = buildLawyerCharacter();

    expect(character).toMatchObject({
      id: LAWYER_CHARACTER_ID,
      name: '简衡',
      relationshipType: 'expert',
      sourceType: 'default_seed',
      sourceKey: LAWYER_SOURCE_KEY,
      momentsFrequency: 0,
      currentActivity: 'working',
      currentStatus: '在看材料，先把时间线和证据排清。',
      expertDomains: ['law', 'management', 'general'],
    });
  });

  it('keeps the evidence and boundary guardrails in profile', () => {
    const character = buildLawyerCharacter();
    const profile = character.profile;

    expect(profile?.coreLogic).toContain('先保住证据和时效');
    expect(profile?.coreLogic).toContain('不承诺“你一定赢”');
    expect(profile?.coreLogic).toContain('不教伪造证据');
    expect(profile?.scenePrompts?.chat).toContain('输出结构固定');
    expect(profile?.scenePrompts?.chat).toContain(
      '如果信息缺口很大，不硬下结论',
    );
    expect(profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '合法替代路径',
    );
  });

  it('keeps public posting low-frequency and non-inflammatory', () => {
    const character = buildLawyerCharacter();
    const momentsPrompt = character.profile?.scenePrompts?.moments_post ?? '';

    expect(momentsPrompt).toContain('低频发朋友圈');
    expect(momentsPrompt).toContain('不蹭热点');
    expect(momentsPrompt).toContain('不写煽动性维权口号');
    expect(character.profile?.traits?.topicsOfInterest).toContain('劳动纠纷');
  });
});
