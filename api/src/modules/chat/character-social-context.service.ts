// i18n-ignore-start: prompt content — injected into LLM system prompt, not user-facing UI.
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { FriendshipEntity } from '../social/friendship.entity';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { MomentLikeEntity } from '../moments/moment-like.entity';
import { MomentCommentEntity } from '../moments/moment-comment.entity';
import { CharactersService } from '../characters/characters.service';
import { TenantService } from '../tenancy/tenant.service';

/**
 * Stratum C — 角色互知 + 用户社交全景。
 *
 * 「单人世界中枢」第三层：让每个角色既知道**自己和其他角色的关系**（character_relationships），
 * 也知道**用户最近主要在和谁互动**（world_social）。这是让世界"有动态、不各自为战"的关键。
 *
 * 摆在 chat 模块而非 social 模块，是因为 social → chat 已存在依赖（initial-message
 * /social.service 都注入 ChatService），反向再 chat → social 会成环。chat 模块这里直接
 * 用 TypeORM 注入 AIRelationshipEntity / FriendshipEntity，加 TenantService.scoped 做
 * owner 过滤——多租户红线复用既有模式（scheduler 也是同样手法，见 scheduler.service:120）。
 *
 * 红线：所有读写 owner 过滤经 TenantService.scoped；异常吞掉返回 ''，绝不影响主聊天路径。
 */
@Injectable()
export class CharacterSocialContextService {
  private readonly logger = new Logger(CharacterSocialContextService.name);

  // 每块上限，控制注入到 prompt 的 token 体量（A 1100 + B 1000 已先占，C 这族收紧给后续块留余量）。
  private static readonly REL_MAX_LINES = 6;
  private static readonly WORLD_TOP_K = 6;
  private static readonly WORLD_MAX_CHARS = 600;
  // 跨角色互动块：近 14 天、≤4 行、≤300 字。
  private static readonly INTERACTION_MAX_LINES = 4;
  private static readonly INTERACTION_MAX_CHARS = 300;
  private static readonly INTERACTION_RECENCY_DAYS = 14;
  // strength ≥ 此值视为「实质关系」，即使 owner 还没和对方建立 friendship 也保留（剧情骨干）。
  private static readonly RELEVANT_STRENGTH_FLOOR = 60;

  constructor(
    @InjectRepository(AIRelationshipEntity)
    private readonly aiRelRepo: Repository<AIRelationshipEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    @InjectRepository(MomentLikeEntity)
    private readonly momentLikeRepo: Repository<MomentLikeEntity>,
    @InjectRepository(MomentCommentEntity)
    private readonly momentCommentRepo: Repository<MomentCommentEntity>,
    @Inject(forwardRef(() => CharactersService))
    private readonly characters: CharactersService,
    private readonly tenant: TenantService,
  ) {}

  /**
   * 按当前角色装配「我和这个世界其他角色的关系」+「用户最近的社交全景」两块。
   * 返回拼接后的字符串（可直接进 prompt），无可注入数据时返回 ''。
   */
  async buildSocialContext(characterId: string): Promise<string> {
    if (!characterId?.trim()) {
      return '';
    }
    try {
      // owner 实际交往的角色集合——用来过滤掉首触种子灌进来的上千条模板关系噪声。
      const friendIds = await this.loadOwnerFriendCharacterIds();

      const sections: string[] = [];

      const relBlock = await this.buildCharacterRelationshipsBlock(
        characterId,
        friendIds,
      );
      if (relBlock) sections.push(relBlock);

      const interactionBlock = await this.buildCrossCharacterInteractionBlock(
        characterId,
        friendIds,
      );
      if (interactionBlock) sections.push(interactionBlock);

      const worldBlock = await this.buildWorldSocialBlock();
      if (worldBlock) sections.push(worldBlock);

      return sections.join('\n\n');
    } catch (error) {
      this.logger.debug(
        `buildSocialContext skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return '';
    }
  }

  private async buildCharacterRelationshipsBlock(
    characterId: string,
    friendIds: Set<string>,
  ): Promise<string> {
    const rows = await this.tenant.scoped(this.aiRelRepo).find({
      where: [{ characterIdA: characterId }, { characterIdB: characterId }],
      take: 64, // 先拉宽点，过滤模板噪声 + 按强度排序后截 REL_MAX_LINES
    });
    if (rows.length === 0) return '';

    // 模板降噪：只保留 owner 实际交往过的对方 / 或强度够高的剧情骨干关系；
    // 否则种子灌进来的上千条模板关系会把 prompt 撑爆且全是用户没接触过的角色。
    const relevant = rows.filter((row) => {
      const otherId =
        row.characterIdA === characterId ? row.characterIdB : row.characterIdA;
      return (
        friendIds.has(otherId) ||
        (row.strength ?? 0) >=
          CharacterSocialContextService.RELEVANT_STRENGTH_FLOOR
      );
    });
    if (relevant.length === 0) return '';

    // 按 strength desc 排序
    const sorted = [...relevant].sort(
      (a, b) => (b.strength ?? 0) - (a.strength ?? 0),
    );

    const lines: string[] = [];
    for (const row of sorted.slice(
      0,
      CharacterSocialContextService.REL_MAX_LINES,
    )) {
      const otherId =
        row.characterIdA === characterId
          ? row.characterIdB
          : row.characterIdA;
      const other = await this.characters.findById(otherId);
      const otherName = other?.name?.trim();
      if (!otherName) continue; // 已删/迁移的旧角色跳过
      const typeLabel = this.relationshipTypeLabel(row.relationshipType);
      const strength = row.strength ?? 0;
      const strengthHint =
        strength > 0 ? `（强度 ${Math.round(strength)}/100）` : '';
      lines.push(`- 你和 ${otherName}：${typeLabel}${strengthHint}`);
    }

    if (lines.length === 0) return '';

    return [
      '<character_relationships>',
      '【你和这个世界其他角色的关系——自然代入，不要主动罗列关系图、也不要把强度数字念出来】',
      lines.join('\n'),
      '</character_relationships>',
    ].join('\n');
  }

  /**
   * 当前 owner 实际交往的角色 id 集合（有 friendship 行即算）。用来过滤首触种子灌进来的
   * 模板关系/互动噪声——只让用户真正接触过的角色进 prompt。取不到一律返回空集（宁可少注入）。
   */
  private async loadOwnerFriendCharacterIds(): Promise<Set<string>> {
    try {
      const rows = await this.tenant.scoped(this.friendshipRepo).find({
        select: ['characterId'],
        take: 500,
      });
      return new Set(
        rows.map((r) => r.characterId).filter((id): id is string => !!id),
      );
    } catch (error) {
      this.logger.debug(
        `loadOwnerFriendCharacterIds skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new Set();
    }
  }

  /**
   * 跨角色互动块：近 14 天里「角色 A 给角色 B 的朋友圈点赞/评论」这类世界内的社交动态，
   * 让当前角色自然知道「世界在动、别人也在彼此往来」。优先放和当前角色相关的事件，再补其他。
   * 双方都须在 owner 的交往集合里（friendIds），否则全是模板角色之间的噪声。
   */
  private async buildCrossCharacterInteractionBlock(
    characterId: string,
    friendIds: Set<string>,
  ): Promise<string> {
    if (friendIds.size === 0) return '';
    const cutoff = new Date(
      Date.now() -
        CharacterSocialContextService.INTERACTION_RECENCY_DAYS * 86_400_000,
    );

    // 近期角色发出的点赞 / 评论（authorType='character'），各拉 30 条够覆盖 14 天窗口。
    const [likes, comments] = await Promise.all([
      this.tenant.scoped(this.momentLikeRepo).find({
        where: { authorType: 'character' },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
      this.tenant.scoped(this.momentCommentRepo).find({
        where: { authorType: 'character' },
        order: { createdAt: 'DESC' },
        take: 30,
      }),
    ]);
    if (likes.length === 0 && comments.length === 0) return '';

    // 批量取相关 post 的作者，避免 N+1。
    const postIds = Array.from(
      new Set([
        ...likes.map((l) => l.postId),
        ...comments.map((c) => c.postId),
      ]),
    );
    const posts = await this.loadPostsByIds(postIds);

    type Interaction = {
      at: number;
      actorId: string;
      actorName: string;
      targetId: string;
      targetName: string;
      verb: string;
      detail?: string;
    };
    const candidates: Interaction[] = [];

    const pushIfRelevant = (
      at: Date | undefined,
      actorId: string,
      actorName: string | undefined,
      postId: string,
      verb: string,
      detail?: string,
    ) => {
      if (!at || at < cutoff) return;
      const post = posts.get(postId);
      if (!post || post.authorType !== 'character') return;
      const targetId = post.authorId;
      if (!targetId || targetId === actorId) return; // 自赞自评不算互动
      // 双方都须是 owner 交往过的角色，否则是模板角色之间的背景噪声。
      if (!friendIds.has(actorId) || !friendIds.has(targetId)) return;
      const a = actorName?.trim();
      const t = post.authorName?.trim();
      if (!a || !t) return;
      candidates.push({
        at: at.getTime(),
        actorId,
        actorName: a,
        targetId,
        targetName: t,
        verb,
        detail,
      });
    };

    for (const l of likes) {
      pushIfRelevant(l.createdAt, l.authorId, l.authorName, l.postId, '点赞');
    }
    for (const c of comments) {
      const snippet = c.text?.trim().slice(0, 18);
      pushIfRelevant(
        c.createdAt,
        c.authorId,
        c.authorName,
        c.postId,
        '评论',
        snippet,
      );
    }
    if (candidates.length === 0) return '';

    // 排序：和当前角色相关的优先，再按时间倒序。去重同一对 + 同 verb。
    candidates.sort((x, y) => {
      const xr = x.actorId === characterId || x.targetId === characterId ? 1 : 0;
      const yr = y.actorId === characterId || y.targetId === characterId ? 1 : 0;
      if (xr !== yr) return yr - xr;
      return y.at - x.at;
    });

    const seen = new Set<string>();
    const lines: string[] = [];
    for (const c of candidates) {
      if (lines.length >= CharacterSocialContextService.INTERACTION_MAX_LINES) {
        break;
      }
      const key = `${c.actorId}>${c.targetId}:${c.verb}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const when = this.relativeDayLabel(c.at);
      const whenHint = when ? `${when}，` : '';
      const detailHint =
        c.verb === '评论' && c.detail ? `（"${c.detail}…"）` : '';
      lines.push(
        `- ${whenHint}${c.actorName} 给 ${c.targetName} 的朋友圈${c.verb}${detailHint}`,
      );
    }
    if (lines.length === 0) return '';

    const body = this.truncate(
      lines.join('\n'),
      CharacterSocialContextService.INTERACTION_MAX_CHARS,
    );

    return [
      '<cross_character_interactions>',
      '【这个世界里其他角色最近的往来——自然知晓即可，不要复述、不要当八卦逐条转告用户】',
      body,
      '</cross_character_interactions>',
    ].join('\n');
  }

  private async loadPostsByIds(
    postIds: string[],
  ): Promise<Map<string, MomentPostEntity>> {
    const map = new Map<string, MomentPostEntity>();
    if (postIds.length === 0) return map;
    const posts = await this.tenant.scoped(this.momentPostRepo).find({
      where: { id: In(postIds) },
    });
    for (const p of posts) map.set(p.id, p);
    return map;
  }

  private async buildWorldSocialBlock(): Promise<string> {
    const rows = await this.tenant.scoped(this.friendshipRepo).find({
      order: { intimacyLevel: 'DESC', lastInteractedAt: 'DESC' },
      take: CharacterSocialContextService.WORLD_TOP_K * 2,
    });
    if (rows.length === 0) return '';

    const lines: string[] = [];
    for (const row of rows) {
      if (lines.length >= CharacterSocialContextService.WORLD_TOP_K) break;
      const c = await this.characters.findById(row.characterId);
      const name = c?.name?.trim();
      if (!name) continue;
      const intimacy = row.intimacyLevel ?? 0;
      const recency = row.lastInteractedAt
        ? this.relativeDayLabel(row.lastInteractedAt.getTime())
        : '';
      const recencyHint = recency ? `，上次互动 ${recency}` : '';
      lines.push(`- ${name}（亲密度 ${intimacy}${recencyHint}）`);
    }

    if (lines.length === 0) return '';

    const body = this.truncate(
      lines.join('\n'),
      CharacterSocialContextService.WORLD_MAX_CHARS,
    );

    return [
      '<world_social>',
      '【这个用户最近的社交全景——其他角色也在以各自方式服务 Ta；你可以自然地提到、',
      '避免冲突或重复，但不要刻意比较或评判其他角色】',
      body,
      '</world_social>',
    ].join('\n');
  }

  private relationshipTypeLabel(raw?: string): string {
    const t = (raw ?? 'acquaintance').toLowerCase();
    if (t === 'friend') return '朋友';
    if (t === 'close' || t === 'best') return '挚友';
    if (t === 'rival') return '对手 / 较量关系';
    if (t === 'mentor') return '师徒 / 引路人关系';
    if (t === 'romantic') return '伴侣 / 暧昧关系';
    if (t === 'acquaintance') return '点头之交';
    return raw ?? '认识';
  }

  private relativeDayLabel(occurredAtMs: number): string {
    const diffMs = Date.now() - occurredAtMs;
    if (diffMs < 0) return '刚刚';
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) {
      const hours = Math.floor(diffMs / 3_600_000);
      if (hours <= 0) return '刚刚';
      return `${hours}小时前`;
    }
    if (days === 1) return '昨天';
    if (days <= 7) return `${days}天前`;
    if (days <= 30) return `${Math.floor(days / 7)}周前`;
    return `${Math.floor(days / 30)}个月前`;
  }

  private truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
  }
}
// i18n-ignore-end
