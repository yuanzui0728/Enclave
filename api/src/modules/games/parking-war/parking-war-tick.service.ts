// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isSharedWorldMode } from '../../tenancy/tenant-context';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { sleepForWorldJitter } from '../../../common/cron-jitter.util';
import { WorldOwnerService } from '../../auth/world-owner.service';
import { CharactersService } from '../../characters/characters.service';
import { ParkingWarNpcStateEntity } from './entities/parking-war-npc-state.entity';
import { ParkingWarOccupancyEntity } from './entities/parking-war-occupancy.entity';
import { ParkingWarPlayerStateEntity } from './entities/parking-war-player-state.entity';
import { ParkingWarEventService } from './parking-war-event.service';
import { ParkingWarNeighborService } from './parking-war-neighbor.service';
import {
  computeCarRatePerMinuteCents,
  PARKING_WAR_CAR_DURABILITY_LOSS_PER_TICKET,
  PARKING_WAR_CAR_DURABILITY_LOSS_PER_TOW,
  PARKING_WAR_INCIDENT_BROADCAST_CHANCE,
  PARKING_WAR_TICKET_AT_MS,
  PARKING_WAR_TICKET_PENALTY_BP,
  PARKING_WAR_TICK_CRON,
  PARKING_WAR_TOWABLE_AT_MS,
  PARKING_WAR_TOW_COOLDOWN_MS,
  PARKING_WAR_TOW_FEE_CENTS,
  PARKING_WAR_WARNING_AT_MS,
} from './parking-war.constants';
import type {
  ParkingWarHomeSlot,
  ParkingWarOwnedCar,
  ParkingWarTickSummary,
} from './parking-war.types';

@Injectable()
export class ParkingWarTickService {
  private readonly logger = new Logger(ParkingWarTickService.name);
  private running = false;
  // 上次 prune 的时间戳，每天最多跑一次。world 重启会清掉这个，
  // 重启后第一次 tick 就会 prune 一次 —— 完全可以接受
  private lastPruneAtMs = 0;
  private static readonly PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  private static readonly PRUNE_KEEP_DAYS = 30;

  constructor(
    @InjectRepository(ParkingWarPlayerStateEntity)
    private readonly playerRepo: Repository<ParkingWarPlayerStateEntity>,
    @InjectRepository(ParkingWarNpcStateEntity)
    private readonly npcRepo: Repository<ParkingWarNpcStateEntity>,
    @InjectRepository(ParkingWarOccupancyEntity)
    private readonly occupancyRepo: Repository<ParkingWarOccupancyEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly neighborService: ParkingWarNeighborService,
    private readonly eventService: ParkingWarEventService,
    private readonly charactersService: CharactersService,
  ) {}

  @Cron(PARKING_WAR_TICK_CRON)
  async runScheduledTick(): Promise<void> {
    // 共享 world：同 farm tick——per-owner fan-out + 内层 npcRepo 读未安全化；专项前跳过。
    if (isSharedWorldMode()) return;
    await sleepForWorldJitter(60_000);
    if (this.running) {
      this.logger.warn('上一次 parking-war tick 仍在执行，跳过本轮');
      return;
    }
    this.running = true;
    try {
      const summary = await this.runTick();
      this.logger.log(
        `parking-war tick: NPC ${summary.scannedNpcCount}，访问 ${summary.npcVisitCount} 次 / 警告 ${summary.warningCount} / 罚单 ${summary.ticketCount} / 拖车 ${summary.towCount} / 广播 ${summary.incidentBroadcastCount}，用时 ${summary.durationMs}ms`,
      );
    } catch (error) {
      this.logger.error(
        'parking-war tick 执行失败',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  async runTick(): Promise<ParkingWarTickSummary> {
    const startedAt = Date.now();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const ownerId = owner.id;

    const characters =
      await this.neighborService.listEligibleCharacters(ownerId);
    await this.neighborService.ensureNpcStateForCharacters(characters, ownerId);

    const playerState = await this.playerRepo.findOneBy({ ownerId });
    if (!playerState) {
      // 玩家还没创建过抢车位状态：跳过这一轮
      return {
        scannedNpcCount: 0,
        npcVisitCount: 0,
        warningCount: 0,
        ticketCount: 0,
        towCount: 0,
        incidentBroadcastCount: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    let scannedNpcCount = 0;
    let npcVisitCount = 0;
    let warningCount = 0;
    let ticketCount = 0;
    let towCount = 0;
    let incidentBroadcastCount = 0;

    const characterById = new Map(characters.map((c) => [c.id, c]));
    const npcStates = await this.npcRepo.find({ where: { ownerId } });

    for (const npc of npcStates) {
      scannedNpcCount += 1;
      const npcName =
        characterById.get(npc.characterId)?.name ?? npc.characterId;

      // 1) NPC 自家车场上 NPC 自己的车收益结算 → 进 NPC 余额
      await this.collectNpcHomeSelfEarnings(npc);

      // 2) NPC 给停在自家的玩家车贴条/拖车
      const action = await this.maybeFineOrTowPlayerOnNpcHome(
        npc,
        playerState,
        npcName,
      );
      ticketCount += action.tickets;
      towCount += action.tows;

      // 3) NPC 随机来玩家家停一辆车（aggressiveness）
      if (Math.random() < (npc.moodPayload?.aggressiveness ?? 0.15)) {
        const visit = await this.maybeNpcVisitPlayerHome(
          npc,
          playerState,
          npcName,
        );
        if (visit) npcVisitCount += 1;
      }

      // 4) 推进所有 NPC 自家 home occupancy 的 warningLevel（防止它永远卡在 0）
      const warningsBumped = await this.bumpWarningLevels(npc);
      warningCount += warningsBumped;
    }

    // 每天最多 prune 一次：旧事件 + 孤儿 NPC 状态。
    // 事件：NPC tick 一天能产 1000+ 事件，不清的话表无限增长
    // 孤儿 NPC：早期 / 走查测试留下的 character 已删的 NPC row，
    // 跑榜单 / tick 时全走一遍很卡
    const nowMs = Date.now();
    if (nowMs - this.lastPruneAtMs >= ParkingWarTickService.PRUNE_INTERVAL_MS) {
      try {
        const pruned = await this.eventService.pruneOldEvents(
          ownerId,
          ParkingWarTickService.PRUNE_KEEP_DAYS,
        );
        if (pruned > 0) {
          this.logger.log(
            `parking-war 事件清理：删除 ${pruned} 条 ${ParkingWarTickService.PRUNE_KEEP_DAYS} 天前的旧事件`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `parking-war 事件清理失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      try {
        const orphans = await this.neighborService.pruneOrphanNpcStates(ownerId);
        if (orphans > 0) {
          this.logger.log(
            `parking-war 孤儿 NPC 清理：删除 ${orphans} 个 character 已不可见的 NPC 状态`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `parking-war 孤儿 NPC 清理失败：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      this.lastPruneAtMs = nowMs;
    }

    return {
      scannedNpcCount,
      npcVisitCount,
      warningCount,
      ticketCount,
      towCount,
      incidentBroadcastCount,
      durationMs: Date.now() - startedAt,
    };
  }

  // ============================================================
  // helpers
  // ============================================================

  private async collectNpcHomeSelfEarnings(
    npc: ParkingWarNpcStateEntity,
  ): Promise<void> {
    const occs = await this.occupancyRepo.find({
      where: {
        lotOwnerKind: 'npc',
        lotOwnerId: npc.characterId,
        visitorKind: 'npc',
        visitorId: npc.characterId,
      },
    });
    const nowMs = Date.now();
    const lastTickMs = npc.lastTickAt?.getTime() ?? nowMs;
    const delta = Math.max(0, nowMs - lastTickMs);
    const minutes = delta / 60_000;
    if (minutes <= 0 || occs.length === 0) {
      npc.lastTickAt = new Date(nowMs);
      await this.npcRepo.save(npc);
      return;
    }
    let earned = 0;
    for (const occ of occs) {
      const rate = computeCarRatePerMinuteCents({
        tier: occ.carTier,
        rarity: occ.carRarity,
        level: occ.carLevel,
        surface: npc.lotSurface,
        lotMultiplierBp: npc.lotMultiplierBp,
      });
      earned += Math.round(rate * minutes);
    }
    if (earned > 0) {
      npc.balanceCents += earned;
      npc.totalEarnedCents += earned;
    }
    npc.lastTickAt = new Date(nowMs);
    await this.npcRepo.save(npc);
  }

  private async maybeFineOrTowPlayerOnNpcHome(
    npc: ParkingWarNpcStateEntity,
    playerState: ParkingWarPlayerStateEntity,
    npcName: string,
  ): Promise<{ tickets: number; tows: number }> {
    const occs = await this.occupancyRepo.find({
      where: {
        lotOwnerKind: 'npc',
        lotOwnerId: npc.characterId,
        visitorKind: 'player',
        visitorId: playerState.ownerId,
      },
    });
    let tickets = 0;
    let tows = 0;
    if (occs.length === 0) return { tickets, tows };

    const nowMs = Date.now();
    let mutatedPlayer = false;
    const cars = [...(playerState.ownedCarsPayload ?? [])];

    for (const occ of occs) {
      const parkedFor = nowMs - Number(occ.parkedAtMs);
      // 状态机推进
      let target = occ.warningLevel;
      if (parkedFor >= PARKING_WAR_TOWABLE_AT_MS) target = 3;
      else if (parkedFor >= PARKING_WAR_TICKET_AT_MS) target = 2;
      else if (parkedFor >= PARKING_WAR_WARNING_AT_MS) target = 1;
      if (target > occ.warningLevel) {
        occ.warningLevel = target;
        if (target >= 1 && occ.warnedAtMs == null) occ.warnedAtMs = nowMs;
        if (target >= 2 && occ.ticketedAtMs == null) occ.ticketedAtMs = nowMs;
        if (target >= 3 && occ.towableAtMs == null) occ.towableAtMs = nowMs;
      }

      // 拖车：warningLevel ≥ 3 → 概率拖
      if (
        occ.warningLevel >= 3 &&
        Math.random() < (npc.moodPayload?.towPropensity ?? 0.1)
      ) {
        const fee = PARKING_WAR_TOW_FEE_CENTS;
        // 玩家被扣钱（不到 0）
        const payable = Math.min(playerState.balanceCents, fee);
        playerState.balanceCents = Math.max(
          0,
          playerState.balanceCents - payable,
        );
        npc.balanceCents += payable;
        npc.totalEarnedCents += payable;
        // 玩家车回库 + 冷却
        const carIdx = cars.findIndex((c) => c.carId === occ.carId);
        if (carIdx >= 0) {
          cars[carIdx] = {
            ...cars[carIdx],
            parkedRef: null,
            durability: Math.max(
              0,
              cars[carIdx].durability - PARKING_WAR_CAR_DURABILITY_LOSS_PER_TOW,
            ),
            unavailableUntilMs: nowMs + PARKING_WAR_TOW_COOLDOWN_MS,
          };
          mutatedPlayer = true;
        }
        await this.neighborService.releaseOccupancyOnNeighbor(occ);
        await this.eventService.recordEvent({
          ownerId: playerState.ownerId,
          kind: 'tow',
          actorKind: 'npc',
          actorId: npc.characterId,
          actorName: npcName,
          targetKind: 'player',
          targetId: playerState.ownerId,
          targetName: '世界主人',
          amountCents: payable,
          payload: {
            carId: occ.carId,
            slotIndex: occ.slotIndex,
            atHome: false,
            triggeredBy: 'auto',
          },
        });
        // 拖车永远是值得吐槽的——直接 8% 概率走 Feed
        const character = await this.charactersService.findById(
          npc.characterId,
        );
        if (character) {
          await this.eventService.maybeBroadcastIncident({
            ownerId: playerState.ownerId,
            character,
            kind: 'tow',
            targetName: '世界主人',
            carTier: occ.carTier,
            carRarity: occ.carRarity,
            amountCents: payable,
          });
        }
        tows += 1;
        continue;
      }

      // 罚单：warningLevel ≥ 2 → 按 strictness 概率贴；VIP shield 可挡一次
      if (
        occ.warningLevel >= 2 &&
        Math.random() < (npc.moodPayload?.ticketStrictness ?? 0.2)
      ) {
        if (playerState.dailyShieldRemaining > 0) {
          playerState.dailyShieldRemaining -= 1;
          mutatedPlayer = true;
          await this.eventService.recordEvent({
            ownerId: playerState.ownerId,
            kind: 'ticket',
            actorKind: 'npc',
            actorId: npc.characterId,
            actorName: npcName,
            targetKind: 'player',
            targetId: playerState.ownerId,
            targetName: '世界主人',
            amountCents: 0,
            payload: {
              carId: occ.carId,
              slotIndex: occ.slotIndex,
              shielded: true,
              triggeredBy: 'auto',
            },
          });
          continue;
        }
        const fine = Math.floor(
          (occ.pendingEarningsCents * PARKING_WAR_TICKET_PENALTY_BP) / 10_000,
        );
        occ.pendingEarningsCents = Math.max(
          0,
          occ.pendingEarningsCents - fine,
        );
        npc.balanceCents += fine;
        npc.totalEarnedCents += fine;
        const carIdx = cars.findIndex((c) => c.carId === occ.carId);
        if (carIdx >= 0) {
          cars[carIdx] = {
            ...cars[carIdx],
            durability: Math.max(
              0,
              cars[carIdx].durability -
                PARKING_WAR_CAR_DURABILITY_LOSS_PER_TICKET,
            ),
          };
          mutatedPlayer = true;
        }
        await this.eventService.recordEvent({
          ownerId: playerState.ownerId,
          kind: 'ticket',
          actorKind: 'npc',
          actorId: npc.characterId,
          actorName: npcName,
          targetKind: 'player',
          targetId: playerState.ownerId,
          targetName: '世界主人',
          amountCents: fine,
          payload: {
            carId: occ.carId,
            slotIndex: occ.slotIndex,
            triggeredBy: 'auto',
          },
        });
        tickets += 1;
      }
    }

    // 持久化
    await this.occupancyRepo.save(occs);
    await this.npcRepo.save(npc);
    if (mutatedPlayer) {
      playerState.ownedCarsPayload = cars;
      await this.playerRepo.save(playerState);
    }
    return { tickets, tows };
  }

  private async maybeNpcVisitPlayerHome(
    npc: ParkingWarNpcStateEntity,
    playerState: ParkingWarPlayerStateEntity,
    npcName: string,
  ): Promise<boolean> {
    // 找一辆 NPC 没在外面 / 不在冷却中的车
    const npcCars = npc.ownedCarsPayload ?? [];
    const candidates = npcCars.filter(
      (c) =>
        !c.parkedRef &&
        (c.unavailableUntilMs == null || c.unavailableUntilMs < Date.now()),
    );
    if (candidates.length === 0) return false;
    const car = candidates[Math.floor(Math.random() * candidates.length)];

    // 找玩家家的空槽位。给玩家留至少 1 个空位 —— 否则 20 个 NPC 把 4 个车位全占满，
    // 玩家买了新车都没地方停，只能等罚单 / 拖车冷却（20 分钟一轮），体验崩。
    const homeSlots = playerState.homeSlotsPayload ?? [];
    const emptySlots = homeSlots.filter((s) => !s.occupancyId);
    if (emptySlots.length <= 1) return false;
    const emptyIndex = emptySlots[0].index;

    const nowMs = Date.now();
    const occupancy = this.occupancyRepo.create({
      lotOwnerKind: 'player',
      lotOwnerId: playerState.ownerId,
      slotIndex: emptyIndex,
      visitorKind: 'npc',
      visitorId: npc.characterId,
      carId: car.carId,
      carTier: car.tier,
      carRarity: car.rarity,
      carLevel: car.level,
      carPaintIndex: car.paintIndex,
      carPlate: car.plate ?? null,
      parkedAtMs: nowMs,
      pendingEarningsCents: 0,
      warningLevel: 0,
    });
    let saved: ParkingWarOccupancyEntity;
    try {
      saved = await this.occupancyRepo.save(occupancy);
    } catch {
      // 并发：刚被别人占了，跳过
      return false;
    }

    // 更新玩家 home slot 引用
    playerState.homeSlotsPayload = homeSlots.map((s) =>
      s.index === emptyIndex ? { ...s, occupancyId: saved.id } : s,
    );
    await this.playerRepo.save(playerState);

    // 更新 NPC car parkedRef
    npc.ownedCarsPayload = npcCars.map((c) =>
      c.carId === car.carId
        ? {
            ...c,
            parkedRef: {
              occupancyId: saved.id,
              lotOwnerKind: 'player',
              lotOwnerId: playerState.ownerId,
              slotIndex: emptyIndex,
              parkedAtMs: nowMs,
            },
          }
        : c,
    );
    npc.lastActedAt = new Date(nowMs);
    if (npc.moodPayload) npc.moodPayload.lastVisitAtMs = nowMs;
    await this.npcRepo.save(npc);

    await this.eventService.recordEvent({
      ownerId: playerState.ownerId,
      kind: 'npc_visit',
      actorKind: 'npc',
      actorId: npc.characterId,
      actorName: npcName,
      targetKind: 'player',
      targetId: playerState.ownerId,
      payload: {
        carId: car.carId,
        slotIndex: emptyIndex,
        carTier: car.tier,
        carRarity: car.rarity,
      },
    });

    // 把 epic/legend 车的访问 8% 概率广播到 Feed
    if (car.rarity === 'epic' || car.rarity === 'legend') {
      const character = await this.charactersService.findById(npc.characterId);
      if (character) {
        await this.eventService.maybeBroadcastIncident({
          ownerId: playerState.ownerId,
          character,
          kind: 'npc_visit',
          targetName: '世界主人',
          carTier: car.tier,
          carRarity: car.rarity,
        });
      }
    }
    return true;
  }

  private async bumpWarningLevels(
    npc: ParkingWarNpcStateEntity,
  ): Promise<number> {
    const occs = await this.occupancyRepo.find({
      where: { lotOwnerKind: 'npc', lotOwnerId: npc.characterId },
    });
    let bumped = 0;
    const nowMs = Date.now();
    for (const occ of occs) {
      const parkedFor = nowMs - Number(occ.parkedAtMs);
      let target = occ.warningLevel;
      if (parkedFor >= PARKING_WAR_TOWABLE_AT_MS) target = 3;
      else if (parkedFor >= PARKING_WAR_TICKET_AT_MS) target = 2;
      else if (parkedFor >= PARKING_WAR_WARNING_AT_MS) target = 1;
      if (target > occ.warningLevel) {
        occ.warningLevel = target;
        if (target >= 1 && occ.warnedAtMs == null) occ.warnedAtMs = nowMs;
        if (target >= 2 && occ.ticketedAtMs == null) occ.ticketedAtMs = nowMs;
        if (target >= 3 && occ.towableAtMs == null) occ.towableAtMs = nowMs;
        bumped += 1;
      }
    }
    if (bumped > 0) await this.occupancyRepo.save(occs);
    return bumped;
  }
}
// i18n-ignore-end
