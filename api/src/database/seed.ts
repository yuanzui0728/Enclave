import { DataSource } from 'typeorm';
import { applyPersistentNaturalDialogueProfile } from '../modules/ai/prompt-naturalness';
import { CharacterEntity } from '../modules/characters/character.entity';
import {
  getPresetCharacterBio,
  isLegacyPresetCharacterBio,
} from '../modules/characters/character-bios';
import { buildDefaultCharacters } from '../modules/characters/default-characters';
import { listCelebrityCharacterPresets } from '../modules/characters/celebrity-character-presets';

const SEED_CHARACTERS = buildDefaultCharacters().map((character) => ({
  ...character,
  profile: character.profile
    ? applyPersistentNaturalDialogueProfile(character.profile)
    : character.profile,
}));

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
  let refreshedProfiles = 0;
  for (const preset of presets) {
    const materializedProfile = preset.character.profile
      ? applyPersistentNaturalDialogueProfile(preset.character.profile)
      : preset.character.profile;

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
          profile: materializedProfile,
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
    const nextProfile = existing.profile
      ? applyPersistentNaturalDialogueProfile(existing.profile)
      : materializedProfile;
    const patch: Partial<CharacterEntity> = {};
    if (
      presetBio &&
      (!existing.bio?.trim() ||
        isLegacyPresetCharacterBio(preset.presetKey, existing.bio))
    ) {
      patch.bio = presetBio;
      refreshedBios++;
    }
    if (
      nextProfile &&
      JSON.stringify(nextProfile) !== JSON.stringify(existing.profile ?? null)
    ) {
      patch.profile = nextProfile;
      refreshedProfiles++;
    }
    if (Object.keys(patch).length > 0) {
      await repo.update({ id: existing.id }, patch);
    }
  }
  if (seeded > 0) {
    console.log(`✓ Auto-seeded ${seeded} celebrity preset characters`);
  }
  if (refreshedBios > 0) {
    console.log(`✓ Refreshed ${refreshedBios} built-in preset bios`);
  }
  if (refreshedProfiles > 0) {
    console.log(
      `✓ Refreshed ${refreshedProfiles} built-in preset reply profiles`,
    );
  }
}
