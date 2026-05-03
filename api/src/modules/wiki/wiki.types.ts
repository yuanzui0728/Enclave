import type { WikiContentSnapshot } from './entities/character-revision.entity';

export const WIKI_CONTENT_FIELDS = [
  'name',
  'avatar',
  'bio',
  'personality',
  'expertDomains',
  'triggerScenes',
  'relationship',
  'relationshipType',
] as const;

export type WikiContentField = (typeof WIKI_CONTENT_FIELDS)[number];

export function pickWikiContent(input: Record<string, unknown>): WikiContentSnapshot {
  return {
    name: String(input.name ?? '').trim(),
    avatar: String(input.avatar ?? '').trim(),
    bio: String(input.bio ?? '').trim(),
    personality:
      input.personality === undefined || input.personality === null
        ? undefined
        : String(input.personality),
    expertDomains: Array.isArray(input.expertDomains)
      ? (input.expertDomains as unknown[]).map((v) => String(v))
      : [],
    triggerScenes: Array.isArray(input.triggerScenes)
      ? (input.triggerScenes as unknown[]).map((v) => String(v))
      : undefined,
    relationship: String(input.relationship ?? '').trim(),
    relationshipType: String(input.relationshipType ?? '').trim(),
  };
}

export function snapshotFromCharacter(char: Record<string, unknown>): WikiContentSnapshot {
  return pickWikiContent(char);
}

export function diffFields(
  before: WikiContentSnapshot,
  after: WikiContentSnapshot,
): WikiContentField[] {
  const changed: WikiContentField[] = [];
  for (const key of WIKI_CONTENT_FIELDS) {
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) changed.push(key);
  }
  return changed;
}
