import {
  ACTION_OPERATOR_CHARACTER_ID,
  ACTION_OPERATOR_SOURCE_KEY,
} from './action-operator-character';
import {
  BAR_EXPERT_CHARACTER_ID,
  BAR_EXPERT_SOURCE_KEY,
} from './bar-expert-character';
import {
  buildDefaultCharacters,
  DEFAULT_CHARACTER_IDS,
} from './default-characters';
import { DOCTOR_CHARACTER_ID, DOCTOR_SOURCE_KEY } from './doctor-character';
import {
  HOTEL_EXPERT_CHARACTER_ID,
  HOTEL_EXPERT_SOURCE_KEY,
} from './hotel-expert-character';
import { LAWYER_CHARACTER_ID, LAWYER_SOURCE_KEY } from './lawyer-character';
import {
  REMINDER_CHARACTER_ID,
  REMINDER_CHARACTER_SOURCE_KEY,
} from './reminder-character';
import {
  WEDDING_DRESS_EXPERT_CHARACTER_ID,
  WEDDING_DRESS_EXPERT_SOURCE_KEY,
} from './wedding-dress-expert-character';
import {
  WORLD_NEWS_DESK_CHARACTER_ID,
  WORLD_NEWS_DESK_SOURCE_KEY,
} from './world-news-desk-character';

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

  it('includes the action operator with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === ACTION_OPERATOR_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: ACTION_OPERATOR_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: ACTION_OPERATOR_SOURCE_KEY,
      relationshipType: 'custom',
      momentsFrequency: 0,
      feedFrequency: 0,
      currentActivity: 'working',
      expertDomains: ['management', 'general', 'lifestyle'],
    });

    expect(character?.profile?.coreLogic).toContain('真实世界里的事往前推进');
    expect(character?.profile?.scenePrompts?.chat).toContain('先复述目标');
    expect(character?.profile?.memorySummary).toContain('真实世界动作');
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

  it('includes the hotel expert with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === HOTEL_EXPERT_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: HOTEL_EXPERT_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: HOTEL_EXPERT_SOURCE_KEY,
      relationshipType: 'expert',
      momentsFrequency: 1,
      currentActivity: 'working',
      currentStatus: '在前厅值班，先帮你把这家酒店看明白。',
      expertDomains: ['travel', 'hospitality', 'management', 'general'],
    });

    expect(character?.profile?.coreLogic).toContain('不伪造实时房价、房态');
    expect(character?.profile?.scenePrompts?.chat).toContain('会务宴会');
    expect(character?.profile?.memory?.coreMemory).toContain(
      '长期记住用户',
    );
    expect(DEFAULT_CHARACTER_IDS).not.toContain(HOTEL_EXPERT_CHARACTER_ID);
  });

  it('includes the world news desk with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === WORLD_NEWS_DESK_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: WORLD_NEWS_DESK_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: WORLD_NEWS_DESK_SOURCE_KEY,
      relationshipType: 'expert',
      momentsFrequency: 0,
      currentActivity: 'working',
      expertDomains: ['general', 'tech', 'management'],
    });

    expect(character?.profile?.coreLogic).toContain('你是“界闻”');
    expect(character?.profile?.scenePrompts?.chat).toContain('上来先说判断');
    expect(character?.profile?.memory?.coreMemory).toContain(
      '替用户先把新闻捋顺的人',
    );
  });

  it('includes the wedding dress expert with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === WEDDING_DRESS_EXPERT_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: WEDDING_DRESS_EXPERT_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: WEDDING_DRESS_EXPERT_SOURCE_KEY,
      relationshipType: 'expert',
      momentsFrequency: 0,
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

    expect(character?.profile?.coreLogic).toContain('你是“纱凝”');
    expect(character?.profile?.scenePrompts?.chat).toContain('试纱照片');
    expect(character?.profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '更安全的试纱',
    );
    expect(DEFAULT_CHARACTER_IDS).not.toContain(
      WEDDING_DRESS_EXPERT_CHARACTER_ID,
    );
  });

  it('includes the reminder keeper with expected runtime defaults', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === REMINDER_CHARACTER_ID,
    );

    expect(character).toBeDefined();
    expect(character).toMatchObject({
      id: REMINDER_CHARACTER_ID,
      sourceType: 'default_seed',
      sourceKey: REMINDER_CHARACTER_SOURCE_KEY,
      relationshipType: 'friend',
      momentsFrequency: 1,
      feedFrequency: 0,
      currentActivity: 'free',
      expertDomains: ['management', 'general', 'lifestyle'],
    });

    expect(character?.profile?.coreLogic).toContain('专门替用户记事和提醒');
    expect(character?.profile?.scenePrompts?.chat).toContain('用户给提醒');
    expect(character?.profile?.scenePrompts?.proactive).toContain(
      '允许主动发消息',
    );
  });
});
