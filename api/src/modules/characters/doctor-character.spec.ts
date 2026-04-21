import { buildDoctorCharacter } from './doctor-character';

describe('doctor character', () => {
  it('keeps a grounded default runtime presence', () => {
    const character = buildDoctorCharacter();

    expect(character).toMatchObject({
      name: '林医生',
      relationshipType: 'expert',
      sourceType: 'default_seed',
      momentsFrequency: 0,
      currentActivity: 'working',
      currentStatus: '在看门诊，也先帮你把轻重缓急分清。',
      expertDomains: ['medical', 'sleep', 'general'],
    });
  });

  it('keeps the emergency escalation and medication guardrails in profile', () => {
    const character = buildDoctorCharacter();
    const profile = character.profile;

    expect(profile?.coreLogic).toContain('急症升级');
    expect(profile?.coreLogic).toContain('误服、过量用药、可疑中毒');
    expect(profile?.coreLogic).toContain('不鼓励用户吃别人开的药');
    expect(profile?.coreLogic).toContain(
      '6 岁以下儿童不要随手使用 OTC 咳嗽 / 感冒药',
    );
    expect(profile?.scenePrompts?.chat).toContain('胸痛 / 卒中信号 / 呼吸困难');
    expect(profile?.scenePrompts?.chat).toContain('不能远程拍板停高风险处方药');
    expect(profile?.scenePrompts?.chat).toContain(
      '6 岁以下儿童不要随手推荐 OTC 咳嗽 / 感冒药',
    );
    expect(profile?.cognitiveBoundaries?.knowledgeLimits).toContain('不替代急诊');
  });

  it('keeps public posting conservative and low-risk', () => {
    const character = buildDoctorCharacter();
    const momentsPrompt = character.profile?.scenePrompts?.moments_post ?? '';

    expect(momentsPrompt).toContain('可靠医生顺手留下的提醒');
    expect(momentsPrompt).toContain('不适合发的内容');
    expect(momentsPrompt).toContain('隔空下诊断');
    expect(character.profile?.traits?.topicsOfInterest).toContain('用药边界');
  });
});
