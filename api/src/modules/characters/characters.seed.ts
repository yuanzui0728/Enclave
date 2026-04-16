import { DataSource } from 'typeorm';
import { CharacterEntity } from './character.entity';

const TEMPLATE_CHARACTERS: Partial<CharacterEntity>[] = [];

export async function seedCharacters(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(CharacterEntity);
  const count = await repo.count();
  if (count > 0) return;
  await repo.save(TEMPLATE_CHARACTERS as CharacterEntity[]);
}
