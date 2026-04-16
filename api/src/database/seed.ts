import { DataSource } from 'typeorm';
import { CharacterEntity } from '../modules/characters/character.entity';
import {
  getPresetCharacterBio,
  isLegacyPresetCharacterBio,
} from '../modules/characters/character-bios';
import { buildDefaultCharacters } from '../modules/characters/default-characters';
import { listCelebrityCharacterPresets } from '../modules/characters/celebrity-character-presets';

const SEED_CHARACTERS = buildDefaultCharacters();

export async function seedCharacters(dataSource: DataSource): Promise<void> {
  console.log('🌱 Reconciling built-in default characters...');

  await dataSource.transaction(async (manager) => {
    const characterRepo = manager.getRepository(CharacterEntity);
    for (const charData of SEED_CHARACTERS) {
      await characterRepo.save(charData as CharacterEntity);
    }
  });

  console.log(
    `✓ Reconciled ${SEED_CHARACTERS.length} built-in characters without touching custom characters`,
  );

  // 自动确保所有预置名人角色存在
  const presets = listCelebrityCharacterPresets();
  const repo = dataSource.getRepository(CharacterEntity);
  let seeded = 0;
  let refreshedBios = 0;
  for (const preset of presets) {
    const existing = await repo.findOne({
      where: [
        { id: preset.id },
        { sourceType: 'preset_catalog', sourceKey: preset.presetKey },
      ],
    });
    if (!existing) {
      await repo.save(
        repo.create({
          ...preset.character,
          id: preset.id,
          sourceType: 'preset_catalog',
          sourceKey: preset.presetKey,
          deletionPolicy: 'archive_allowed',
          isTemplate: false,
        }),
      );
      seeded++;
      continue;
    }

    const presetBio = getPresetCharacterBio(preset.presetKey);
    if (
      presetBio &&
      (!existing.bio?.trim() ||
        isLegacyPresetCharacterBio(preset.presetKey, existing.bio))
    ) {
      await repo.update({ id: existing.id }, { bio: presetBio });
      refreshedBios++;
    }
  }
  if (seeded > 0) {
    console.log(`✓ Auto-seeded ${seeded} celebrity preset characters`);
  }
  if (refreshedBios > 0) {
    console.log(`✓ Refreshed ${refreshedBios} built-in preset bios`);
  }
}
