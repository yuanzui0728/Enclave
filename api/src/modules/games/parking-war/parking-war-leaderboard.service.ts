// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharactersService } from '../../characters/characters.service';
import { ParkingWarNpcStateEntity } from './entities/parking-war-npc-state.entity';
import { ParkingWarPlayerStateEntity } from './entities/parking-war-player-state.entity';
import {
  PARKING_WAR_EXCLUDED_CHARACTER_IDS,
  PARKING_WAR_LEADERBOARD_TOTAL_WEIGHT_BP,
} from './parking-war.constants';
import type {
  ParkingWarCarTier,
  ParkingWarLeaderboardRow,
  ParkingWarOwnedCar,
  ParkingWarRarity,
} from './parking-war.types';

@Injectable()
export class ParkingWarLeaderboardService {
  constructor(
    @InjectRepository(ParkingWarPlayerStateEntity)
    private readonly playerRepo: Repository<ParkingWarPlayerStateEntity>,
    @InjectRepository(ParkingWarNpcStateEntity)
    private readonly npcRepo: Repository<ParkingWarNpcStateEntity>,
    private readonly charactersService: CharactersService,
  ) {}

  /**
   * scope:
   *   'global'  — 所有玩家 + 所有 NPC（按 score 排）
   *   'friends' — 当前玩家 + 自己 world 里的 NPC（默认 50 行）
   */
  async getRichBoard(
    ownerId: string,
    scope: 'global' | 'friends',
    limit: number = 50,
  ): Promise<ParkingWarLeaderboardRow[]> {
    // 共享 world：用户间不互通，连 scope='global' 也只能是「当前 owner 自己世界的全部」，
    // 不能跨租户 find(undefined)（那会串到别人的玩家/NPC）。两个 scope 都按 ownerId 限定；
    // 'friends' 与 'global' 的差异由后续 friended 过滤体现，不在此处放开租户边界。
    const players = await this.playerRepo.find({ where: { ownerId } });
    const npcs = await this.npcRepo.find({ where: { ownerId } });

    const rows: Array<ParkingWarLeaderboardRow & { score: number }> = [];

    for (const p of players) {
      rows.push({
        rank: 0,
        actorKind: 'player',
        actorId: p.ownerId,
        actorName: scope === 'friends' ? '我' : `世界主人 ${p.ownerId.slice(-4)}`,
        actorAvatar: null,
        balanceCents: p.balanceCents,
        totalEarnedCents: p.totalEarnedCents,
        topCarTier: topCarTier(p.ownedCarsPayload),
        topCarRarity: topCarRarity(p.ownedCarsPayload),
        score: scoreOf(p.balanceCents, p.totalEarnedCents),
      });
    }

    if (npcs.length > 0) {
      // 只取玩家可见的角色 —— 隐藏 / 已删除 / 系统角色（"我自己" 等）
      // 不该出现在榜单上；旧版本走 findManyByIds 不带 visibility，让玩家
      // 排名看着比实际差几倍（202 NPC 中只有 ~50 个可见）
      const visibleChars =
        await this.charactersService.findAllVisibleToOwner(ownerId);
      const charMap = new Map(
        visibleChars
          .filter((c) => !PARKING_WAR_EXCLUDED_CHARACTER_IDS.has(c.id))
          .map((c) => [c.id, c]),
      );
      for (const n of npcs) {
        const ch = charMap.get(n.characterId);
        if (!ch) continue;
        rows.push({
          rank: 0,
          actorKind: 'npc',
          actorId: n.characterId,
          actorName: ch.name,
          actorAvatar: ch.avatar ?? null,
          balanceCents: n.balanceCents,
          totalEarnedCents: n.totalEarnedCents,
          topCarTier: topCarTier(n.ownedCarsPayload),
          topCarRarity: topCarRarity(n.ownedCarsPayload),
          score: scoreOf(n.balanceCents, n.totalEarnedCents),
        });
      }
    }

    rows.sort((a, b) => b.score - a.score);
    // 先把所有行排名再 slice —— 否则 NPC 启动余额 ¥5000+，新玩家排不进
    // top-N 就完全消失在榜单里。先给所有人 rank，再按需保留自己 + 前 N。
    const ranked = rows.map((r, idx) => {
      const { score: _drop, ...rest } = r;
      return { ...rest, rank: idx + 1 };
    });
    const top = ranked.slice(0, limit);
    const selfIdx = ranked.findIndex(
      (r) => r.actorKind === 'player' && r.actorId === ownerId,
    );
    if (selfIdx >= 0 && selfIdx >= limit) {
      // 自己掉出 top-N，把自己拼到末尾让前端能看见自己的真实名次
      return [...top, ranked[selfIdx]];
    }
    return top;
  }
}

function scoreOf(balanceCents: number, totalEarnedCents: number): number {
  return balanceCents + (totalEarnedCents * PARKING_WAR_LEADERBOARD_TOTAL_WEIGHT_BP) / 10_000;
}

function topCarTier(
  cars: ParkingWarOwnedCar[] | null | undefined,
): ParkingWarCarTier | null {
  const top = sortCarsByValue(cars)[0];
  return top?.tier ?? null;
}

function topCarRarity(
  cars: ParkingWarOwnedCar[] | null | undefined,
): ParkingWarRarity | null {
  const top = sortCarsByValue(cars)[0];
  return top?.rarity ?? null;
}

function sortCarsByValue(
  cars: ParkingWarOwnedCar[] | null | undefined,
): ParkingWarOwnedCar[] {
  if (!cars || cars.length === 0) return [];
  const tierRank = (t: ParkingWarCarTier) =>
    ['starter', 'family', 'business', 'performance', 'luxury', 'super'].indexOf(t);
  const rarityRank = (r: ParkingWarRarity) =>
    ['common', 'rare', 'epic', 'legend'].indexOf(r);
  return [...cars].sort(
    (a, b) =>
      rarityRank(b.rarity) - rarityRank(a.rarity) ||
      tierRank(b.tier) - tierRank(a.tier) ||
      b.level - a.level,
  );
}
// i18n-ignore-end
