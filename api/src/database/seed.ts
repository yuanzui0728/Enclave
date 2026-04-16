import { DataSource } from 'typeorm';
import { CharacterEntity } from '../modules/characters/character.entity';
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
    }
  }
  if (seeded > 0) {
    console.log(`✓ Auto-seeded ${seeded} celebrity preset characters`);
  }
}
