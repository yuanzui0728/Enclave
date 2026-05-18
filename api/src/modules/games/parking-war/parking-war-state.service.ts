// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../common/app-error.exception';
import { WorldOwnerService } from '../../auth/world-owner.service';
import { ParkingWarPlayerStateEntity } from './entities/parking-war-player-state.entity';
import { ParkingWarNpcStateEntity } from './entities/parking-war-npc-state.entity';
import { ParkingWarOccupancyEntity } from './entities/parking-war-occupancy.entity';
import { ParkingWarEventService } from './parking-war-event.service';
import { ParkingWarNeighborService } from './parking-war-neighbor.service';
import {
  computeCarBuyPriceCents,
  computeCarRatePerMinuteCents,
  computeCarUpgradeCostCents,
  PARKING_WAR_DAILY_BONUS_BASE_CENTS,
  PARKING_WAR_DAILY_BONUS_STREAK_BONUS_CENTS,
  PARKING_WAR_DAILY_BONUS_STREAK_CAP,
  PARKING_WAR_CAR_DEFAULT_DURABILITY,
  PARKING_WAR_CAR_DURABILITY_LOSS_PER_TICKET,
  PARKING_WAR_CAR_DURABILITY_LOSS_PER_TOW,
  PARKING_WAR_CAR_MAX_LEVEL,
  PARKING_WAR_CAR_REPAIR_COST_PER_POINT_CENTS,
  PARKING_WAR_DAILY_PARK_LIMIT,
  PARKING_WAR_DAILY_TICKET_LIMIT,
  PARKING_WAR_DEFAULT_BALANCE_CENTS,
  PARKING_WAR_DEFAULT_GARAGE_SLOTS,
  PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP,
  PARKING_WAR_DEFAULT_LOT_SIZE,
  PARKING_WAR_DEFAULT_LOT_SURFACE,
  PARKING_WAR_GARAGE_MAX_SLOTS,
  PARKING_WAR_GARAGE_SLOT_BASE_COST_CENTS,
  PARKING_WAR_LOT_SIZE_TIERS,
  PARKING_WAR_LOT_SIZE_UPGRADE_COST_CENTS,
  PARKING_WAR_LOT_SURFACE_UPGRADE_COST_CENTS,
  PARKING_WAR_OFFLINE_CATCHUP_CAP_MS,
  PARKING_WAR_PLAYER_ACTOR_ID,
  PARKING_WAR_SURFACE_MULTIPLIER_BP,
  PARKING_WAR_TICKET_AT_MS,
  PARKING_WAR_TICKET_PENALTY_BP,
  PARKING_WAR_TOWABLE_AT_MS,
  PARKING_WAR_TOW_COOLDOWN_MS,
  PARKING_WAR_TOW_FEE_CENTS,
  PARKING_WAR_VIP_DAILY_SHIELD,
  PARKING_WAR_VISITOR_SHARE_BP,
  PARKING_WAR_WARNING_AT_MS,
} from './parking-war.constants';
import type {
  ParkingWarCarTier,
  ParkingWarCollectResult,
  ParkingWarDailyBonusResult,
  ParkingWarDailyTask,
  ParkingWarHomeSlot,
  ParkingWarLotSurface,
  ParkingWarOccupancyView,
  ParkingWarOwnedCar,
  ParkingWarPlayerStateView,
  ParkingWarRarity,
  ParkingWarRecallResult,
  ParkingWarTicketResult,
  ParkingWarTowResult,
} from './parking-war.types';

@Injectable()
export class ParkingWarStateService implements OnModuleInit {
  private readonly logger = new Logger(ParkingWarStateService.name);

  constructor(
    @InjectRepository(ParkingWarPlayerStateEntity)
    private readonly playerRepo: Repository<ParkingWarPlayerStateEntity>,
    @InjectRepository(ParkingWarOccupancyEntity)
    private readonly occupancyRepo: Repository<ParkingWarOccupancyEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly eventService: ParkingWarEventService,
    private readonly neighborService: ParkingWarNeighborService,
  ) {}

  /**
   * 唯一复合索引在这里建（不要写 @Index({unique:true}) — synchronize 早于 onModuleInit，
   * 老库重复行会卡死服务启动；见 memory feedback_entity_unique_index_synchronize_trap.md）。
   *
   * - 一格车位同时只能有一辆车
   * - 一辆车不能同时停两个地方
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_pw_occupancy_slot
         ON parking_war_occupancies (lotOwnerKind, lotOwnerId, slotIndex)`,
      );
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_pw_occupancy_car
         ON parking_war_occupancies (visitorKind, visitorId, carId)`,
      );
    } catch (error) {
      this.logger.warn(
        `parking-war unique index creation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async resolveOwnerId(): Promise<string> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return owner.id;
  }

  // ============================================================
  // Init / Read
  // ============================================================

  async getOrCreatePlayerState(
    ownerId: string,
  ): Promise<ParkingWarPlayerStateEntity> {
    let state = await this.playerRepo.findOneBy({ ownerId });
    if (state) return state;

    const starterCarId = randomUUID();
    const ownedCars: ParkingWarOwnedCar[] = [
      {
        carId: starterCarId,
        tier: 'starter',
        rarity: 'common',
        level: 1,
        paintIndex: 0,
        durability: PARKING_WAR_CAR_DEFAULT_DURABILITY,
        plate: null,
        parkedRef: null,
        unavailableUntilMs: null,
      },
    ];
    const homeSlots: ParkingWarHomeSlot[] = Array.from(
      { length: PARKING_WAR_DEFAULT_LOT_SIZE },
      (_, index) => ({ index, occupancyId: null }),
    );
    state = this.playerRepo.create({
      ownerId,
      balanceCents: PARKING_WAR_DEFAULT_BALANCE_CENTS,
      totalEarnedCents: 0,
      garageSlots: PARKING_WAR_DEFAULT_GARAGE_SLOTS,
      lotSize: PARKING_WAR_DEFAULT_LOT_SIZE,
      lotSurface: PARKING_WAR_DEFAULT_LOT_SURFACE,
      lotMultiplierBp: PARKING_WAR_DEFAULT_LOT_MULTIPLIER_BP,
      ownedCarsPayload: ownedCars,
      homeSlotsPayload: homeSlots,
      lastTickAt: new Date(),
      lastDailyBonusKey: null,
      streakDays: 0,
      dailyTasksPayload: null,
      dailyShieldRemaining: 0,
    });
    state = await this.playerRepo.save(state);

    // 自动把起步车停进 slot 0，开始挂机产钱
    try {
      await this.parkOwnedCarAtHomeInternal(state, starterCarId, 0);
      // re-read after side-effects
      state = (await this.playerRepo.findOneBy({ ownerId })) ?? state;
    } catch (error) {
      this.logger.warn(
        `parking-war auto-park starter car failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return state;
  }

  async getPlayerStateView(
    ownerId: string,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.refreshDailyShield(state);
    // tick 已经把最新 home/away occupancies 加载并 save 了，直接传给 view 用，
    // 不要再 SELECT 一遍 —— 之前每次 /state 都跑 4 次 occupancy 查询
    const tickResult = await this.tickPlayerHomeOccupancies(state);
    return this.toPlayerView(state, tickResult);
  }

  /**
   * 每天首次读取 state 时跑一次的轻量「每日重置」：
   *  - dailyTasksPayload.dateKey != today → 重置为今天 + 3 个 daily tasks
   *  - VIP 地砖：dailyShieldRemaining = 1（护盾不累积，每天 1 张）；非 VIP = 0
   *  - 之后每次进 state 都按 event 日志重算 tasks.progress（懒计算）
   */
  private async refreshDailyShield(
    state: ParkingWarPlayerStateEntity,
  ): Promise<void> {
    const todayKey = formatDateKey(new Date());
    if (state.dailyTasksPayload?.dateKey !== todayKey) {
      state.dailyTasksPayload = {
        dateKey: todayKey,
        tasks: createDefaultDailyTasks(),
      };
      state.dailyShieldRemaining =
        state.lotSurface === 'vip' ? PARKING_WAR_VIP_DAILY_SHIELD : 0;
      await this.playerRepo.save(state);
    }
    await this.recomputeDailyTaskProgress(state);
  }

  /**
   * 根据今天的事件日志重算 task.progress（已 claim 的不动）。
   */
  private async recomputeDailyTaskProgress(
    state: ParkingWarPlayerStateEntity,
  ): Promise<void> {
    if (!state.dailyTasksPayload) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // 用精确 COUNT/SUM 而不是 listEvents+filter ——
    // NPC tick 一天能产 2000+ 事件，limit:200 的窗口会漏算清晨用户操作
    const [todayParkAway, todayTickets, todayCollectCents] = await Promise.all([
      this.eventService.countTodayEventsOfKind(state.ownerId, 'park', startOfDay, {
        targetKind: 'npc',
        actorKind: 'player',
      }),
      this.eventService.countTodayEventsOfKind(state.ownerId, 'ticket', startOfDay, {
        actorKind: 'player',
      }),
      this.eventService.sumTodayAmountOfKind(state.ownerId, 'collect', startOfDay, {
        actorKind: 'player',
      }),
    ]);

    const tasks = state.dailyTasksPayload.tasks.map((t) => {
      if (t.claimed) return t;
      if (t.id === 'park_neighbor_3') return { ...t, progress: todayParkAway };
      if (t.id === 'ticket_2') return { ...t, progress: todayTickets };
      if (t.id === 'collect_cents_2000')
        return { ...t, progress: todayCollectCents };
      return t;
    });
    const changed =
      tasks.some(
        (t, i) =>
          t.progress !== (state.dailyTasksPayload?.tasks[i].progress ?? 0),
      );
    if (changed) {
      state.dailyTasksPayload = {
        dateKey: state.dailyTasksPayload.dateKey,
        tasks,
      };
      await this.playerRepo.save(state);
    }
  }

  // ============================================================
  // Tick / Collect
  // ============================================================

  /**
   * 推进所有与玩家相关的 occupancy 的 pendingEarnings：
   *  - home occupancies：visitor 是谁都按玩家自己 lot 的 surface/multiplier 计费
   *  - away occupancies：玩家车停在 NPC 家，按那家 NPC 的 surface/multiplier 计费
   *
   * 离线补算：lastTickAt 到 now 的时间窗口被夹到 OFFLINE_CATCHUP_CAP_MS。
   */
  async tickPlayerHomeOccupancies(
    state: ParkingWarPlayerStateEntity,
    nowMs: number = Date.now(),
  ): Promise<{
    home: ParkingWarOccupancyEntity[];
    away: ParkingWarOccupancyEntity[];
  } | null> {
    const lastTickMs = state.lastTickAt?.getTime() ?? nowMs;
    const rawDelta = Math.max(0, nowMs - lastTickMs);
    const cappedDelta = Math.min(rawDelta, PARKING_WAR_OFFLINE_CATCHUP_CAP_MS);
    if (cappedDelta <= 0) {
      state.lastTickAt = new Date(nowMs);
      await this.playerRepo.save(state);
      return null;
    }

    // away 必须排除 lotOwnerKind=player —— 玩家把自己车停在自家时，occupancy
    // 同时满足 home(lotOwnerKind=player) 和 away(visitorKind=player) 两边的过滤条件，
    // 会被双重计费 / 双重 save / 双重出现在 view 里。强制 npc-only 才算真"在外面"。
    const [homeOccupancies, awayOccupancies] = await Promise.all([
      this.occupancyRepo.find({
        where: { lotOwnerKind: 'player', lotOwnerId: state.ownerId },
      }),
      this.occupancyRepo.find({
        where: {
          visitorKind: 'player',
          visitorId: state.ownerId,
          lotOwnerKind: 'npc',
        },
      }),
    ]);

    const minutes = cappedDelta / 60_000;

    for (const occ of homeOccupancies) {
      const ratePerMinute = computeCarRatePerMinuteCents({
        tier: occ.carTier,
        rarity: occ.carRarity,
        level: occ.carLevel,
        surface: state.lotSurface,
        lotMultiplierBp: state.lotMultiplierBp,
      });
      const delta = Math.round(ratePerMinute * minutes);
      if (delta > 0) {
        occ.pendingEarningsCents += delta;
      }
    }

    // away：取每个 NPC 的 surface/multiplier
    const awayHostIds = Array.from(
      new Set(
        awayOccupancies
          .filter((o) => o.lotOwnerKind === 'npc')
          .map((o) => o.lotOwnerId),
      ),
    );
    let hostMap = new Map<
      string,
      { surface: ParkingWarLotSurface; lotMultiplierBp: number }
    >();
    if (awayHostIds.length > 0) {
      const npcStates = await Promise.all(
        awayHostIds.map((id) => this.neighborService.getNpcState(id)),
      );
      hostMap = new Map(
        npcStates
          .filter((n): n is ParkingWarNpcStateEntity => n != null)
          .map((n) => [
            n.characterId,
            { surface: n.lotSurface, lotMultiplierBp: n.lotMultiplierBp },
          ]),
      );
    }
    for (const occ of awayOccupancies) {
      const host = hostMap.get(occ.lotOwnerId);
      if (!host) continue;
      const ratePerMinute = computeCarRatePerMinuteCents({
        tier: occ.carTier,
        rarity: occ.carRarity,
        level: occ.carLevel,
        surface: host.surface,
        lotMultiplierBp: host.lotMultiplierBp,
      });
      const delta = Math.round(ratePerMinute * minutes);
      if (delta > 0) {
        occ.pendingEarningsCents += delta;
      }
    }

    // 推进 warningLevel：占位 5/10/20 分钟 → 1/2/3。Stage 4 把状态机放在 tick 里，
    // 这样玩家进游戏一刷新就能看到「警告 / 罚单 / 可拖车」即时更新。
    for (const occ of [...homeOccupancies, ...awayOccupancies]) {
      const parkedFor = nowMs - Number(occ.parkedAtMs);
      let target = 0;
      if (parkedFor >= PARKING_WAR_TOWABLE_AT_MS) target = 3;
      else if (parkedFor >= PARKING_WAR_TICKET_AT_MS) target = 2;
      else if (parkedFor >= PARKING_WAR_WARNING_AT_MS) target = 1;
      if (target > occ.warningLevel) {
        occ.warningLevel = target;
        if (target >= 1 && occ.warnedAtMs == null) occ.warnedAtMs = nowMs;
        if (target >= 2 && occ.ticketedAtMs == null) occ.ticketedAtMs = nowMs;
        if (target >= 3 && occ.towableAtMs == null) occ.towableAtMs = nowMs;
      }
    }

    if (homeOccupancies.length + awayOccupancies.length > 0) {
      await this.occupancyRepo.save([
        ...homeOccupancies,
        ...awayOccupancies,
      ]);
    }
    state.lastTickAt = new Date(nowMs);
    await this.playerRepo.save(state);
    return { home: homeOccupancies, away: awayOccupancies };
  }

  async collectFromSlot(
    ownerId: string,
    slotIndex?: number,
  ): Promise<ParkingWarCollectResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    const where =
      slotIndex == null
        ? { lotOwnerKind: 'player' as const, lotOwnerId: ownerId }
        : {
            lotOwnerKind: 'player' as const,
            lotOwnerId: ownerId,
            slotIndex,
          };
    const occupancies = await this.occupancyRepo.find({ where });
    if (occupancies.length === 0) {
      throw new AppError('PARKING_WAR_NOTHING_TO_COLLECT', {
        legacyMessage: '车位上没有可收的车',
      });
    }

    let gained = 0;
    for (const occ of occupancies) {
      // 自己停自己家：100% 入自己钱包；
      // Stage 3 起 NPC 访客停玩家家时，玩家不直接收，而是等被贴条/拖车才能从访客身上抽
      if (occ.visitorKind === 'player' && occ.visitorId === ownerId) {
        gained += occ.pendingEarningsCents;
        occ.pendingEarningsCents = 0;
      }
    }
    if (gained === 0) {
      throw new AppError('PARKING_WAR_NOTHING_TO_COLLECT', {
        legacyMessage: '车位上没有可收的车',
      });
    }
    await this.occupancyRepo.save(occupancies);

    state.balanceCents += gained;
    state.totalEarnedCents += gained;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'collect',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: gained,
      payload: { slotIndex: slotIndex ?? null },
    });

    return { view: await this.toPlayerView(state), gainedCents: gained };
  }

  // ============================================================
  // Park / Recall (home only — Stage 3 adds neighbor variant)
  // ============================================================

  async parkOwnedCarAtHome(
    ownerId: string,
    carId: string,
    slotIndex: number,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);
    await this.parkOwnedCarAtHomeInternal(state, carId, slotIndex);
    const refreshed =
      (await this.playerRepo.findOneBy({ ownerId })) ?? state;
    return this.toPlayerView(refreshed);
  }

  /**
   * 把玩家的某辆车停进 NPC 邻居的指定车位。每日上限 8 次（按事件日志计）。
   */
  async parkOwnedCarAtNeighbor(
    ownerId: string,
    carId: string,
    characterId: string,
    slotIndex: number,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    await this.assertDailyParkBudgetAvailable(ownerId);

    const cars = [...(state.ownedCarsPayload ?? [])];
    const carIdx = cars.findIndex((c) => c.carId === carId);
    if (carIdx < 0) {
      throw new AppError('PARKING_WAR_CAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '找不到这辆车',
      });
    }
    const car = cars[carIdx];
    if (car.parkedRef) {
      throw new AppError('PARKING_WAR_CAR_ALREADY_PARKED', {
        legacyMessage: '该车已停在外面，无法再停',
      });
    }
    const nowMs = Date.now();
    if (car.unavailableUntilMs && car.unavailableUntilMs > nowMs) {
      throw new AppError('PARKING_WAR_CAR_COOLDOWN', {
        legacyMessage: '该车被拖走后正在冷却',
      });
    }

    const saved = await this.neighborService.createOccupancyForNeighborPark({
      ownerId,
      characterId,
      slotIndex,
      car,
      nowMs,
    });

    cars[carIdx] = {
      ...car,
      parkedRef: {
        occupancyId: saved.id,
        lotOwnerKind: 'npc',
        lotOwnerId: characterId,
        slotIndex,
        parkedAtMs: nowMs,
      },
    };
    state.ownedCarsPayload = cars;
    await this.playerRepo.save(state);

    return this.toPlayerView(state);
  }

  private async assertDailyParkBudgetAvailable(ownerId: string): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // 精确 COUNT 而不是 listEvents+filter —— NPC tick 一天能产 2000+ 事件，
    // 之前 limit:200 的窗口会漏算清晨用户操作，每日上限形同虚设
    const todayParkAway = await this.eventService.countTodayEventsOfKind(
      ownerId,
      'park',
      startOfDay,
      { targetKind: 'npc', actorKind: 'player' },
    );
    if (todayParkAway >= PARKING_WAR_DAILY_PARK_LIMIT) {
      throw new AppError('PARKING_WAR_DAILY_PARK_LIMIT_REACHED', {
        legacyMessage: `今日停别人家次数已用完（${PARKING_WAR_DAILY_PARK_LIMIT}/日）`,
      });
    }
  }

  private async parkOwnedCarAtHomeInternal(
    state: ParkingWarPlayerStateEntity,
    carId: string,
    slotIndex: number,
  ): Promise<void> {
    const cars = [...(state.ownedCarsPayload ?? [])];
    const carIdx = cars.findIndex((c) => c.carId === carId);
    if (carIdx < 0) {
      throw new AppError('PARKING_WAR_CAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '找不到这辆车',
      });
    }
    const car = cars[carIdx];
    if (car.parkedRef) {
      throw new AppError('PARKING_WAR_CAR_ALREADY_PARKED', {
        legacyMessage: '该车已停在外面，无法再停',
      });
    }
    const nowMs = Date.now();
    if (car.unavailableUntilMs && car.unavailableUntilMs > nowMs) {
      throw new AppError('PARKING_WAR_CAR_COOLDOWN', {
        legacyMessage: '该车被拖走后正在冷却',
      });
    }
    const homeSlots = [
      ...(state.homeSlotsPayload ??
        Array.from({ length: state.lotSize }, (_, i) => ({
          index: i,
          occupancyId: null,
        }))),
    ];
    if (slotIndex < 0 || slotIndex >= homeSlots.length) {
      throw new AppError('PARKING_WAR_SLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '车位不存在',
      });
    }
    if (homeSlots[slotIndex].occupancyId) {
      throw new AppError('PARKING_WAR_SLOT_OCCUPIED', {
        legacyMessage: '车位已被占',
      });
    }

    const occupancy = this.occupancyRepo.create({
      lotOwnerKind: 'player',
      lotOwnerId: state.ownerId,
      slotIndex,
      visitorKind: 'player',
      visitorId: state.ownerId,
      carId,
      carTier: car.tier,
      carRarity: car.rarity,
      carLevel: car.level,
      carPaintIndex: car.paintIndex,
      carPlate: car.plate ?? null,
      parkedAtMs: nowMs,
      pendingEarningsCents: 0,
      warningLevel: 0,
    });
    const saved = await this.occupancyRepo.save(occupancy);

    homeSlots[slotIndex] = { index: slotIndex, occupancyId: saved.id };
    cars[carIdx] = {
      ...car,
      parkedRef: {
        occupancyId: saved.id,
        lotOwnerKind: 'player',
        lotOwnerId: state.ownerId,
        slotIndex,
        parkedAtMs: nowMs,
      },
    };
    state.homeSlotsPayload = homeSlots;
    state.ownedCarsPayload = cars;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId: state.ownerId,
      kind: 'park',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      targetKind: 'player',
      targetId: state.ownerId,
      targetName: '自家车场',
      payload: { carId, slotIndex, atHome: true },
    });
  }

  /**
   * 召回 occupancy。
   * - 自停自家：pending 100% 入玩家钱包
   * - 停在 NPC 邻居家：pending 按 VISITOR_SHARE_BP(70%) 给玩家、剩余给 NPC
   */
  async recallOccupancy(
    ownerId: string,
    occupancyId: string,
  ): Promise<ParkingWarRecallResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    const occ = await this.occupancyRepo.findOneBy({ id: occupancyId });
    if (!occ) {
      throw new AppError('PARKING_WAR_OCCUPANCY_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '车辆已不在车位上',
      });
    }
    if (!(occ.visitorKind === 'player' && occ.visitorId === ownerId)) {
      throw new AppError('PARKING_WAR_NOT_YOUR_CAR', {
        status: HttpStatus.FORBIDDEN,
        legacyMessage: '只能召回自己的车',
      });
    }

    const totalPending = occ.pendingEarningsCents;
    const isHome =
      occ.lotOwnerKind === 'player' && occ.lotOwnerId === ownerId;
    const playerShare = isHome
      ? totalPending
      : Math.floor((totalPending * PARKING_WAR_VISITOR_SHARE_BP) / 10_000);
    const hostShare = totalPending - playerShare;

    state.balanceCents += playerShare;
    state.totalEarnedCents += playerShare;

    // 把车从 OwnedCar 上解绑
    const cars = (state.ownedCarsPayload ?? []).map((c) =>
      c.carId === occ.carId ? { ...c, parkedRef: null } : c,
    );
    state.ownedCarsPayload = cars;

    // 清空场主一侧的 home 槽位 + 给 NPC 那 30%
    if (isHome) {
      const homeSlots = (state.homeSlotsPayload ?? []).map((s) =>
        s.index === occ.slotIndex ? { ...s, occupancyId: null } : s,
      );
      state.homeSlotsPayload = homeSlots;
      await this.occupancyRepo.delete({ id: occupancyId });
    } else if (occ.lotOwnerKind === 'npc') {
      await this.neighborService.releaseOccupancyOnNeighbor(occ);
      if (hostShare > 0) {
        await this.neighborService.creditNpcBalance(occ.lotOwnerId, hostShare);
      }
    }
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'recall',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      targetKind: occ.lotOwnerKind,
      targetId: occ.lotOwnerId,
      targetName: isHome ? '自家车场' : null,
      amountCents: playerShare,
      payload: {
        carId: occ.carId,
        slotIndex: occ.slotIndex,
        atHome: isHome,
        hostShareCents: hostShare,
      },
    });

    return {
      view: await this.toPlayerView(state),
      gainedCents: playerShare,
      splitToHostCents: hostShare,
    };
  }

  // ============================================================
  // Ticket / Tow（玩家作为场主对停在自家的访客车采取行动）
  // ============================================================

  /**
   * 给停在自家的访客车贴罚单。访客是 NPC：扣 NPC 余额 30% of pending，
   * 30% 入玩家钱包；访客车耐久 -10；occupancy.warningLevel 推到 2；pending 清零。
   * 访客是玩家（Stage 4 暂不会出现）：同样扣 visitor.pending 30%。
   */
  async ticketOccupancy(
    ownerId: string,
    occupancyId: string,
  ): Promise<ParkingWarTicketResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    await this.assertDailyTicketBudgetAvailable(ownerId);

    const occ = await this.occupancyRepo.findOneBy({ id: occupancyId });
    if (!occ) {
      throw new AppError('PARKING_WAR_OCCUPANCY_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '车辆已不在车位上',
      });
    }
    if (!(occ.lotOwnerKind === 'player' && occ.lotOwnerId === ownerId)) {
      throw new AppError('PARKING_WAR_NOT_YOUR_LOT', {
        status: HttpStatus.FORBIDDEN,
        legacyMessage: '只能对停在自家车场的车贴条',
      });
    }
    if (occ.warningLevel < 1) {
      throw new AppError('PARKING_WAR_NO_WARNING_YET', {
        legacyMessage: '该车占位时间还没到警告线，无法贴条',
      });
    }

    // 玩家是 lotOwner 给自己家访客贴条 → shield 不消耗 (shield 是「被贴条时免一次」)
    // shield 实际生效场景在 Stage 8 NPC tick 给玩家车贴条时（这里仅保留 pending 30% 罚款逻辑）
    const fineCents = Math.floor(
      (occ.pendingEarningsCents * PARKING_WAR_TICKET_PENALTY_BP) / 10_000,
    );
    occ.pendingEarningsCents = 0;
    occ.warningLevel = Math.max(occ.warningLevel, 2);
    if (occ.ticketedAtMs == null) occ.ticketedAtMs = Date.now();
    await this.occupancyRepo.save(occ);

    state.balanceCents += fineCents;
    state.totalEarnedCents += fineCents;
    await this.playerRepo.save(state);

    // 访客车 durability -10（仅在访客是玩家自己时改 OwnedCar payload；
    // 访客是 NPC 时改 npc.ownedCarsPayload 暂不做—NPC 车耐久维度等 Stage 5 完整收口）
    if (occ.visitorKind === 'player' && occ.visitorId === ownerId) {
      const cars = (state.ownedCarsPayload ?? []).map((c) =>
        c.carId === occ.carId
          ? {
              ...c,
              durability: Math.max(
                0,
                c.durability - PARKING_WAR_CAR_DURABILITY_LOSS_PER_TICKET,
              ),
            }
          : c,
      );
      state.ownedCarsPayload = cars;
      await this.playerRepo.save(state);
    }

    await this.eventService.recordEvent({
      ownerId,
      kind: 'ticket',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      targetKind: occ.visitorKind,
      targetId: occ.visitorId,
      amountCents: fineCents,
      payload: {
        carId: occ.carId,
        slotIndex: occ.slotIndex,
        carTier: occ.carTier,
        carRarity: occ.carRarity,
      },
    });

    return {
      view: await this.toPlayerView(state),
      finedCents: fineCents,
    };
  }

  /**
   * 拖走停在自家的车（warningLevel ≥ 3）。访客被收取 PARKING_WAR_TOW_FEE_CENTS 的拖车费
   * 进玩家钱包，访客车进 30 min 冷却 unavailableUntilMs，耐久 -20，occupancy 清掉。
   */
  async towOccupancy(
    ownerId: string,
    occupancyId: string,
  ): Promise<ParkingWarTowResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    const occ = await this.occupancyRepo.findOneBy({ id: occupancyId });
    if (!occ) {
      throw new AppError('PARKING_WAR_OCCUPANCY_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '车辆已不在车位上',
      });
    }
    if (!(occ.lotOwnerKind === 'player' && occ.lotOwnerId === ownerId)) {
      throw new AppError('PARKING_WAR_NOT_YOUR_LOT', {
        status: HttpStatus.FORBIDDEN,
        legacyMessage: '只能拖走停在自家车场的车',
      });
    }
    if (occ.warningLevel < 3) {
      throw new AppError('PARKING_WAR_NOT_TOWABLE_YET', {
        legacyMessage: '该车占位时间还没到拖车线',
      });
    }

    const nowMs = Date.now();
    const fee = PARKING_WAR_TOW_FEE_CENTS;
    state.balanceCents += fee;
    state.totalEarnedCents += fee;

    // 清 home 槽位 + 删 occupancy
    const homeSlots = (state.homeSlotsPayload ?? []).map((s) =>
      s.index === occ.slotIndex ? { ...s, occupancyId: null } : s,
    );
    state.homeSlotsPayload = homeSlots;
    await this.occupancyRepo.delete({ id: occupancyId });

    // 给访客车上冷却 + 扣耐久（访客是玩家时直接改 ownedCarsPayload）
    if (occ.visitorKind === 'player' && occ.visitorId === ownerId) {
      const cars = (state.ownedCarsPayload ?? []).map((c) =>
        c.carId === occ.carId
          ? {
              ...c,
              parkedRef: null,
              durability: Math.max(
                0,
                c.durability - PARKING_WAR_CAR_DURABILITY_LOSS_PER_TOW,
              ),
              unavailableUntilMs: nowMs + PARKING_WAR_TOW_COOLDOWN_MS,
            }
          : c,
      );
      state.ownedCarsPayload = cars;
    }

    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'tow',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      targetKind: occ.visitorKind,
      targetId: occ.visitorId,
      amountCents: fee,
      payload: {
        carId: occ.carId,
        slotIndex: occ.slotIndex,
        carTier: occ.carTier,
        carRarity: occ.carRarity,
      },
    });

    return {
      view: await this.toPlayerView(state),
      finedCents: fee,
    };
  }

  private async assertDailyTicketBudgetAvailable(
    ownerId: string,
  ): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // 精确 COUNT，同 park budget 的修复理由
    // 仅统计玩家手动贴条 —— NPC 自动罚单也写同一事件流但不应该占玩家额度
    const todayTicket = await this.eventService.countTodayEventsOfKind(
      ownerId,
      'ticket',
      startOfDay,
      { actorKind: 'player' },
    );
    if (todayTicket >= PARKING_WAR_DAILY_TICKET_LIMIT) {
      throw new AppError('PARKING_WAR_DAILY_TICKET_LIMIT_REACHED', {
        legacyMessage: `今日贴条次数已用完（${PARKING_WAR_DAILY_TICKET_LIMIT}/日）`,
      });
    }
  }

  // ============================================================
  // Daily bonus / Daily tasks
  // ============================================================

  /**
   * 日签：当日首次领取，给 base(¥50) + (streakDays - 1) × 10 加成，封顶 +¥70。
   * 中断一天 streak 归 1；连领 streak 累加（封顶 7）。
   */
  async claimDailyBonus(
    ownerId: string,
  ): Promise<ParkingWarDailyBonusResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.refreshDailyShield(state);
    const todayKey = formatDateKey(new Date());
    if (state.lastDailyBonusKey === todayKey) {
      throw new AppError('PARKING_WAR_DAILY_BONUS_ALREADY_CLAIMED', {
        legacyMessage: '今日签到已完成',
      });
    }
    const yesterdayKey = formatDateKey(new Date(Date.now() - 86_400_000));
    const continued = state.lastDailyBonusKey === yesterdayKey;
    const nextStreak = continued
      ? Math.min(state.streakDays + 1, PARKING_WAR_DAILY_BONUS_STREAK_CAP)
      : 1;

    const streakBonus =
      Math.max(0, nextStreak - 1) *
      PARKING_WAR_DAILY_BONUS_STREAK_BONUS_CENTS;
    const amount = PARKING_WAR_DAILY_BONUS_BASE_CENTS + streakBonus;

    state.balanceCents += amount;
    state.totalEarnedCents += amount;
    state.lastDailyBonusKey = todayKey;
    state.streakDays = nextStreak;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'daily_bonus',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: amount,
      payload: { streakDays: nextStreak, dateKey: todayKey },
    });
    return {
      view: await this.toPlayerView(state),
      amountCents: amount,
      streakDays: nextStreak,
    };
  }

  /**
   * 领取已完成的每日任务奖励。重复领取报错。
   */
  async claimDailyTask(
    ownerId: string,
    taskId: string,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.refreshDailyShield(state);
    const payload = state.dailyTasksPayload;
    if (!payload) {
      throw new AppError('PARKING_WAR_NO_DAILY_TASKS', {
        legacyMessage: '今日没有任务',
      });
    }
    const taskIdx = payload.tasks.findIndex((t) => t.id === taskId);
    if (taskIdx < 0) {
      throw new AppError('PARKING_WAR_TASK_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { taskId },
        legacyMessage: `任务不存在：${taskId}`,
      });
    }
    const task = payload.tasks[taskIdx];
    if (task.claimed) {
      throw new AppError('PARKING_WAR_TASK_ALREADY_CLAIMED', {
        legacyMessage: '该任务奖励已领取',
      });
    }
    if (task.progress < task.goal) {
      throw new AppError('PARKING_WAR_TASK_NOT_COMPLETED', {
        params: { progress: task.progress, goal: task.goal },
        legacyMessage: `任务还没完成（${task.progress}/${task.goal}）`,
      });
    }
    const tasks = payload.tasks.map((t, i) =>
      i === taskIdx ? { ...t, claimed: true } : t,
    );
    state.dailyTasksPayload = { dateKey: payload.dateKey, tasks };
    state.balanceCents += task.rewardCents;
    state.totalEarnedCents += task.rewardCents;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'task_claim',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: task.rewardCents,
      payload: { taskId, dateKey: payload.dateKey },
    });
    return this.toPlayerView(state);
  }

  // ============================================================
  // Garage: buy / upgrade / paint / repair
  // ============================================================

  async buyCar(
    ownerId: string,
    tier: ParkingWarCarTier,
    rarity: ParkingWarRarity,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    const cars = [...(state.ownedCarsPayload ?? [])];
    if (cars.length >= state.garageSlots) {
      throw new AppError('PARKING_WAR_GARAGE_FULL', {
        legacyMessage: '车库已满，先升级车库或卖车',
      });
    }
    const price = computeCarBuyPriceCents(tier, rarity);
    if (state.balanceCents < price) {
      throw new AppError('PARKING_WAR_INSUFFICIENT_BALANCE', {
        params: { required: price, balance: state.balanceCents },
        legacyMessage: '余额不足',
      });
    }

    const newCar: ParkingWarOwnedCar = {
      carId: randomUUID(),
      tier,
      rarity,
      level: 1,
      paintIndex: 0,
      durability: PARKING_WAR_CAR_DEFAULT_DURABILITY,
      plate: null,
      parkedRef: null,
      unavailableUntilMs: null,
    };
    cars.push(newCar);
    state.ownedCarsPayload = cars;
    state.balanceCents -= price;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'buy_car',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: -price,
      payload: { tier, rarity, carId: newCar.carId },
    });
    return this.toPlayerView(state);
  }

  async upgradeCar(
    ownerId: string,
    carId: string,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    await this.tickPlayerHomeOccupancies(state);

    const cars = [...(state.ownedCarsPayload ?? [])];
    const idx = cars.findIndex((c) => c.carId === carId);
    if (idx < 0) {
      throw new AppError('PARKING_WAR_CAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '找不到这辆车',
      });
    }
    const car = cars[idx];
    if (car.level >= PARKING_WAR_CAR_MAX_LEVEL) {
      throw new AppError('PARKING_WAR_CAR_MAX_LEVEL', {
        legacyMessage: '该车已满级',
      });
    }
    const cost = computeCarUpgradeCostCents(car.level);
    if (state.balanceCents < cost) {
      throw new AppError('PARKING_WAR_INSUFFICIENT_BALANCE', {
        params: { required: cost, balance: state.balanceCents },
        legacyMessage: '余额不足',
      });
    }
    cars[idx] = { ...car, level: car.level + 1 };
    state.ownedCarsPayload = cars;
    state.balanceCents -= cost;

    // 升级后同步在场 occupancy 的 carLevel（确保收益马上生效）
    if (car.parkedRef) {
      await this.occupancyRepo.update(
        { id: car.parkedRef.occupancyId },
        { carLevel: car.level + 1 },
      );
    }
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'upgrade_car',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: -cost,
      payload: { carId, newLevel: car.level + 1 },
    });
    return this.toPlayerView(state);
  }

  async paintCar(
    ownerId: string,
    carId: string,
    paintIndex: number,
  ): Promise<ParkingWarPlayerStateView> {
    if (!Number.isInteger(paintIndex) || paintIndex < 0 || paintIndex > 2) {
      throw new AppError('PARKING_WAR_INVALID_PAINT_INDEX', {
        legacyMessage: 'paintIndex 仅支持 0/1/2',
      });
    }
    const state = await this.getOrCreatePlayerState(ownerId);
    const cars = [...(state.ownedCarsPayload ?? [])];
    const idx = cars.findIndex((c) => c.carId === carId);
    if (idx < 0) {
      throw new AppError('PARKING_WAR_CAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '找不到这辆车',
      });
    }
    cars[idx] = { ...cars[idx], paintIndex };
    state.ownedCarsPayload = cars;

    const parkedRef = cars[idx].parkedRef;
    if (parkedRef) {
      await this.occupancyRepo.update(
        { id: parkedRef.occupancyId },
        { carPaintIndex: paintIndex },
      );
    }
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'paint_car',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      payload: { carId, paintIndex },
    });
    return this.toPlayerView(state);
  }

  /**
   * 升级车场尺寸（4 → 6 → 8 → 12）。新增的 home slot 都是空的。
   */
  async upgradeLotSize(
    ownerId: string,
    targetSize: number,
  ): Promise<ParkingWarPlayerStateView> {
    if (!PARKING_WAR_LOT_SIZE_TIERS.includes(targetSize)) {
      throw new AppError('PARKING_WAR_INVALID_LOT_SIZE', {
        params: { targetSize },
        legacyMessage: `车场容量只能是 ${PARKING_WAR_LOT_SIZE_TIERS.join('/')}`,
      });
    }
    const state = await this.getOrCreatePlayerState(ownerId);
    if (targetSize <= state.lotSize) {
      throw new AppError('PARKING_WAR_LOT_SIZE_NOT_UPGRADE', {
        legacyMessage: '只能往更大档位扩容',
      });
    }
    const cost = PARKING_WAR_LOT_SIZE_UPGRADE_COST_CENTS[targetSize];
    if (state.balanceCents < cost) {
      throw new AppError('PARKING_WAR_INSUFFICIENT_BALANCE', {
        params: { required: cost, balance: state.balanceCents },
        legacyMessage: '余额不足',
      });
    }

    state.balanceCents -= cost;
    state.lotSize = targetSize;
    const currentSlots = state.homeSlotsPayload ?? [];
    const newSlots: ParkingWarHomeSlot[] = Array.from(
      { length: targetSize },
      (_, index) => currentSlots[index] ?? { index, occupancyId: null },
    );
    state.homeSlotsPayload = newSlots;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'upgrade_lot',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: -cost,
      payload: { kind: 'size', value: targetSize },
    });
    return this.toPlayerView(state);
  }

  /**
   * 升级车场地砖。VIP 地砖一次性切换，每天首登给 1 张免贴条护盾。
   */
  async upgradeLotSurface(
    ownerId: string,
    targetSurface: ParkingWarLotSurface,
  ): Promise<ParkingWarPlayerStateView> {
    if (!(targetSurface in PARKING_WAR_LOT_SURFACE_UPGRADE_COST_CENTS)) {
      throw new AppError('PARKING_WAR_INVALID_SURFACE', {
        params: { targetSurface },
        legacyMessage: `地砖类型不识别：${targetSurface}`,
      });
    }
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.lotSurface === targetSurface) {
      throw new AppError('PARKING_WAR_SURFACE_ALREADY_APPLIED', {
        legacyMessage: '已经是该地砖了',
      });
    }
    const cost = PARKING_WAR_LOT_SURFACE_UPGRADE_COST_CENTS[targetSurface];
    if (state.balanceCents < cost) {
      throw new AppError('PARKING_WAR_INSUFFICIENT_BALANCE', {
        params: { required: cost, balance: state.balanceCents },
        legacyMessage: '余额不足',
      });
    }
    state.balanceCents -= cost;
    state.lotSurface = targetSurface;
    state.lotMultiplierBp = PARKING_WAR_SURFACE_MULTIPLIER_BP[targetSurface];
    // 切到 VIP 当天立即享受 shield；切走 VIP 立即归零
    state.dailyShieldRemaining =
      targetSurface === 'vip' ? PARKING_WAR_VIP_DAILY_SHIELD : 0;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'upgrade_lot',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: -cost,
      payload: { kind: 'surface', value: targetSurface },
    });
    return this.toPlayerView(state);
  }

  /**
   * 扩车库：成本随当前 garageSlots 递增。上限 PARKING_WAR_GARAGE_MAX_SLOTS。
   */
  async upgradeGarage(
    ownerId: string,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.garageSlots >= PARKING_WAR_GARAGE_MAX_SLOTS) {
      throw new AppError('PARKING_WAR_GARAGE_AT_MAX', {
        legacyMessage: `车库已达上限 ${PARKING_WAR_GARAGE_MAX_SLOTS} 个槽位`,
      });
    }
    const next = state.garageSlots + 1;
    // 第 5 个 ¥1000，第 6 个 ¥2000，第 7 个 ¥4000，第 8 个 ¥8000
    const stepMultiplier = next - PARKING_WAR_DEFAULT_GARAGE_SLOTS;
    const cost = PARKING_WAR_GARAGE_SLOT_BASE_COST_CENTS * 2 ** (stepMultiplier - 1);
    if (state.balanceCents < cost) {
      throw new AppError('PARKING_WAR_INSUFFICIENT_BALANCE', {
        params: { required: cost, balance: state.balanceCents },
        legacyMessage: '余额不足',
      });
    }
    state.balanceCents -= cost;
    state.garageSlots = next;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'upgrade_lot',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: -cost,
      payload: { kind: 'garage', value: next },
    });
    return this.toPlayerView(state);
  }

  async repairCar(
    ownerId: string,
    carId: string,
  ): Promise<ParkingWarPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const cars = [...(state.ownedCarsPayload ?? [])];
    const idx = cars.findIndex((c) => c.carId === carId);
    if (idx < 0) {
      throw new AppError('PARKING_WAR_CAR_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '找不到这辆车',
      });
    }
    const car = cars[idx];
    const missing = PARKING_WAR_CAR_DEFAULT_DURABILITY - car.durability;
    if (missing <= 0) {
      throw new AppError('PARKING_WAR_CAR_FULLY_REPAIRED', {
        legacyMessage: '该车耐久已满',
      });
    }
    const cost = missing * PARKING_WAR_CAR_REPAIR_COST_PER_POINT_CENTS;
    if (state.balanceCents < cost) {
      throw new AppError('PARKING_WAR_INSUFFICIENT_BALANCE', {
        params: { required: cost, balance: state.balanceCents },
        legacyMessage: '余额不足',
      });
    }
    cars[idx] = { ...car, durability: PARKING_WAR_CAR_DEFAULT_DURABILITY };
    state.ownedCarsPayload = cars;
    state.balanceCents -= cost;
    await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'repair_car',
      actorKind: 'player',
      actorId: PARKING_WAR_PLAYER_ACTOR_ID,
      actorName: '世界主人',
      amountCents: -cost,
      payload: { carId, restoredPoints: missing },
    });
    return this.toPlayerView(state);
  }

  // ============================================================
  // View
  // ============================================================

  private async toPlayerView(
    state: ParkingWarPlayerStateEntity,
    preloaded?: {
      home: ParkingWarOccupancyEntity[];
      away: ParkingWarOccupancyEntity[];
    } | null,
  ): Promise<ParkingWarPlayerStateView> {
    // 同 tickPlayerHomeOccupancies：away 仅指停在 NPC 邻居家的车，避免与 home 重叠
    let homeOccupancies: ParkingWarOccupancyEntity[];
    let awayOccupancies: ParkingWarOccupancyEntity[];
    if (preloaded) {
      homeOccupancies = preloaded.home;
      awayOccupancies = preloaded.away;
    } else {
      [homeOccupancies, awayOccupancies] = await Promise.all([
        this.occupancyRepo.find({
          where: { lotOwnerKind: 'player', lotOwnerId: state.ownerId },
        }),
        this.occupancyRepo.find({
          where: {
            visitorKind: 'player',
            visitorId: state.ownerId,
            lotOwnerKind: 'npc',
          },
        }),
      ]);
    }

    const todayKey = formatDateKey(new Date());
    const dailyBonusAvailable = state.lastDailyBonusKey !== todayKey;

    return {
      ownerId: state.ownerId,
      balanceCents: state.balanceCents,
      totalEarnedCents: state.totalEarnedCents,
      garageSlots: state.garageSlots,
      lotSize: state.lotSize,
      lotSurface: state.lotSurface,
      lotMultiplierBp: state.lotMultiplierBp,
      ownedCars: state.ownedCarsPayload ?? [],
      homeSlots:
        state.homeSlotsPayload ??
        Array.from({ length: state.lotSize }, (_, index) => ({
          index,
          occupancyId: null,
        })),
      homeOccupancies: homeOccupancies.map(toOccupancyView),
      awayOccupancies: awayOccupancies.map(toOccupancyView),
      streakDays: state.streakDays,
      lastDailyBonusKey: state.lastDailyBonusKey ?? null,
      dailyBonusAvailable,
      dailyShieldRemaining: state.dailyShieldRemaining,
      dailyTasks: state.dailyTasksPayload?.tasks ?? [],
      serverNowMs: Date.now(),
      updatedAt:
        state.updatedAt instanceof Date
          ? state.updatedAt.toISOString()
          : new Date(state.updatedAt).toISOString(),
    };
  }
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

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createDefaultDailyTasks(): ParkingWarDailyTask[] {
  return [
    {
      id: 'park_neighbor_3',
      progress: 0,
      goal: 3,
      claimed: false,
      rewardCents: 8_000, // ¥80
    },
    {
      id: 'ticket_2',
      progress: 0,
      goal: 2,
      claimed: false,
      rewardCents: 6_000, // ¥60
    },
    {
      id: 'collect_cents_2000',
      progress: 0,
      goal: 2_000,
      claimed: false,
      rewardCents: 5_000, // ¥50
    },
  ];
}
// i18n-ignore-end
