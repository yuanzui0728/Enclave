import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharactersService } from '../../characters/characters.service';
import { FarmNpcStateEntity } from './entities/farm-npc-state.entity';
import { FarmPlayerStateEntity } from './entities/farm-player-state.entity';
import {
  FarmLeaderboardEntry,
  FarmLeaderboardType,
  FarmLeaderboardView,
} from './farm.types';

@Injectable()
export class FarmLeaderboardService {
  constructor(
    @InjectRepository(FarmPlayerStateEntity)
    private readonly playerRepo: Repository<FarmPlayerStateEntity>,
    @InjectRepository(FarmNpcStateEntity)
    private readonly npcRepo: Repository<FarmNpcStateEntity>,
    private readonly charactersService: CharactersService,
  ) {}

  async getLeaderboard(
    ownerId: string,
    type: FarmLeaderboardType,
    limit = 30,
  ): Promise<FarmLeaderboardView> {
    const player = await this.playerRepo.findOneBy({ ownerId });
    const npcs = await this.npcRepo.find();
    const characterIds = npcs.map((n) => n.characterId);
    // 之前对每个 NPC 都 findById 一次 — 145 个角色就是 145 次 SQL，
    // 排行榜 / 邻居列表本来是热路径（leaderboard sheet 一开就触发 3 tab + neighbor 列表）。
    // findManyByIds 走一次 WHERE id IN (...) ，量级降一个数量级。
    const characters = await this.charactersService.findManyByIds(characterIds);
    const characterById = new Map(characters.map((c) => [c.id, c]));

    // 拼成统一 entry 数组
    const entries: Omit<FarmLeaderboardEntry, 'rank'>[] = [];
    if (player) {
      entries.push({
        isOwner: true,
        characterId: null,
        name: '我',
        avatar: null,
        level: player.level,
        totalHarvested: player.totalHarvested ?? 0,
        coins: player.coins,
      });
    }
    for (const npc of npcs) {
      const character = characterById.get(npc.characterId);
      if (!character) continue;
      entries.push({
        isOwner: false,
        characterId: npc.characterId,
        name: character.name,
        avatar: character.avatar ?? null,
        level: npc.level,
        totalHarvested: npc.totalHarvested ?? 0,
        coins: npc.coins,
        intimacyLevel: character.intimacyLevel ?? 0,
      });
    }

    entries.sort((a, b) => {
      const av = pickMetric(a, type);
      const bv = pickMetric(b, type);
      if (bv !== av) return bv - av;
      // tiebreaker：等级高 > 总收 > 金币
      if (b.level !== a.level) return b.level - a.level;
      if ((b.totalHarvested ?? 0) !== (a.totalHarvested ?? 0))
        return (b.totalHarvested ?? 0) - (a.totalHarvested ?? 0);
      return b.coins - a.coins;
    });

    const ranked: FarmLeaderboardEntry[] = entries.map((e, i) => ({
      ...e,
      rank: i + 1,
    }));

    const ownerEntry = ranked.find((e) => e.isOwner);
    const ownerRank = ownerEntry?.rank ?? 0;

    return {
      type,
      generatedAt: new Date().toISOString(),
      entries: ranked.slice(0, limit),
      ownerRank,
    };
  }
}

function pickMetric(
  entry: Omit<FarmLeaderboardEntry, 'rank'>,
  type: FarmLeaderboardType,
): number {
  if (type === 'level') return entry.level;
  if (type === 'harvest') return entry.totalHarvested ?? 0;
  return entry.coins;
}
