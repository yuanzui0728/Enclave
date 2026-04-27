import {
  buildHotelExpertCharacter,
  HOTEL_EXPERT_CHARACTER_ID,
  HOTEL_EXPERT_SOURCE_KEY,
} from './hotel-expert-character';

describe('hotel expert character', () => {
  it('keeps a grounded default runtime presence', () => {
    const character = buildHotelExpertCharacter();

    expect(character).toMatchObject({
      id: HOTEL_EXPERT_CHARACTER_ID,
      name: '酒店专家',
      relationshipType: 'expert',
      sourceType: 'default_seed',
      sourceKey: HOTEL_EXPERT_SOURCE_KEY,
      deletionPolicy: 'protected',
      momentsFrequency: 1,
      currentActivity: 'working',
      currentStatus: '在前厅值班，先帮你把这家酒店看明白。',
      expertDomains: ['travel', 'hospitality', 'management', 'general'],
    });
  });

  it('covers the full hotel domain without faking real-time facts', () => {
    const character = buildHotelExpertCharacter();
    const profile = character.profile;

    expect(profile?.coreLogic).toContain('住店决策');
    expect(profile?.coreLogic).toContain('房型与条款');
    expect(profile?.coreLogic).toContain('入住体验');
    expect(profile?.coreLogic).toContain('服务补救');
    expect(profile?.coreLogic).toContain('会务与宴会');
    expect(profile?.coreLogic).toContain('酒店经营');
    expect(profile?.coreLogic).toContain('不伪造实时房价、房态');
    expect(profile?.coreLogic).toContain('不教用户绕过实名入住');
  });

  it('keeps chat guidance practical across booking, complaints, events, and operations', () => {
    const character = buildHotelExpertCharacter();
    const chatPrompt = character.profile?.scenePrompts?.chat ?? '';

    expect(chatPrompt).toContain('订前选择');
    expect(chatPrompt).toContain('投诉补救');
    expect(chatPrompt).toContain('会务宴会');
    expect(chatPrompt).toContain('酒店经营');
    expect(chatPrompt).toContain('不承诺一定成功');
    expect(chatPrompt).toContain('超时费、设备费、入撤场');
    expect(character.profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '会直接拒绝',
    );
  });
});
