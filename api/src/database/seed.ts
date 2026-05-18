import { DataSource } from 'typeorm';
import { applyPersistentNaturalDialogueProfile } from '../modules/ai/prompt-naturalness';
import { CharacterEntity } from '../modules/characters/character.entity';
import {
  getPresetCharacterBio,
  isLegacyPresetCharacterBio,
} from '../modules/characters/character-bios';
import {
  buildDefaultCharacters,
  DEFAULT_CHARACTER_IDS,
} from '../modules/characters/default-characters';
import {
  listBuiltInCharacterPresets,
  shouldAutoSeedBuiltInCharacterPreset,
} from '../modules/characters/built-in-character-presets';

const DEFAULT_CHARACTER_ID_SET = new Set<string>(DEFAULT_CHARACTER_IDS);

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

  // 自动确保允许初始化的内置目录角色存在；可选目录角色保留给手动安装/懒安装。
  const presets = listBuiltInCharacterPresets().filter(
    shouldAutoSeedBuiltInCharacterPreset,
  );
  const repo = dataSource.getRepository(CharacterEntity);
  let seeded = 0;
  let refreshedBios = 0;
  let refreshedProfiles = 0;
  let refreshedMetadata = 0;
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
    if (existing.sourceType !== 'preset_catalog') {
      patch.sourceType = 'preset_catalog';
    }
    if (existing.sourceKey !== preset.presetKey) {
      patch.sourceKey = preset.presetKey;
    }
    // 在 DEFAULT_CHARACTER_IDS 内的预设角色保留 'protected'（和老牌默认好友一致），
    // 不要被这条 preset auto-seed 修补又拽回 archive_allowed。
    if (
      !DEFAULT_CHARACTER_ID_SET.has(existing.id) &&
      existing.deletionPolicy !== 'archive_allowed'
    ) {
      patch.deletionPolicy = 'archive_allowed';
    }
    if (existing.isTemplate !== false) {
      patch.isTemplate = false;
    }
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
    const presetRegion = preset.character.region?.trim();
    if (presetRegion && (existing.region ?? '').trim() !== presetRegion) {
      patch.region = presetRegion;
    }
    if (Object.keys(patch).length > 0) {
      await repo.update({ id: existing.id }, patch);
      if (
        patch.sourceType !== undefined ||
        patch.sourceKey !== undefined ||
        patch.deletionPolicy !== undefined ||
        patch.isTemplate !== undefined
      ) {
        refreshedMetadata++;
      }
    }
  }
  if (seeded > 0) {
    console.log(`✓ Auto-seeded ${seeded} built-in catalog characters`);
  }
  if (refreshedBios > 0) {
    console.log(`✓ Refreshed ${refreshedBios} built-in preset bios`);
  }
  if (refreshedProfiles > 0) {
    console.log(
      `✓ Refreshed ${refreshedProfiles} built-in preset reply profiles`,
    );
  }
  if (refreshedMetadata > 0) {
    console.log(`✓ Canonicalized ${refreshedMetadata} built-in preset records`);
  }

  await dataSource.query(
    `UPDATE friendships
       SET region = (
         SELECT region FROM characters
          WHERE characters.id = friendships.characterId
       )
     WHERE (region IS NULL OR region = '')
       AND EXISTS (
         SELECT 1 FROM characters c
          WHERE c.id = friendships.characterId
            AND c.region IS NOT NULL
            AND c.region <> ''
       )`,
  );
  console.log('✓ Backfilled friendship.region from character.region');
}
