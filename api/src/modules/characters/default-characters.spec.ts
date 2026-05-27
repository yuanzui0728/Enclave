// i18n-ignore-start: data / seed / preset content — not user-facing UI.
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
  SELF_CHARACTER_ID,
} from './default-characters';
import { DOCTOR_CHARACTER_ID, DOCTOR_SOURCE_KEY } from './doctor-character';
import { HOTEL_EXPERT_CHARACTER_ID } from './hotel-expert-character';
import { LAWYER_CHARACTER_ID, LAWYER_SOURCE_KEY } from './lawyer-character';
import {
  REMINDER_CHARACTER_ID,
  REMINDER_CHARACTER_SOURCE_KEY,
} from './reminder-character';
import { DEFAULT_FRIENDSHIP_CHARACTER_IDS } from '../social/social.service';
import { WEDDING_PLANNER_CHARACTER_ID } from './wedding-planner-character';
import { WEDDING_DRESS_EXPERT_CHARACTER_ID } from './wedding-dress-expert-character';
import {
  WORLD_NEWS_DESK_CHARACTER_ID,
  WORLD_NEWS_DESK_SOURCE_KEY,
} from './world-news-desk-character';

// 2026-05-21 起新用户默认好友收敛到 3 个；其它原默认好友（医生/律师/行动助理/
// 酒吧专家/安全守门人/谈判顾问/关系模式观察员/亲密关系咨询师/睡眠陪伴医生/助眠情绪顾问）仍然作为系统/居民角色存在，但不再
// 出厂自动 friendship。
describe('default characters', () => {
  it('keeps default character ids unique', () => {
    expect(new Set(DEFAULT_CHARACTER_IDS).size).toBe(
      DEFAULT_CHARACTER_IDS.length,
    );
  });

  it('limits automatic friendships to self only (2026-05-27)', () => {
    // 默认好友只剩「我」。提醒助手 / 新闻编辑 退为居民（见下一条断言：仍在
    // DEFAULT_CHARACTER_IDS），但不再出厂 friendship。
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).toEqual([SELF_CHARACTER_ID]);

    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      REMINDER_CHARACTER_ID,
    );
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      WORLD_NEWS_DESK_CHARACTER_ID,
    );

    // 退为居民的角色仍然作为系统角色 seed 进 characters 表并保持 protected，只是不再 friendship。
    expect(DEFAULT_CHARACTER_IDS).toContain(REMINDER_CHARACTER_ID);
    expect(DEFAULT_CHARACTER_IDS).toContain(WORLD_NEWS_DESK_CHARACTER_ID);

    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      ACTION_OPERATOR_CHARACTER_ID,
    );
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      BAR_EXPERT_CHARACTER_ID,
    );
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      DOCTOR_CHARACTER_ID,
    );
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      LAWYER_CHARACTER_ID,
    );

    // 已退役的默认角色：酒店专家 / 婚礼策划师 / 婚纱造型顾问。
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      HOTEL_EXPERT_CHARACTER_ID,
    );
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      WEDDING_PLANNER_CHARACTER_ID,
    );
    expect(DEFAULT_FRIENDSHIP_CHARACTER_IDS).not.toContain(
      WEDDING_DRESS_EXPERT_CHARACTER_ID,
    );
  });

  it('renames the self character to "我" (2026-05-21)', () => {
    const character = buildDefaultCharacters().find(
      (item) => item.id === SELF_CHARACTER_ID,
    );
    expect(character).toBeDefined();
    expect(character?.name).toBe('我');
    expect(character?.profile?.name).toBe('我');
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

    expect(character?.profile?.coreLogic).toContain('你是“新闻编辑”');
    expect(character?.profile?.scenePrompts?.chat).toContain('上来先说判断');
    expect(character?.profile?.memory?.coreMemory).toContain(
      '替用户先把新闻捋顺的人',
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
// i18n-ignore-end
