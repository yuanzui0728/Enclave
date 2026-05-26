// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/app-error.exception';
import { CharacterEntity } from '../../characters/character.entity';
import { CharactersService } from '../../characters/characters.service';
import { ParkingWarNpcStateEntity } from './entities/parking-war-npc-state.entity';
import { ParkingWarOccupancyEntity } from './entities/parking-war-occupancy.entity';
import { ParkingWarEventService } from './parking-war-event.service';
import {
  PARKING_WAR_DEFAULT_BALANCE_CENTS,
  PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP,
  PARKING_WAR_DEFAULT_LOT_SIZE,
  PARKING_WAR_DEFAULT_LOT_SURFACE,
  PARKING_WAR_EXCLUDED_CHARACTER_IDS,
} from './parking-war.constants';
import type {
  ParkingWarCarTier,
  ParkingWarHomeSlot,
  ParkingWarLotSurface,
  ParkingWarNeighborDetail,
  ParkingWarNeighborSummary,
  ParkingWarOccupancyView,
  ParkingWarOwnedCar,
  ParkingWarRarity,
} from './parking-war.types';

@Injectable()
export class ParkingWarNeighborService {
  private readonly logger = new Logger(ParkingWarNeighborService.name);

  constructor(
    @InjectRepository(ParkingWarNpcStateEntity)
    private readonly npcRepo: Repository<ParkingWarNpcStateEntity>,
    @InjectRepository(ParkingWarOccupancyEntity)
    private readonly occupancyRepo: Repository<ParkingWarOccupancyEntity>,
    private readonly charactersService: CharactersService,
    private readonly eventService: ParkingWarEventService,
  ) {}

  // ============================================================
  // 角色 → 邻居发现
  // ============================================================

  async listEligibleCharacters(ownerId: string): Promise<CharacterEntity[]> {
    const all = await this.charactersService.findAllVisibleToOwner(ownerId);
    return all.filter((c) => !PARKING_WAR_EXCLUDED_CHARACTER_IDS.has(c.id));
  }

  async ensureNpcStateForCharacters(
    characters: CharacterEntity[],
    ownerId: string,
  ): Promise<ParkingWarNpcStateEntity[]> {
    if (characters.length === 0) return [];
    const ids = characters.map((c) => c.id);
    // 共享 world：characterId 跨租户共用，必须带 ownerId 否则读到别人世界的 NPC state。
    const existing = await this.npcRepo.find({
      where: ids.map((characterId) => ({ characterId, ownerId })),
    });
    const existingByCharId = new Map(existing.map((s) => [s.characterId, s]));
    const toCreate: ParkingWarNpcStateEntity[] = [];
    for (const char of characters) {
      if (existingByCharId.has(char.id)) continue;
      const seeded = seedInitialNpcState(char, ownerId);
      toCreate.push(this.npcRepo.create(seeded));
    }
    if (toCreate.length === 0) return existing;
    let created: ParkingWarNpcStateEntity[] = [];
    try {
      created = await this.npcRepo.save(toCreate);
    } catch (error) {
      this.logger.warn(
        `parking-war seed NPC state failed (likely concurrent insert): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // 并发情况下重新读一遍
      created = await this.npcRepo.find({
        where: toCreate.map((s) => ({ characterId: s.characterId, ownerId })),
      });
    }
    return [...existing, ...created];
  }

  async getOrCreateNpcState(
    character: CharacterEntity,
    ownerId: string,
  ): Promise<ParkingWarNpcStateEntity> {
    const existing = await this.npcRepo.findOneBy({
      characterId: character.id,
      ownerId,
    });
    if (existing) return existing;
    const created = await this.ensureNpcStateForCharacters([character], ownerId);
    return created[0]!;
  }

  async listNeighbors(
    ownerId: string,
    opts?: { limit?: number },
  ): Promise<ParkingWarNeighborSummary[]> {
    const eligible = await this.listEligibleCharacters(ownerId);
    const npcStates = await this.ensureNpcStateForCharacters(eligible, ownerId);
    const occupanciesByNpc = await this.indexHomeOccupancyCountByNpc(
      npcStates.map((n) => n.characterId),
    );
    const charById = new Map(eligible.map((c) => [c.id, c]));
    const summaries: ParkingWarNeighborSummary[] = [];
    for (const npc of npcStates) {
      const character = charById.get(npc.characterId);
      if (!character) continue;
      const occupiedCount = occupanciesByNpc.get(npc.characterId) ?? 0;
      summaries.push(buildNeighborSummary(character, npc, occupiedCount));
    }
    summaries.sort((a, b) => {
      const aLast = a.lastActedAt ? Date.parse(a.lastActedAt) : 0;
      const bLast = b.lastActedAt ? Date.parse(b.lastActedAt) : 0;
      if (aLast !== bLast) return bLast - aLast;
      return b.intimacyLevel - a.intimacyLevel;
    });
    if (opts?.limit && summaries.length > opts.limit) {
      return summaries.slice(0, opts.limit);
    }
    return summaries;
  }

  async getNeighborDetail(
    ownerId: string,
    characterId: string,
  ): Promise<ParkingWarNeighborDetail> {
    if (PARKING_WAR_EXCLUDED_CHARACTER_IDS.has(characterId)) {
      throw new AppError('PARKING_WAR_CHARACTER_NOT_PARTICIPATING', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色不参与抢车位',
      });
    }
    const character = await this.charactersService.findById(characterId);
    if (!character) {
      throw new AppError('PARKING_WAR_CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { characterId },
        legacyMessage: `角色不存在：${characterId}`,
      });
    }
    const isVisible = await this.charactersService.isVisibleToOwner(
      characterId,
      ownerId,
    );
    if (!isVisible) {
      throw new AppError('PARKING_WAR_CHARACTER_NOT_VISIBLE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色当前不可见',
      });
    }
    const npc = await this.getOrCreateNpcState(character, ownerId);
    const occupancies = await this.occupancyRepo.find({
      where: { lotOwnerKind: 'npc', lotOwnerId: characterId },
    });
    const summary = buildNeighborSummary(character, npc, occupancies.length);
    const recentEventRows = await this.eventService.listEventsForActor(
      ownerId,
      characterId,
      5,
    );
    return {
      ...summary,
      homeSlots:
        npc.homeSlotsPayload ??
        Array.from({ length: npc.lotSize }, (_, index) => ({
          index,
          occupancyId: null,
        })),
      homeOccupancies: occupancies.map(toOccupancyView),
      recentEvents: recentEventRows.map((row) =>
        this.eventService.toEventView(row),
      ),
      serverNowMs: Date.now(),
    };
  }

  // ============================================================
  // 把玩家车停进 NPC 车场（含 unique 索引并发兜底）
  // ============================================================

  async createOccupancyForNeighborPark(input: {
    ownerId: string;
    characterId: string;
    slotIndex: number;
    car: ParkingWarOwnedCar;
    nowMs: number;
  }): Promise<ParkingWarOccupancyEntity> {
    const character = await this.charactersService.findById(input.characterId);
    if (!character) {
      throw new AppError('PARKING_WAR_CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { characterId: input.characterId },
        legacyMessage: '角色不存在',
      });
    }
    if (PARKING_WAR_EXCLUDED_CHARACTER_IDS.has(input.characterId)) {
      throw new AppError('PARKING_WAR_CHARACTER_NOT_PARTICIPATING', {
        legacyMessage: '该角色不参与抢车位',
      });
    }
    const visible = await this.charactersService.isVisibleToOwner(
      input.characterId,
      input.ownerId,
    );
    if (!visible) {
      throw new AppError('PARKING_WAR_CHARACTER_NOT_VISIBLE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色当前不可见',
      });
    }

    const npc = await this.getOrCreateNpcState(character, input.ownerId);
    if (input.slotIndex < 0 || input.slotIndex >= npc.lotSize) {
      throw new AppError('PARKING_WAR_SLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '车位不存在',
      });
    }
    const slots =
      npc.homeSlotsPayload ??
      Array.from({ length: npc.lotSize }, (_, index) => ({
        index,
        occupancyId: null,
      }));
    if (slots[input.slotIndex]?.occupancyId) {
      throw new AppError('PARKING_WAR_SLOT_OCCUPIED', {
        legacyMessage: '车位已被占',
      });
    }

    const occupancy = this.occupancyRepo.create({
      lotOwnerKind: 'npc',
      lotOwnerId: input.characterId,
      slotIndex: input.slotIndex,
      visitorKind: 'player',
      visitorId: input.ownerId,
      carId: input.car.carId,
      carTier: input.car.tier,
      carRarity: input.car.rarity,
      carLevel: input.car.level,
      carPaintIndex: input.car.paintIndex,
      carPlate: input.car.plate ?? null,
      parkedAtMs: input.nowMs,
      pendingEarningsCents: 0,
      warningLevel: 0,
    });

    let saved: ParkingWarOccupancyEntity;
    try {
      saved = await this.occupancyRepo.save(occupancy);
    } catch (error) {
      throw new AppError('PARKING_WAR_PARK_CONFLICT', {
        legacyMessage:
          '车位刚被别人占了 / 这辆车已经停在别处了，刷新一下再试',
        params: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // 更新 NPC 车场槽位
    const newSlots: ParkingWarHomeSlot[] = slots.map((s) =>
      s.index === input.slotIndex
        ? { index: s.index, occupancyId: saved.id }
        : s,
    );
    npc.homeSlotsPayload = newSlots;
    npc.lastActedAt = new Date(input.nowMs);
    await this.npcRepo.save(npc);

    await this.eventService.recordEvent({
      ownerId: input.ownerId,
      kind: 'park',
      actorKind: 'player',
      actorId: 'owner',
      actorName: '世界主人',
      targetKind: 'npc',
      targetId: character.id,
      targetName: character.name,
      payload: {
        carId: input.car.carId,
        slotIndex: input.slotIndex,
        atHome: false,
      },
    });
    return saved;
  }

  /**
   * 清理 NPC 车场上的某个 occupancy（被玩家召回 / 被拖车）。
   * 不分账 — 分账逻辑由调用方（state service）做。
   */
  async releaseOccupancyOnNeighbor(
    occupancy: ParkingWarOccupancyEntity,
  ): Promise<void> {
    if (occupancy.lotOwnerKind !== 'npc') return;
    const npc = await this.npcRepo.findOneBy({
      characterId: occupancy.lotOwnerId,
    });
    if (!npc) {
      await this.occupancyRepo.delete({ id: occupancy.id });
      return;
    }
    const slots =
      npc.homeSlotsPayload ??
      Array.from({ length: npc.lotSize }, (_, index) => ({
        index,
        occupancyId: null,
      }));
    const newSlots: ParkingWarHomeSlot[] = slots.map((s) =>
      s.occupancyId === occupancy.id ? { ...s, occupancyId: null } : s,
    );
    npc.homeSlotsPayload = newSlots;
    npc.lastActedAt = new Date();
    await this.npcRepo.save(npc);
    await this.occupancyRepo.delete({ id: occupancy.id });
  }

  /**
   * 给 NPC 加余额（被偷停 70/30 分账时的 NPC 收入）。返回更新后的 NPC 实体。
   */
  async creditNpcBalance(
    characterId: string,
    cents: number,
  ): Promise<void> {
    if (cents <= 0) return;
    const npc = await this.npcRepo.findOneBy({ characterId });
    if (!npc) return;
    npc.balanceCents += cents;
    npc.totalEarnedCents += cents;
    await this.npcRepo.save(npc);
  }

  async getNpcState(
    characterId: string,
  ): Promise<ParkingWarNpcStateEntity | null> {
    return this.npcRepo.findOneBy({ characterId });
  }

  /**
   * 删掉 character 已经不可见 / 已被删的孤儿 NPC 状态。
   * 早期 + 走查测试 + 旧版 onboarding 会留下一堆 npc row 但 character 已经
   * 删了，榜单查询 + tick 全走它们一遍，体感很卡。每天清一次。
   */
  async pruneOrphanNpcStates(ownerId: string): Promise<number> {
    const all = await this.npcRepo.find({ where: { ownerId } });
    if (all.length === 0) return 0;
    const ids = Array.from(new Set(all.map((n) => n.characterId)));
    const characters = await this.charactersService.findManyByIds(ids);
    const aliveIds = new Set(characters.map((c) => c.id));
    const orphans = all.filter((n) => !aliveIds.has(n.characterId));
    if (orphans.length === 0) return 0;
    // 有车停在 orphan NPC 家的占用一并清掉，避免外键悬挂
    const orphanCharIds = orphans.map((n) => n.characterId);
    await this.occupancyRepo
      .createQueryBuilder()
      .delete()
      .where('lotOwnerKind = :k', { k: 'npc' })
      .andWhere('lotOwnerId IN (:...ids)', { ids: orphanCharIds })
      .execute();
    await this.npcRepo.remove(orphans);
    return orphans.length;
  }

  // ============================================================
  // helpers
  // ============================================================

  private async indexHomeOccupancyCountByNpc(
    characterIds: string[],
  ): Promise<Map<string, number>> {
    if (characterIds.length === 0) return new Map();
    const rows = await this.occupancyRepo
      .createQueryBuilder('occ')
      .select('occ.lotOwnerId', 'characterId')
      .addSelect('COUNT(*)', 'cnt')
      .where('occ.lotOwnerKind = :k', { k: 'npc' })
      .andWhere('occ.lotOwnerId IN (:...ids)', { ids: characterIds })
      .groupBy('occ.lotOwnerId')
      .getRawMany<{ characterId: string; cnt: string }>();
    return new Map(rows.map((r) => [r.characterId, Number(r.cnt) || 0]));
  }
}

// ============================================================
// pure helpers
// ============================================================

function seedInitialNpcState(
  character: CharacterEntity,
  ownerId: string,
): Partial<ParkingWarNpcStateEntity> {
  const intimacy = character.intimacyLevel ?? 0;
  // 亲密度越高，初始余额越多、车越好
  const balanceCents =
    PARKING_WAR_DEFAULT_BALANCE_CENTS + intimacy * 4_000; // +¥40 per 1 intimacy

  // 1-3 辆车，按 intimacy 决定档位 / 稀有度
  const carCount = intimacy >= 60 ? 3 : intimacy >= 30 ? 2 : 1;
  const baseTier: ParkingWarCarTier =
    intimacy >= 80
      ? 'luxury'
      : intimacy >= 60
        ? 'performance'
        : intimacy >= 40
          ? 'business'
          : intimacy >= 20
            ? 'family'
            : 'starter';
  const baseRarity: ParkingWarRarity =
    intimacy >= 90
      ? 'epic'
      : intimacy >= 60
        ? 'rare'
        : 'common';
  const cars: ParkingWarOwnedCar[] = [];
  for (let i = 0; i < carCount; i += 1) {
    cars.push({
      carId: `${character.id}-npc-car-${i}`,
      tier: baseTier,
      rarity: baseRarity,
      level: 1,
      paintIndex: 0,
      durability: 100,
      plate: null,
      parkedRef: null,
      unavailableUntilMs: null,
    });
  }
  const homeSlots: ParkingWarHomeSlot[] = Array.from(
    { length: PARKING_WAR_DEFAULT_LOT_SIZE },
    (_, index) => ({ index, occupancyId: null }),
  );
  const surface: ParkingWarLotSurface = PARKING_WAR_DEFAULT_LOT_SURFACE;
  return {
    characterId: character.id,
    ownerId,
    balanceCents,
    totalEarnedCents: 0,
    lotSize: PARKING_WAR_DEFAULT_LOT_SIZE,
    lotSurface: surface,
    lotMultiplierBp: PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP,
    ownedCarsPayload: cars,
    homeSlotsPayload: homeSlots,
    moodPayload: {
      aggressiveness: 0.1 + Math.min(0.3, intimacy / 200), // 0.1 ~ 0.4
      ticketStrictness: 0.05 + Math.min(0.4, (100 - intimacy) / 250),
      towPropensity: 0.02 + Math.min(0.2, (100 - intimacy) / 500),
      lastVisitAtMs: null,
    },
    lastActedAt: null,
    lastTickAt: null,
  };
}

function buildNeighborSummary(
  character: CharacterEntity,
  npc: ParkingWarNpcStateEntity,
  occupiedCount: number,
): ParkingWarNeighborSummary {
  const cars = npc.ownedCarsPayload ?? [];
  // 找最贵 / 最稀有的车
  const sorted = [...cars].sort((a, b) => {
    const tierRank = (t: ParkingWarCarTier) =>
      ['starter', 'family', 'business', 'performance', 'luxury', 'super'].indexOf(
        t,
      );
    const rarityRank = (r: ParkingWarRarity) =>
      ['common', 'rare', 'epic', 'legend'].indexOf(r);
    return rarityRank(b.rarity) - rarityRank(a.rarity) ||
      tierRank(b.tier) - tierRank(a.tier) ||
      b.level - a.level;
  });
  const top = sorted[0];
  return {
    characterId: character.id,
    characterName: character.name,
    characterAvatar: character.avatar ?? null,
    intimacyLevel: character.intimacyLevel ?? 0,
    isOnline: character.isOnline,
    balanceCents: npc.balanceCents,
    lotSize: npc.lotSize,
    lotSurface: npc.lotSurface,
    emptySlotCount: Math.max(0, npc.lotSize - occupiedCount),
    topCarTier: top?.tier ?? null,
    topCarRarity: top?.rarity ?? null,
    lastActedAt:
      npc.lastActedAt instanceof Date
        ? npc.lastActedAt.toISOString()
        : npc.lastActedAt
          ? new Date(npc.lastActedAt).toISOString()
          : null,
    relationship: character.relationship ?? null,
  };
}

function toOccupancyView(
  entity: ParkingWarOccupancyEntity,
): ParkingWarOccupancyView {
  return {
    occupancyId: entity.id,
    lotOwnerKind: entity.lotOwnerKind,
    lotOwnerId: entity.lotOwnerId,
    slotIndex: entity.slotIndex,
    visitorKind: entity.visitorKind,
    visitorId: entity.visitorId,
    carId: entity.carId,
    carTier: entity.carTier,
    carRarity: entity.carRarity,
    carLevel: entity.carLevel,
    carPaintIndex: entity.carPaintIndex,
    carPlate: entity.carPlate ?? null,
    parkedAtMs: Number(entity.parkedAtMs),
    pendingEarningsCents: entity.pendingEarningsCents,
    warningLevel: entity.warningLevel,
    warnedAtMs: entity.warnedAtMs != null ? Number(entity.warnedAtMs) : null,
    ticketedAtMs:
      entity.ticketedAtMs != null ? Number(entity.ticketedAtMs) : null,
    towableAtMs:
      entity.towableAtMs != null ? Number(entity.towableAtMs) : null,
  };
}
// i18n-ignore-end
