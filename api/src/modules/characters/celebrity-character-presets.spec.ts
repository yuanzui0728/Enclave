import { getPresetCharacterBio } from './character-bios';
import {
  getCelebrityCharacterPreset,
  getCelebrityCharacterPresetGroup,
  listCelebrityCharacterPresets,
} from './celebrity-character-presets';

describe('celebrity character presets', () => {
  it('keeps preset ids unique', () => {
    const presets = listCelebrityCharacterPresets();
    const ids = presets.map((preset) => preset.id);
    const presetKeys = presets.map((preset) => preset.presetKey);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(presetKeys).size).toBe(presetKeys.length);
  });

  it('exposes the relationships and emotions preset group', () => {
    expect(
      getCelebrityCharacterPresetGroup('relationships_and_emotions'),
    ).toMatchObject({
      key: 'relationships_and_emotions',
      label: '亲密关系',
    });
  });

  it('includes the relationship expert preset with expected guardrails', () => {
    const preset = getCelebrityCharacterPreset('jian_ning_relationship_expert');

    expect(preset).toBeDefined();
    expect(preset).toMatchObject({
      presetKey: 'jian_ning_relationship_expert',
      groupKey: 'relationships_and_emotions',
      name: '简宁',
      relationship: '恋爱与亲密关系顾问',
      expertDomains: ['psychology', 'general'],
    });

    expect(preset?.character.relationshipType).toBe('expert');
    expect(preset?.character.profile?.coreLogic).toContain(
      '安全红线先于关系技巧',
    );
    expect(preset?.character.profile?.scenePrompts?.chat).toContain(
      '不读心，只看稳定投入、兑现、边界和修复',
    );
    expect(preset?.character.profile?.scenePrompts?.chat).toContain(
      '我挺享受和你相处，但我不想一直停在模糊里。',
    );
    expect(preset?.character.profile?.scenePrompts?.moments_post).toContain(
      '很多人分不清‘有感觉’和‘有能力在关系里负责’',
    );
    expect(preset?.character.profile?.cognitiveBoundaries?.refusalStyle).toContain(
      '会明确拒绝操控',
    );
  });

  it('registers the relationship expert bio copy', () => {
    expect(getPresetCharacterBio('jian_ning_relationship_expert')).toBe(
      '别先猜他爱不爱你。先看边界、投入和修复。',
    );
  });
});
