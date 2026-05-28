// i18n-ignore-start: test fixtures — not user-facing UI.
import { CharacterSocialContextService } from './character-social-context.service';

describe('CharacterSocialContextService (Stratum C 角色互知 + 社交全景)', () => {
  function makeService(opts: {
    aiRels?: Array<{
      characterIdA: string;
      characterIdB: string;
      relationshipType?: string;
      strength?: number;
    }>;
    friendships?: Array<{
      characterId: string;
      intimacyLevel?: number;
      lastInteractedAt?: Date | null;
    }>;
    charNames?: Record<string, string>;
  }) {
    const tenant = {
      scoped: (_repo: unknown) => ({
        find: jest.fn(async (q: any) => {
          // 简单 dispatch：where 含 characterIdA → 视为 aiRels 查询;否则视为 friendship 查询。
          const w = Array.isArray(q?.where) ? q.where[0] : q?.where;
          if (w && ('characterIdA' in w || 'characterIdB' in w)) {
            return opts.aiRels ?? [];
          }
          return opts.friendships ?? [];
        }),
      }),
    } as any;
    const characters = {
      findById: jest.fn(async (id: string) =>
        opts.charNames?.[id] ? { id, name: opts.charNames[id] } : null,
      ),
    } as any;
    return new CharacterSocialContextService(
      {} as any, // aiRelRepo (unused; tenant.scoped wraps it)
      {} as any, // friendshipRepo
      characters,
      tenant,
    );
  }

  it('returns empty when no relationships and no friendships', async () => {
    const svc = makeService({ aiRels: [], friendships: [] });
    await expect(svc.buildSocialContext('char-1')).resolves.toBe('');
  });

  it('returns empty for blank characterId', async () => {
    const svc = makeService({ aiRels: [{ characterIdA: 'a', characterIdB: 'b' }] });
    await expect(svc.buildSocialContext('')).resolves.toBe('');
  });

  it('renders character_relationships with type label + strength for current actor', async () => {
    const svc = makeService({
      aiRels: [
        {
          characterIdA: 'char-1',
          characterIdB: 'char-2',
          relationshipType: 'friend',
          strength: 70,
        },
        {
          characterIdA: 'char-3',
          characterIdB: 'char-1',
          relationshipType: 'mentor',
          strength: 50,
        },
      ],
      friendships: [],
      charNames: { 'char-2': '小李', 'char-3': '工程教练' },
    });

    const out = await svc.buildSocialContext('char-1');
    expect(out).toContain('<character_relationships>');
    expect(out).toContain('你和 小李：朋友');
    expect(out).toContain('强度 70/100');
    expect(out).toContain('你和 工程教练：师徒');
  });

  it('renders world_social with top characters by intimacy + last interaction', async () => {
    const day = 86_400_000;
    const svc = makeService({
      aiRels: [],
      friendships: [
        {
          characterId: 'c1',
          intimacyLevel: 85,
          lastInteractedAt: new Date(Date.now() - day),
        },
        {
          characterId: 'c2',
          intimacyLevel: 60,
          lastInteractedAt: new Date(Date.now() - 3 * day),
        },
      ],
      charNames: { c1: 'Alice', c2: 'Bob' },
    });

    const out = await svc.buildSocialContext('any-char');
    expect(out).toContain('<world_social>');
    expect(out).toContain('Alice（亲密度 85，上次互动 昨天）');
    expect(out).toContain('Bob（亲密度 60，上次互动 3天前）');
  });

  it('skips relationships pointing to deleted characters', async () => {
    const svc = makeService({
      aiRels: [
        { characterIdA: 'char-1', characterIdB: 'ghost-id', relationshipType: 'friend' },
        { characterIdA: 'char-1', characterIdB: 'char-2', relationshipType: 'friend' },
      ],
      friendships: [],
      charNames: { 'char-2': '小李' }, // 'ghost-id' 不在
    });

    const out = await svc.buildSocialContext('char-1');
    expect(out).toContain('小李');
    expect(out).not.toContain('ghost-id');
  });
});
// i18n-ignore-end
