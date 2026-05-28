// i18n-ignore-start: test fixtures — not user-facing UI.
import { CharacterSocialContextService } from './character-social-context.service';

type Like = {
  authorId: string;
  authorName: string;
  authorType?: string;
  postId: string;
  createdAt: Date;
};
type Comment = Like & { text?: string };
type Post = {
  id: string;
  authorId: string;
  authorName: string;
  authorType?: string;
};

describe('CharacterSocialContextService (Stratum C 角色互知 + 社交全景)', () => {
  function makeService(opts: {
    aiRels?: Array<{
      characterIdA: string;
      characterIdB: string;
      relationshipType?: string;
      strength?: number;
    }>;
    // friendIds：loadOwnerFriendCharacterIds 返回的交往集合（select characterId）。
    friendIds?: string[];
    // worldSocial：buildWorldSocialBlock 用（带 intimacy/lastInteractedAt）。
    worldSocial?: Array<{
      characterId: string;
      intimacyLevel?: number;
      lastInteractedAt?: Date | null;
    }>;
    likes?: Like[];
    comments?: Comment[];
    posts?: Post[];
    charNames?: Record<string, string>;
  }) {
    const tag = (kind: string) => ({ __kind: kind }) as any;
    const aiRelRepo = tag('aiRel');
    const friendshipRepo = tag('friendship');
    const momentPostRepo = tag('post');
    const momentLikeRepo = tag('like');
    const momentCommentRepo = tag('comment');

    const tenant = {
      scoped: (repo: any) => ({
        find: jest.fn(async (q: any) => {
          switch (repo.__kind) {
            case 'aiRel':
              return opts.aiRels ?? [];
            case 'friendship':
              // select characterId → 交往集合；否则 → world_social 列表。
              return q?.select
                ? (opts.friendIds ?? []).map((characterId) => ({ characterId }))
                : (opts.worldSocial ?? []);
            case 'like':
              return opts.likes ?? [];
            case 'comment':
              return opts.comments ?? [];
            case 'post':
              return opts.posts ?? [];
            default:
              return [];
          }
        }),
      }),
    } as any;
    const characters = {
      findById: jest.fn(async (id: string) =>
        opts.charNames?.[id] ? { id, name: opts.charNames[id] } : null,
      ),
    } as any;
    return new CharacterSocialContextService(
      aiRelRepo,
      friendshipRepo,
      momentPostRepo,
      momentLikeRepo,
      momentCommentRepo,
      characters,
      tenant,
    );
  }

  it('returns empty when no relationships and no friendships', async () => {
    const svc = makeService({ aiRels: [], friendIds: [], worldSocial: [] });
    await expect(svc.buildSocialContext('char-1')).resolves.toBe('');
  });

  it('returns empty for blank characterId', async () => {
    const svc = makeService({
      aiRels: [{ characterIdA: 'a', characterIdB: 'b' }],
    });
    await expect(svc.buildSocialContext('')).resolves.toBe('');
  });

  it('renders high-strength relationship even without a friendship row', async () => {
    const svc = makeService({
      aiRels: [
        {
          characterIdA: 'char-1',
          characterIdB: 'char-2',
          relationshipType: 'friend',
          strength: 70,
        },
      ],
      friendIds: [],
      charNames: { 'char-2': '小李' },
    });

    const out = await svc.buildSocialContext('char-1');
    expect(out).toContain('<character_relationships>');
    expect(out).toContain('你和 小李：朋友');
    expect(out).toContain('强度 70/100');
  });

  it('filters out low-strength template relationships the owner never engaged', async () => {
    const svc = makeService({
      aiRels: [
        // 模板噪声：强度 20、owner 从未和 char-9 交往 → 应被过滤
        {
          characterIdA: 'char-1',
          characterIdB: 'char-9',
          relationshipType: 'acquaintance',
          strength: 20,
        },
        // owner 实际交往过 char-2（在 friendIds），低强度也保留
        {
          characterIdA: 'char-1',
          characterIdB: 'char-2',
          relationshipType: 'friend',
          strength: 30,
        },
      ],
      friendIds: ['char-2'],
      charNames: { 'char-2': '小李', 'char-9': '路人模板' },
    });

    const out = await svc.buildSocialContext('char-1');
    expect(out).toContain('小李');
    expect(out).not.toContain('路人模板');
  });

  it('renders cross_character_interactions only between engaged characters', async () => {
    const day = 86_400_000;
    const svc = makeService({
      aiRels: [],
      friendIds: ['actor-1', 'target-1'], // 仅这两个是 owner 交往过的
      likes: [
        // 相关：actor-1 给 target-1 的帖点赞
        {
          authorId: 'actor-1',
          authorName: 'Alice',
          authorType: 'character',
          postId: 'p1',
          createdAt: new Date(Date.now() - 2 * day),
        },
        // 噪声：模板角色 ghost 给 target-1 点赞，ghost 不在 friendIds → 过滤
        {
          authorId: 'ghost',
          authorName: '模板',
          authorType: 'character',
          postId: 'p1',
          createdAt: new Date(Date.now() - 1 * day),
        },
      ],
      comments: [],
      posts: [
        { id: 'p1', authorId: 'target-1', authorName: 'Bob', authorType: 'character' },
      ],
      charNames: {},
    });

    const out = await svc.buildSocialContext('actor-1');
    expect(out).toContain('<cross_character_interactions>');
    expect(out).toContain('Alice 给 Bob 的朋友圈点赞');
    expect(out).not.toContain('模板');
  });

  it('drops interactions older than the 14-day window', async () => {
    const day = 86_400_000;
    const svc = makeService({
      aiRels: [],
      friendIds: ['actor-1', 'target-1'],
      likes: [
        {
          authorId: 'actor-1',
          authorName: 'Alice',
          authorType: 'character',
          postId: 'p1',
          createdAt: new Date(Date.now() - 20 * day), // 超窗
        },
      ],
      posts: [
        { id: 'p1', authorId: 'target-1', authorName: 'Bob', authorType: 'character' },
      ],
    });

    const out = await svc.buildSocialContext('actor-1');
    expect(out).not.toContain('<cross_character_interactions>');
  });

  it('renders world_social with top characters by intimacy + last interaction', async () => {
    const day = 86_400_000;
    const svc = makeService({
      aiRels: [],
      friendIds: ['c1', 'c2'],
      worldSocial: [
        { characterId: 'c1', intimacyLevel: 85, lastInteractedAt: new Date(Date.now() - day) },
        { characterId: 'c2', intimacyLevel: 60, lastInteractedAt: new Date(Date.now() - 3 * day) },
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
        { characterIdA: 'char-1', characterIdB: 'ghost-id', relationshipType: 'friend', strength: 70 },
        { characterIdA: 'char-1', characterIdB: 'char-2', relationshipType: 'friend', strength: 70 },
      ],
      friendIds: [],
      charNames: { 'char-2': '小李' }, // 'ghost-id' 不在
    });

    const out = await svc.buildSocialContext('char-1');
    expect(out).toContain('小李');
    expect(out).not.toContain('ghost-id');
  });
});
// i18n-ignore-end
