import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterFriendshipEntity } from './character-friendship.entity';
import { CharacterEntity } from '../characters/character.entity';
import { isSharedWorldMode } from '../tenancy/tenant-context';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

@Injectable()
export class CharacterFriendshipService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CharacterFriendshipService.name);

  constructor(
    @InjectRepository(CharacterFriendshipEntity)
    private readonly repo: Repository<CharacterFriendshipEntity>,
    @InjectRepository(CharacterEntity)
    private readonly charRepo: Repository<CharacterEntity>,
  ) {}

  // 租户作用域 repo：shared 模式按 ALS owner 限定（这些查询都在社交 tick / chat 的租户帧
  // 内跑）+ 复合主键写盖章；LPP 透传零变化。
  private get scoped(): TenantRepository<CharacterFriendshipEntity> {
    return new TenantRepository(this.repo);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (isSharedWorldMode()) {
      // 共享库：把 owner-blind 的 2 列 unique 索引换成含 ownerId 的 3 列版（synchronize:false
      // 不会自动建/改它，迁移 step1b 又原样重放了旧 2 列版）。否则多 owner 的同一对角色会
      // 撞 unique。结构性维护、不写租户数据，shared 启动跑一次安全。
      try {
        await this.repo.query(
          'DROP INDEX IF EXISTS "idx_character_friendship_pair"',
        );
        await this.repo.query(
          'CREATE UNIQUE INDEX IF NOT EXISTS "idx_character_friendship_pair_owner" ON "character_friendships" ("ownerId", "characterAId", "characterBId")',
        );
      } catch (error) {
        this.logger.warn(
          `ensure shared character_friendship index failed: ${(error as Error).message}`,
        );
      }
      // owner 级 character_friendship 种子改由 TenantService 首触按 owner 跑（seedNewOwner），
      // 不在共享进程 boot 全局种（无租户上下文 + 跨 owner 串号）。
      return;
    }
    try {
      await this.seedFromAiRelationships();
    } catch (error) {
      this.logger.warn(
        `Failed to seed character_friendships from aiRelationships: ${
          (error as Error).message
        }`,
      );
    }
  }

  // ownerId 传入 = 共享 world 首触按 owner 种（count/find/存在性检查按 owner 限定、每条盖
  // ownerId）。不传 = LPP/单库全局种子（行为与改造前逐字一致）。
  async seedFromAiRelationships(ownerId?: string): Promise<number> {
    const ownerWhere = ownerId ? { ownerId } : {};
    const existing = await this.repo.count({ where: ownerWhere });
    if (existing > 0) {
      return 0;
    }
    const characters = await this.charRepo.find({ where: ownerWhere });
    let inserted = 0;
    for (const char of characters) {
      const rels = char.aiRelationships ?? [];
      for (const rel of rels) {
        if (!rel?.characterId || rel.characterId === char.id) continue;
        const [a, b] = orderPair(char.id, rel.characterId);
        const exists = await this.repo.findOne({
          where: { characterAId: a, characterBId: b, ...ownerWhere },
        });
        if (exists) continue;
        const intimacy = Math.max(
          0,
          Math.min(100, Math.round((rel.strength ?? 0) * 100)),
        );
        const entity = this.repo.create({
          characterAId: a,
          characterBId: b,
          intimacy,
          relationshipType: rel.relationshipType ?? 'friend',
          ...(ownerId ? { ownerId } : {}),
        });
        await this.repo.save(entity);
        inserted += 1;
      }
    }
    if (inserted > 0) {
      this.logger.log(
        `Seeded ${inserted} character_friendships from aiRelationships`,
      );
    }
    return inserted;
  }

  async getFriendsOf(
    characterId: string,
  ): Promise<{ characterId: string; intimacy: number }[]> {
    const rows = await this.scoped.find({
      where: [{ characterAId: characterId }, { characterBId: characterId }],
    });
    return rows.map((row) => ({
      characterId:
        row.characterAId === characterId ? row.characterBId : row.characterAId,
      intimacy: row.intimacy,
    }));
  }

  async getIntimacy(a: string, b: string): Promise<number> {
    if (a === b) return 0;
    const [x, y] = orderPair(a, b);
    const row = await this.scoped.findOne({
      where: { characterAId: x, characterBId: y },
    });
    return row?.intimacy ?? 0;
  }

  async getRelation(
    a: string,
    b: string,
  ): Promise<{ intimacy: number; lastInteractedAt: Date | null }> {
    if (a === b) return { intimacy: 0, lastInteractedAt: null };
    const [x, y] = orderPair(a, b);
    const row = await this.scoped.findOne({
      where: { characterAId: x, characterBId: y },
    });
    return {
      intimacy: row?.intimacy ?? 0,
      lastInteractedAt: row?.lastInteractedAt ?? null,
    };
  }

  async bumpInteraction(a: string, b: string, delta = 0.5): Promise<void> {
    if (a === b) return;
    const [x, y] = orderPair(a, b);
    const row = await this.scoped.findOne({
      where: { characterAId: x, characterBId: y },
    });
    if (row) {
      row.intimacy = Math.max(0, Math.min(100, row.intimacy + delta));
      row.lastInteractedAt = new Date();
      // 复合主键 + scoped 行：save 按 (ownerId,id) 定位，不会覆盖其他租户的同 id 行。
      await this.scoped.save(row);
    } else {
      const fresh = this.repo.create({
        characterAId: x,
        characterBId: y,
        intimacy: Math.max(0, Math.min(100, delta)),
        relationshipType: 'acquaintance',
        lastInteractedAt: new Date(),
      });
      await this.scoped.save(fresh);
    }
  }
}
