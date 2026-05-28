// i18n-ignore-start: prompt content — injected into LLM system prompt, not user-facing UI.
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AIRelationshipEntity } from '../social/ai-relationship.entity';
import { FriendshipEntity } from '../social/friendship.entity';
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

  // 每块上限，控制注入到 prompt 的 token 体量。
  private static readonly REL_MAX_LINES = 8;
  private static readonly WORLD_TOP_K = 6;
  private static readonly WORLD_MAX_CHARS = 700;

  constructor(
    @InjectRepository(AIRelationshipEntity)
    private readonly aiRelRepo: Repository<AIRelationshipEntity>,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
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
      const sections: string[] = [];

      const relBlock = await this.buildCharacterRelationshipsBlock(characterId);
      if (relBlock) sections.push(relBlock);

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
  ): Promise<string> {
    const rows = await this.tenant.scoped(this.aiRelRepo).find({
      where: [{ characterIdA: characterId }, { characterIdB: characterId }],
      take: 32, // 先拉宽点，按强度排序后截 REL_MAX_LINES
    });
    if (rows.length === 0) return '';

    // 按 strength desc 排序
    const sorted = [...rows].sort(
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
