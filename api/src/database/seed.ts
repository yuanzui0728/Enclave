import { DataSource } from 'typeorm';
import { CharacterEntity } from '../modules/characters/character.entity';
import { buildDefaultCharacters } from '../modules/characters/default-characters';

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
}
