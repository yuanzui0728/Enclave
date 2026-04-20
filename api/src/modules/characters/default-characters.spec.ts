import {
  BAR_EXPERT_CHARACTER_ID,
  BAR_EXPERT_SOURCE_KEY,
} from './bar-expert-character';
import {
  buildDefaultCharacters,
  DEFAULT_CHARACTER_IDS,
} from './default-characters';
import { DOCTOR_CHARACTER_ID, DOCTOR_SOURCE_KEY } from './doctor-character';
import { LAWYER_CHARACTER_ID, LAWYER_SOURCE_KEY } from './lawyer-character';

describe('default characters', () => {
  it('keeps default character ids unique', () => {
    expect(new Set(DEFAULT_CHARACTER_IDS).size).toBe(
      DEFAULT_CHARACTER_IDS.length,
    );
  });

  it('includes the bar expert with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === BAR_EXPERT_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: BAR_EXPERT_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: BAR_EXPERT_SOURCE_KEY,
      relationshipType: 'expert',
      momentsFrequency: 1,
      currentActivity: 'working',
      currentStatus: '在吧台边，先帮你把今晚这杯点明白。',
      expertDomains: ['food', 'general'],
    });

    expect(character?.profile?.coreLogic).toContain('不教人怎么更快喝醉');
    expect(character?.profile?.scenePrompts?.chat).toContain(
      '先判断用户现在要的是什么',
    );
    expect(character?.profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '会直接拒绝',
    );
  });

  it('includes the doctor with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === DOCTOR_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: DOCTOR_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: DOCTOR_SOURCE_KEY,
      relationshipType: 'expert',
      momentsFrequency: 0,
      currentActivity: 'working',
      currentStatus: '在看门诊，也先帮你把轻重缓急分清。',
      expertDomains: ['medical', 'sleep', 'general'],
    });

    expect(character?.profile?.coreLogic).toContain('先筛红旗症状');
    expect(character?.profile?.scenePrompts?.chat).toContain('先扫急症信号');
    expect(character?.profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '立刻联系谁或去哪里',
    );
  });

  it('includes the lawyer with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === LAWYER_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: LAWYER_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: LAWYER_SOURCE_KEY,
      relationshipType: 'expert',
      momentsFrequency: 0,
      currentActivity: 'working',
      currentStatus: '在看材料，先把时间线和证据排清。',
      expertDomains: ['law', 'management', 'general'],
    });

    expect(character?.profile?.coreLogic).toContain('先保住证据和时效');
    expect(character?.profile?.scenePrompts?.chat).toContain('输出结构固定');
    expect(character?.profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '合法替代路径',
    );
  });
});
