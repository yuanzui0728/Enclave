import { DataSource } from 'typeorm';
import { CharacterEntity } from '../modules/characters/character.entity';
import { AIRelationshipEntity } from '../modules/social/ai-relationship.entity';

export async function ensureAiRelationshipSeed(dataSource: DataSource): Promise<void> {
  const charRepo = dataSource.getRepository(CharacterEntity);
  const aiRelationshipRepo = dataSource.getRepository(AIRelationshipEntity);
  const existingCount = await aiRelationshipRepo.count();

  if (existingCount > 0) {
    console.log('AI relationships already seeded, skipping relationship seed.');
    return;
  }

  const characters = await charRepo.find();
  const byCity = new Map<string, CharacterEntity[]>();

  for (const character of characters) {
    const city = getCharacterCity(character.id);
    if (!city) {
      continue;
    }

    const current = byCity.get(city) ?? [];
    current.push(character);
    byCity.set(city, current);
  }

  const relationships: AIRelationshipEntity[] = [];
  for (const cityCharacters of byCity.values()) {
    for (let index = 0; index < cityCharacters.length; index += 1) {
      for (let inner = index + 1; inner < cityCharacters.length; inner += 1) {
        const left = cityCharacters[index];
        const right = cityCharacters[inner];
        if (!left || !right) {
          continue;
        }

        const [characterIdA, characterIdB] = [left.id, right.id].sort();
        relationships.push(aiRelationshipRepo.create({
          characterIdA,
          characterIdB,
          relationshipType: 'acquaintance',
          strength: 32,
          backstory: 'They were already acquainted through the same city social circle.',
        }));
      }
    }
  }

  if (!relationships.length) {
    return;
  }

  await aiRelationshipRepo.save(relationships);
  console.log(`Seeded ${relationships.length} AI relationships`);
}

function getCharacterCity(characterId: string): string | null {
  const segments = characterId.split('-');
  if (segments.length < 3) {
    return null;
  }

  return segments[1] ?? null;
}
