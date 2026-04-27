import { DataSource } from 'typeorm';
import { applyPersistentNaturalDialogueProfile } from '../modules/ai/prompt-naturalness';
import { CharacterEntity } from '../modules/characters/character.entity';
import {
  getPresetCharacterBio,
  isLegacyPresetCharacterBio,
} from '../modules/characters/character-bios';
import { buildDefaultCharacters } from '../modules/characters/default-characters';
import { HOTEL_EXPERT_CHARACTER_ID } from '../modules/characters/hotel-expert-character';
import {
  listBuiltInCharacterPresets,
  shouldAutoSeedBuiltInCharacterPreset,
} from '../modules/characters/built-in-character-presets';
import { SystemConfigEntity } from '../modules/config/config.entity';
import { FriendshipEntity } from '../modules/social/friendship.entity';

const HOTEL_EXPERT_DEFAULT_FRIENDSHIP_RETIREMENT_KEY =
  'hotel_expert_default_friendship_retired_at';

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
    if (existing.deletionPolicy !== 'archive_allowed') {
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

  await retireHotelExpertDefaultFriendship(dataSource);
}

async function retireHotelExpertDefaultFriendship(dataSource: DataSource) {
  const configRepo = dataSource.getRepository(SystemConfigEntity);
  const alreadyRetired = await configRepo.findOneBy({
    key: HOTEL_EXPERT_DEFAULT_FRIENDSHIP_RETIREMENT_KEY,
  });
  if (alreadyRetired) {
    return;
  }

  const friendshipRepo = dataSource.getRepository(FriendshipEntity);
  const result = await friendshipRepo
    .createQueryBuilder()
    .update(FriendshipEntity)
    .set({
      status: 'removed',
      isStarred: false,
      starredAt: null,
    })
    .where('characterId = :characterId', {
      characterId: HOTEL_EXPERT_CHARACTER_ID,
    })
    .andWhere('status = :status', { status: 'friend' })
    .andWhere('intimacyLevel = :intimacyLevel', { intimacyLevel: 60 })
    .andWhere('isStarred = :isStarred', { isStarred: false })
    .andWhere('starredAt IS NULL')
    .andWhere('(remarkName IS NULL OR TRIM(remarkName) = :emptyText)', {
      emptyText: '',
    })
    .andWhere('(region IS NULL OR TRIM(region) = :emptyText)', {
      emptyText: '',
    })
    .andWhere('(source IS NULL OR TRIM(source) = :emptyText)', {
      emptyText: '',
    })
    .andWhere('(tags IS NULL OR tags = :emptyTags)', { emptyTags: '[]' })
    .andWhere('lastInteractedAt IS NULL')
    .execute();

  await configRepo.save(
    configRepo.create({
      key: HOTEL_EXPERT_DEFAULT_FRIENDSHIP_RETIREMENT_KEY,
      value: new Date().toISOString(),
    }),
  );

  if (result.affected && result.affected > 0) {
    console.log(
      `✓ Retired ${result.affected} auto-created hotel expert friendship records`,
    );
  }
}
