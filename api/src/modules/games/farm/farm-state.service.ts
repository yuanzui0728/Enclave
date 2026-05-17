import { forwardRef, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharactersService } from '../../characters/characters.service';
import { WorldOwnerService } from '../../auth/world-owner.service';
import { FarmEventService } from './farm-event.service';
import { FarmQuestService } from './farm-quest.service';
import { FarmNpcStateEntity } from './entities/farm-npc-state.entity';
import { FarmPlayerStateEntity } from './entities/farm-player-state.entity';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  FARM_CROP_CATALOG,
  FARM_DECORATION_IDS,
  computeDogBlockRate,
  computeDogEnergy,
  computeLevelFromExperience,
  computeMaturedAtMs,
  computePlotCountForLevel,
  computeRottenAtMs,
  createDefaultDog,
  getConsumableDefinition,
  getCropDefinition,
  getDecorationDefinition,
  isCropAvailableNow,
  isFarmConsumableId,
  isFarmCropId,
  isFarmDecorationId,
} from './crop-catalog';
import {
  FARM_DEFAULT_PLAYER_COINS,
  FARM_DEFAULT_PLAYER_SEED_BAG,
  FARM_DEFAULT_PLOT_COUNT,
  FARM_EXCLUDED_CHARACTER_IDS,
  FARM_DOG_BUY_COST,
  FARM_DOG_FEED_RESTORE,
  FARM_DOG_LEVEL_CAP,
  FARM_DOG_UNLOCK_LEVEL,
  FARM_DOG_UPGRADE_COSTS,
  FARM_FERTILIZER_SHRINK_RATIO,
  FARM_PESTICIDE_PROTECT_HOURS,
  FARM_PLAYER_ACTOR_ID,
  FARM_PLAYER_DAILY_STEAL_LIMIT,
  FARM_GIFT_DAILY_LIMIT_COINS,
  FARM_GIFT_INTIMACY_PER_100_COINS,
  FARM_GIFT_INTIMACY_PER_ITEM,
  FarmConsumableId,
  FarmConsumablePurchaseResult,
  FarmCropId,
  FarmDecorationId,
  FarmDecorationPlaceResult,
  FarmDecorationPlacement,
  FarmDecorationPurchaseResult,
  FarmDogPurchaseResult,
  FarmDogState,
  FarmGiftCoinsResult,
  FarmGiftItemResult,
  FarmHarvestResult,
  FarmNeighborSummary,
  FarmPlayerStateView,
  FarmPlot,
  FarmStealResult,
  FarmStolenLogEntry,
} from './farm.types';

interface MaintenanceTarget {
  kind: 'self' | 'npc';
  plotIndex: number;
  characterId?: string;
}

const WEEKLY_STOLEN_LOG_KEEP_MS = 7 * 24 * 3600 * 1000;

@Injectable()
export class FarmStateService {
  constructor(
    @InjectRepository(FarmPlayerStateEntity)
    private readonly playerRepo: Repository<FarmPlayerStateEntity>,
    @InjectRepository(FarmNpcStateEntity)
    private readonly npcRepo: Repository<FarmNpcStateEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly eventService: FarmEventService,
    private readonly charactersService: CharactersService,
    // 任务推进：避开循环依赖，让 FarmQuestService 后注入（同模块；forwardRef）。
    @Inject(forwardRef(() => FarmQuestService))
    private readonly questService: FarmQuestService,
  ) {}

  async getOrCreatePlayerState(
    ownerId: string,
  ): Promise<FarmPlayerStateEntity> {
    let state = await this.playerRepo.findOneBy({ ownerId });
    if (!state) {
      state = this.playerRepo.create({
        ownerId,
        coins: FARM_DEFAULT_PLAYER_COINS,
        experience: 0,
        level: 1,
        plotCount: FARM_DEFAULT_PLOT_COUNT,
        plotsPayload: createEmptyPlots(FARM_DEFAULT_PLOT_COUNT),
        warehousePayload: {},
        seedBagPayload: { ...FARM_DEFAULT_PLAYER_SEED_BAG },
        // 起步赠 2 包化肥 + 1 瓶农药，鼓励玩家试用，狗粮要到 5 级解锁后自己买。
        consumablesPayload: { fertilizer: 2, pesticide: 1, dog_food: 0 },
        dogPayload: createDefaultDog(),
        weeklyStolenLogPayload: [],
        lastTickAt: null,
      });
      state = await this.playerRepo.save(state);
    } else {
      let mutated = false;
      const desiredPlotCount = computePlotCountForLevel(state.level);
      if (desiredPlotCount > state.plotCount) {
        state.plotCount = desiredPlotCount;
        mutated = true;
      }
      const plots = ensurePlotsArray(state.plotsPayload, state.plotCount);
      if (plots !== state.plotsPayload) {
        state.plotsPayload = plots;
        mutated = true;
      }
      const warehouse = state.warehousePayload ?? {};
      if (!state.warehousePayload) {
        state.warehousePayload = warehouse;
        mutated = true;
      }
      const seedBag = state.seedBagPayload ?? { ...FARM_DEFAULT_PLAYER_SEED_BAG };
      if (!state.seedBagPayload) {
        state.seedBagPayload = seedBag;
        mutated = true;
      }
      const stolen = pruneStolenLog(state.weeklyStolenLogPayload ?? []);
      if (stolen !== state.weeklyStolenLogPayload) {
        state.weeklyStolenLogPayload = stolen;
        mutated = true;
      }
      if (!state.consumablesPayload) {
        state.consumablesPayload = { fertilizer: 0, pesticide: 0, dog_food: 0 };
        mutated = true;
      }
      if (!state.dogPayload) {
        state.dogPayload = createDefaultDog();
        mutated = true;
      }
      if (mutated) {
        state = await this.playerRepo.save(state);
      }
    }
    return state;
  }

  async getPlayerStateView(ownerId: string): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    return this.toPlayerView(state);
  }

  async resolveOwnerId(): Promise<string> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    return owner.id;
  }

  async plant(
    ownerId: string,
    plotIndex: number,
    cropId: FarmCropId,
  ): Promise<FarmPlayerStateView> {
    if (!isFarmCropId(cropId)) {
      throw new AppError('FARM_UNKNOWN_CROP', {
        params: { cropId: String(cropId) },
        legacyMessage: `未知作物：${cropId}`,
      });
    }
    const def = getCropDefinition(cropId);
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.level < def.unlockLevel) {
      throw new AppError('FARM_LEVEL_TOO_LOW', {
        status: HttpStatus.FORBIDDEN,
        params: { unlockLevel: def.unlockLevel, cropName: def.nameZh },
        legacyMessage: `等级不足：需 ${def.unlockLevel} 级才能种 ${def.nameZh}`,
      });
    }
    if (!isCropAvailableNow(cropId)) {
      throw new AppError('FARM_CROP_OUT_OF_SEASON', {
        params: { cropName: def.nameZh },
        legacyMessage: `${def.nameZh} 不在当季，过几个月再来`,
      });
    }
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount).map((p) => ({ ...p }));
    const plot = plots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    // refresh plot stage based on current time before deciding plantability.
    // 持久化的 stage 只会在 plant 时写入（一般是 'seed'），后续靠 toPlayerView 时
    // 调 refreshPlotStage 计算成 ripe/rotten。如果直接拿 plotsPayload.stage 比对，
    // 一块早已腐烂的田会停留在 'seed'，导致前端能看到「已腐烂」按钮但服务端拒绝重新种植。
    const refreshed = refreshPlotStage(plot, Date.now());
    if (refreshed.stage !== 'empty' && refreshed.stage !== 'rotten') {
      throw new AppError('FARM_PLOT_NOT_PLANTABLE', {
        legacyMessage: '该田块当前不能种植',
      });
    }

    const seedBag = { ...(state.seedBagPayload ?? {}) };
    const haveSeeds = (seedBag[cropId] ?? 0) > 0;
    if (haveSeeds) {
      seedBag[cropId] = (seedBag[cropId] ?? 0) - 1;
    } else {
      if (state.coins < def.seedCost) {
        throw new AppError('FARM_INSUFFICIENT_COINS', {
          params: { required: def.seedCost },
          legacyMessage: `金币不足：需 ${def.seedCost}`,
        });
      }
      state.coins -= def.seedCost;
    }

    const now = Date.now();
    plots[plotIndex] = {
      index: plotIndex,
      cropId,
      plantedAt: now,
      maturedAt: computeMaturedAtMs(cropId, now),
      stage: 'seed',
      watered: false,
      weeds: 0,
      bugs: 0,
      stolenBy: [],
      plantedBy: FARM_PLAYER_ACTOR_ID,
    };

    state.plotsPayload = plots;
    state.seedBagPayload = seedBag;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'plant',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId,
      payload: { plotIndex, viaSeedBag: haveSeeds },
    });
    await this.questService.recordAction(ownerId, 'plant');

    return this.toPlayerView(saved);
  }

  async harvest(ownerId: string, plotIndex: number): Promise<FarmHarvestResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount).map((p) => ({ ...p }));
    const plot = plots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    if (!plot.cropId || plot.maturedAt == null) {
      throw new AppError('FARM_PLOT_EMPTY', {
        legacyMessage: '该田块没有作物',
      });
    }
    const now = Date.now();
    if (now < plot.maturedAt) {
      throw new AppError('FARM_CROP_NOT_RIPE', {
        legacyMessage: '作物还没成熟',
      });
    }
    const def = getCropDefinition(plot.cropId);
    const isRotten = now >= computeRottenAtMs(plot.cropId, plot.plantedAt!);
    const baseAmount = plot.yieldOverride ?? rollYield(def.yieldRange);
    const stolenAmount = (plot.stolenBy ?? []).length;
    const remainingAmount = Math.max(1, baseAmount - stolenAmount);
    const amount = isRotten ? Math.max(1, Math.floor(remainingAmount / 2)) : remainingAmount;
    const coinsGained = amount * def.sellPrice;
    const xpGained = isRotten ? Math.floor(def.experience / 2) : def.experience;

    state.coins += coinsGained;
    state.experience += xpGained;
    state.totalHarvested = (state.totalHarvested ?? 0) + amount;
    const newLevel = computeLevelFromExperience(state.experience);
    const leveledUp = newLevel > state.level;
    state.level = newLevel;
    const desiredPlotCount = computePlotCountForLevel(state.level);
    if (desiredPlotCount > state.plotCount) {
      state.plotCount = desiredPlotCount;
    }

    const warehouse = { ...(state.warehousePayload ?? {}) };
    warehouse[plot.cropId] = (warehouse[plot.cropId] ?? 0) + amount;
    state.warehousePayload = warehouse;

    // 多年生果树（apple_tree / peach_tree / ...）：收完不清空，进入下一茬周期。
    if (def.isPerennial && def.perennialCycleHours && !isRotten) {
      const nextMaturedAt = now + def.perennialCycleHours * 3_600_000;
      plots[plotIndex] = {
        ...plot,
        maturedAt: nextMaturedAt,
        plantedAt: now,
        stage: 'seed',
        watered: false,
        weeds: 0,
        bugs: 0,
        stolenBy: [],
        fertilized: false,
        pesticideUntilMs: null,
        harvestCount: (plot.harvestCount ?? 0) + 1,
      };
    } else {
      plots[plotIndex] = createEmptyPlot(plotIndex);
    }
    if (state.plotCount > plots.length) {
      for (let i = plots.length; i < state.plotCount; i += 1) {
        plots.push(createEmptyPlot(i));
      }
    }
    state.plotsPayload = plots;

    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'harvest',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId: plot.cropId,
      payload: { plotIndex, amount, coinsGained, isRotten, xpGained },
    });

    if (leveledUp) {
      await this.eventService.recordEvent({
        ownerId,
        kind: 'level_up',
        actorType: 'owner',
        actorId: FARM_PLAYER_ACTOR_ID,
        actorName: '我',
        payload: { level: state.level, plotCount: state.plotCount },
      });
      await this.questService.syncLevelAchievements(ownerId, state.level);
    }
    // harvest 任务按 plot 次数算（一次收获 = 一次推进），不按 amount
    await this.questService.recordAction(ownerId, 'harvest', 1);

    return {
      player: this.toPlayerView(saved),
      harvested: {
        cropId: plot.cropId,
        amount,
        coinsGained,
        experienceGained: xpGained,
        leveledUp,
      },
    };
  }

  async waterPlot(
    ownerId: string,
    target: MaintenanceTarget,
  ): Promise<FarmPlayerStateView> {
    if (target.kind === 'npc') {
      throw new AppError('FARM_NPC_OPERATION_NOT_OPEN', {
        params: { op: 'water' },
        legacyMessage: '对 NPC 浇水将在邻居模块开放',
      });
    }
    return this.maintainSelfPlot(ownerId, target.plotIndex, 'water');
  }

  async weedPlot(
    ownerId: string,
    target: MaintenanceTarget,
  ): Promise<FarmPlayerStateView> {
    if (target.kind === 'npc') {
      throw new AppError('FARM_NPC_OPERATION_NOT_OPEN', {
        params: { op: 'weed' },
        legacyMessage: '对 NPC 除草将在邻居模块开放',
      });
    }
    return this.maintainSelfPlot(ownerId, target.plotIndex, 'weed');
  }

  async debugPlot(
    ownerId: string,
    target: MaintenanceTarget,
  ): Promise<FarmPlayerStateView> {
    if (target.kind === 'npc') {
      throw new AppError('FARM_NPC_OPERATION_NOT_OPEN', {
        params: { op: 'debug' },
        legacyMessage: '对 NPC 除虫将在邻居模块开放',
      });
    }
    return this.maintainSelfPlot(ownerId, target.plotIndex, 'debug');
  }

  async buySeed(
    ownerId: string,
    cropId: FarmCropId,
    quantity: number,
  ): Promise<FarmPlayerStateView> {
    if (!isFarmCropId(cropId)) {
      throw new AppError('FARM_UNKNOWN_CROP', {
        params: { cropId: String(cropId) },
        legacyMessage: `未知作物：${cropId}`,
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new AppError('FARM_QUANTITY_INVALID', {
        legacyMessage: '数量必须为正整数',
      });
    }
    const def = getCropDefinition(cropId);
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.level < def.unlockLevel) {
      throw new AppError('FARM_BUY_LEVEL_TOO_LOW', {
        status: HttpStatus.FORBIDDEN,
        params: { unlockLevel: def.unlockLevel, cropName: def.nameZh },
        legacyMessage: `等级不足：需 ${def.unlockLevel} 级才能购买 ${def.nameZh} 种子`,
      });
    }
    // UI 的 seed-shop-sheet 已经按 isFarmCropInSeason 过滤掉了过季作物，
    // 但 API 之前是裸的：客户端绕过 / API 直调可以买到 7 个月后才能种的种子，
    // 等于 coins 沉淀，plant 时再报 OUT_OF_SEASON。补齐服务端的同步校验。
    if (!isCropAvailableNow(cropId)) {
      throw new AppError('FARM_CROP_OUT_OF_SEASON', {
        params: { cropName: def.nameZh },
        legacyMessage: `${def.nameZh} 不在当季，过几个月再来`,
      });
    }
    const totalCost = def.seedCost * quantity;
    if (state.coins < totalCost) {
      throw new AppError('FARM_INSUFFICIENT_COINS', {
        params: { required: totalCost },
        legacyMessage: `金币不足：需 ${totalCost}`,
      });
    }
    state.coins -= totalCost;
    const seedBag = { ...(state.seedBagPayload ?? {}) };
    seedBag[cropId] = (seedBag[cropId] ?? 0) + quantity;
    state.seedBagPayload = seedBag;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'buy',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId,
      payload: { quantity, totalCost },
    });

    return this.toPlayerView(saved);
  }

  async sellCrop(
    ownerId: string,
    cropId: FarmCropId,
    quantity: number,
  ): Promise<FarmPlayerStateView> {
    if (!isFarmCropId(cropId)) {
      throw new AppError('FARM_UNKNOWN_CROP', {
        params: { cropId: String(cropId) },
        legacyMessage: `未知作物：${cropId}`,
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new AppError('FARM_QUANTITY_INVALID', {
        legacyMessage: '数量必须为正整数',
      });
    }
    const def = getCropDefinition(cropId);
    const state = await this.getOrCreatePlayerState(ownerId);
    const warehouse = { ...(state.warehousePayload ?? {}) };
    const have = warehouse[cropId] ?? 0;
    if (have < quantity) {
      throw new AppError('FARM_WAREHOUSE_INSUFFICIENT', {
        params: { cropName: def.nameZh },
        legacyMessage: `仓库中 ${def.nameZh} 不足`,
      });
    }
    warehouse[cropId] = have - quantity;
    state.warehousePayload = warehouse;
    const coinsGained = def.sellPrice * quantity;
    state.coins += coinsGained;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'sell',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId,
      payload: { quantity, coinsGained },
    });

    return this.toPlayerView(saved);
  }

  async assertDailyStealQuota(state: FarmPlayerStateEntity): Promise<void> {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const recent = (state.weeklyStolenLogPayload ?? []).filter(
      (entry) => entry.atMs >= cutoff && entry.thiefCharacterId === FARM_PLAYER_ACTOR_ID,
    );
    if (recent.length >= FARM_PLAYER_DAILY_STEAL_LIMIT) {
      throw new AppError('FARM_DAILY_STEAL_LIMIT', {
        status: HttpStatus.FORBIDDEN,
        params: { limit: FARM_PLAYER_DAILY_STEAL_LIMIT },
        legacyMessage: `今日偷菜次数已达上限（${FARM_PLAYER_DAILY_STEAL_LIMIT}/天）`,
      });
    }
  }

  async stealFromNpc(
    ownerId: string,
    characterId: string,
    plotIndex: number,
  ): Promise<FarmStealResult> {
    if (FARM_EXCLUDED_CHARACTER_IDS.has(characterId)) {
      throw new AppError('FARM_CHARACTER_NOT_PARTICIPATING', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色不参与农场',
      });
    }
    const character = await this.charactersService.findById(characterId);
    if (!character) {
      throw new AppError('FARM_CHARACTER_NOT_FOUND', {
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
      throw new AppError('FARM_CHARACTER_NOT_VISIBLE', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色当前不可见',
      });
    }
    const npc = await this.npcRepo.findOneBy({ characterId });
    if (!npc) {
      throw new AppError('FARM_NPC_NO_FARM', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色还没有农场',
      });
    }
    const npcPlots = ensurePlotsArray(npc.plotsPayload, npc.plotCount).map((p) => ({ ...p }));
    const plot = npcPlots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    if (
      !plot.cropId ||
      plot.maturedAt == null ||
      Date.now() < plot.maturedAt
    ) {
      throw new AppError('FARM_CROP_NOT_RIPE', {
        legacyMessage: '该作物还没成熟',
      });
    }
    if ((plot.stolenBy ?? []).includes(FARM_PLAYER_ACTOR_ID)) {
      throw new AppError('FARM_ALREADY_STOLEN', {
        legacyMessage: '你已经偷过这块田了',
      });
    }

    const player = await this.getOrCreatePlayerState(ownerId);
    await this.assertDailyStealQuota(player);

    const def = getCropDefinition(plot.cropId);
    const stolenAmount = Math.max(1, Math.floor((plot.yieldOverride ?? def.yieldRange[0]) / 2));
    const coinsGained = stolenAmount * Math.max(1, Math.floor(def.sellPrice / 2));

    plot.stolenBy = [...(plot.stolenBy ?? []), FARM_PLAYER_ACTOR_ID];
    npcPlots[plotIndex] = plot;
    npc.plotsPayload = npcPlots;
    await this.npcRepo.save(npc);

    const playerWarehouse = { ...(player.warehousePayload ?? {}) };
    playerWarehouse[plot.cropId] = (playerWarehouse[plot.cropId] ?? 0) + stolenAmount;
    player.warehousePayload = playerWarehouse;
    player.coins += coinsGained;
    const stolenLog = pruneStolenLog(player.weeklyStolenLogPayload ?? []);
    stolenLog.push({
      thiefCharacterId: FARM_PLAYER_ACTOR_ID,
      thiefName: '我',
      cropId: plot.cropId,
      amount: stolenAmount,
      atMs: Date.now(),
    });
    player.weeklyStolenLogPayload = stolenLog;
    const savedPlayer = await this.playerRepo.save(player);

    // 跟 gift 一样，response.intimacyDelta 用 newIntimacy - oldIntimacy；
    // 若对方好感已经 0，"再扣 -3" 实际不变化，事件流和返回值就不再撒谎 -3。
    const oldIntimacy = character.intimacyLevel ?? 0;
    const newIntimacy = Math.max(0, Math.min(100, oldIntimacy - 3));
    const intimacyDelta = newIntimacy - oldIntimacy;
    if (newIntimacy !== oldIntimacy) {
      character.intimacyLevel = newIntimacy;
      await this.charactersService.upsert(character);
    }

    await this.eventService.recordEvent({
      ownerId,
      kind: 'steal',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      targetType: 'character',
      targetId: characterId,
      targetName: character.name,
      cropId: plot.cropId,
      intimacyDelta,
      payload: { plotIndex, stolenAmount, coinsGained },
    });

    const target: FarmNeighborSummary = {
      characterId,
      characterName: character.name,
      characterAvatar: character.avatar ?? null,
      intimacyLevel: newIntimacy,
      isOnline: character.isOnline ?? false,
      ripePlotCount: npcPlots.filter(
        (p) => p.cropId && p.maturedAt != null && Date.now() >= p.maturedAt,
      ).length,
      totalPlotCount: npc.plotCount,
      level: npc.level,
      coins: npc.coins,
      lastActedAt:
        npc.lastActedAt instanceof Date
          ? npc.lastActedAt.toISOString()
          : npc.lastActedAt
            ? new Date(npc.lastActedAt).toISOString()
            : null,
      expertDomains: character.expertDomains ?? [],
      relationship: character.relationship ?? null,
    };

    await this.questService.recordAction(ownerId, 'steal');

    return {
      player: this.toPlayerView(savedPlayer),
      target,
      stolen: {
        cropId: plot.cropId,
        amount: stolenAmount,
        coinsGained,
        intimacyDelta,
      },
    };
  }

  toPlayerView(state: FarmPlayerStateEntity): FarmPlayerStateView {
    const nowMs = Date.now();
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount);
    const refreshed = plots.map((p) => refreshPlotStage(p, nowMs));
    const rawDog = state.dogPayload ?? createDefaultDog();
    const dog: FarmDogState = {
      level: rawDog.level,
      energy: computeDogEnergy(rawDog, nowMs),
      lastFedAt: rawDog.lastFedAt ?? null,
    };
    return {
      ownerId: state.ownerId,
      coins: state.coins,
      experience: state.experience,
      level: state.level,
      plotCount: state.plotCount,
      plots: refreshed,
      warehouse: state.warehousePayload ?? {},
      seedBag: state.seedBagPayload ?? {},
      consumables: {
        fertilizer: state.consumablesPayload?.fertilizer ?? 0,
        pesticide: state.consumablesPayload?.pesticide ?? 0,
        dog_food: state.consumablesPayload?.dog_food ?? 0,
      },
      dog,
      decorationInventory: FARM_DECORATION_IDS.reduce(
        (acc, id) => {
          acc[id] = state.decorationInventoryPayload?.[id] ?? 0;
          return acc;
        },
        {} as Record<FarmDecorationId, number>,
      ),
      placedDecorations: state.placedDecorationsPayload ?? [],
      weeklyStolenLog: pruneStolenLog(state.weeklyStolenLogPayload ?? []),
      serverNowMs: nowMs,
      updatedAt:
        state.updatedAt instanceof Date
          ? state.updatedAt.toISOString()
          : new Date(state.updatedAt).toISOString(),
    };
  }

  async buyConsumable(
    ownerId: string,
    consumableId: FarmConsumableId,
    quantity: number,
  ): Promise<FarmConsumablePurchaseResult> {
    if (!isFarmConsumableId(consumableId)) {
      throw new AppError('FARM_UNKNOWN_CONSUMABLE', {
        params: { consumableId: String(consumableId) },
        legacyMessage: `未知道具：${consumableId}`,
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new AppError('FARM_QUANTITY_INVALID', {
        legacyMessage: '数量必须为正整数',
      });
    }
    const def = getConsumableDefinition(consumableId);
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.level < def.unlockLevel) {
      throw new AppError('FARM_CONSUMABLE_LEVEL_TOO_LOW', {
        status: HttpStatus.FORBIDDEN,
        params: { unlockLevel: def.unlockLevel, name: def.nameZh },
        legacyMessage: `等级不足：需 ${def.unlockLevel} 级才能购买 ${def.nameZh}`,
      });
    }
    const totalCost = def.price * quantity;
    if (state.coins < totalCost) {
      throw new AppError('FARM_INSUFFICIENT_COINS', {
        params: { required: totalCost },
        legacyMessage: `金币不足：需 ${totalCost}`,
      });
    }
    state.coins -= totalCost;
    const bag = { ...(state.consumablesPayload ?? {}) };
    bag[consumableId] = (bag[consumableId] ?? 0) + quantity;
    state.consumablesPayload = bag;
    const saved = await this.playerRepo.save(state);
    await this.eventService.recordEvent({
      ownerId,
      kind: 'buy',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      payload: { consumableId, quantity, totalCost },
    });
    return {
      player: this.toPlayerView(saved),
      consumableId,
      quantity,
      coinsSpent: totalCost,
    };
  }

  async applyFertilizer(
    ownerId: string,
    plotIndex: number,
  ): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount).map((p) => ({ ...p }));
    const plot = plots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    if (!plot.cropId || plot.plantedAt == null || plot.maturedAt == null) {
      throw new AppError('FARM_PLOT_EMPTY', { legacyMessage: '该田块没有作物' });
    }
    const nowMs = Date.now();
    if (nowMs >= plot.maturedAt) {
      throw new AppError('FARM_FERTILIZER_TOO_LATE', {
        legacyMessage: '作物已经成熟，再施肥也没意义',
      });
    }
    if (plot.fertilized) {
      throw new AppError('FARM_ALREADY_FERTILIZED', {
        legacyMessage: '这株作物已经施过肥了',
      });
    }
    const bag = { ...(state.consumablesPayload ?? {}) };
    if ((bag.fertilizer ?? 0) <= 0) {
      throw new AppError('FARM_NO_FERTILIZER', {
        legacyMessage: '化肥不足，去农资店买一点',
      });
    }
    bag.fertilizer = (bag.fertilizer ?? 0) - 1;
    state.consumablesPayload = bag;

    const remaining = plot.maturedAt - nowMs;
    const shrink = Math.floor(remaining * FARM_FERTILIZER_SHRINK_RATIO);
    plot.maturedAt = plot.maturedAt - shrink;
    plot.fertilized = true;
    plots[plotIndex] = plot;
    state.plotsPayload = plots;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'fertilize',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId: plot.cropId,
      payload: { plotIndex, shrinkMs: shrink },
    });

    return this.toPlayerView(saved);
  }

  async applyPesticide(
    ownerId: string,
    plotIndex: number,
  ): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount).map((p) => ({ ...p }));
    const plot = plots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    if (!plot.cropId) {
      throw new AppError('FARM_PLOT_EMPTY', { legacyMessage: '该田块没有作物' });
    }
    const bag = { ...(state.consumablesPayload ?? {}) };
    if ((bag.pesticide ?? 0) <= 0) {
      throw new AppError('FARM_NO_PESTICIDE', {
        legacyMessage: '农药不足，去农资店买一瓶',
      });
    }
    bag.pesticide = (bag.pesticide ?? 0) - 1;
    state.consumablesPayload = bag;

    const nowMs = Date.now();
    plot.bugs = 0;
    plot.pesticideUntilMs = nowMs + FARM_PESTICIDE_PROTECT_HOURS * 3_600_000;
    plots[plotIndex] = plot;
    state.plotsPayload = plots;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'pesticide',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId: plot.cropId,
      payload: { plotIndex, protectUntilMs: plot.pesticideUntilMs },
    });

    return this.toPlayerView(saved);
  }

  async buyOrUpgradeDog(ownerId: string): Promise<FarmDogPurchaseResult> {
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.level < FARM_DOG_UNLOCK_LEVEL) {
      throw new AppError('FARM_DOG_LEVEL_TOO_LOW', {
        status: HttpStatus.FORBIDDEN,
        params: { unlockLevel: FARM_DOG_UNLOCK_LEVEL },
        legacyMessage: `等级不足：需 ${FARM_DOG_UNLOCK_LEVEL} 级才能养狗`,
      });
    }
    const dog = state.dogPayload ?? createDefaultDog();
    if (dog.level >= FARM_DOG_LEVEL_CAP) {
      throw new AppError('FARM_DOG_MAX_LEVEL', {
        legacyMessage: '看家狗已经满级啦',
      });
    }
    const nextLevel = dog.level + 1;
    const cost = FARM_DOG_UPGRADE_COSTS[nextLevel] ?? FARM_DOG_BUY_COST;
    if (state.coins < cost) {
      throw new AppError('FARM_INSUFFICIENT_COINS', {
        params: { required: cost },
        legacyMessage: `金币不足：需 ${cost}`,
      });
    }
    state.coins -= cost;
    const isFirstPurchase = dog.level === 0;
    const nowMs = Date.now();
    // 升级时之前直接用 dog.energy（库里 raw 值）+40，没考虑从 lastFedAt 到现在的衰减。
    // 玩家离线 10 小时（衰减 40 点）后再上线升级 → 库里 dog.energy 还是离线前的值，
    // +40 把"虚高"的旧能量当当前能量算，凭空多发 40 点。改用 computeDogEnergy
    // 拿衰减后的实际值。
    const decayedEnergy = computeDogEnergy(dog, nowMs);
    const newDog: FarmDogState = {
      level: nextLevel,
      energy: isFirstPurchase ? 100 : Math.min(100, decayedEnergy + 40),
      lastFedAt: nowMs,
    };
    state.dogPayload = newDog;
    const saved = await this.playerRepo.save(state);
    await this.eventService.recordEvent({
      ownerId,
      kind: isFirstPurchase ? 'dog_buy' : 'dog_upgrade',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      payload: { level: nextLevel, cost },
    });
    if (isFirstPurchase) {
      await this.questService.recordAction(ownerId, 'buy_dog');
    }
    return {
      player: this.toPlayerView(saved),
      dog: { ...newDog, energy: computeDogEnergy(newDog, Date.now()) },
      coinsSpent: cost,
    };
  }

  async feedDog(ownerId: string): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const dog = state.dogPayload ?? createDefaultDog();
    if (dog.level <= 0) {
      throw new AppError('FARM_NO_DOG', { legacyMessage: '你还没养狗' });
    }
    const bag = { ...(state.consumablesPayload ?? {}) };
    if ((bag.dog_food ?? 0) <= 0) {
      throw new AppError('FARM_NO_DOG_FOOD', {
        legacyMessage: '狗粮不足，去农资店买一些',
      });
    }
    bag.dog_food = (bag.dog_food ?? 0) - 1;
    state.consumablesPayload = bag;

    const nowMs = Date.now();
    const decayed = computeDogEnergy(dog, nowMs);
    const newDog: FarmDogState = {
      level: dog.level,
      energy: Math.min(100, decayed + FARM_DOG_FEED_RESTORE),
      lastFedAt: nowMs,
    };
    state.dogPayload = newDog;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: 'dog_feed',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      payload: { energy: newDog.energy, level: newDog.level },
    });
    return this.toPlayerView(saved);
  }

  async uprootPlot(
    ownerId: string,
    plotIndex: number,
  ): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount).map((p) => ({ ...p }));
    const plot = plots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    if (!plot.cropId) {
      throw new AppError('FARM_PLOT_EMPTY', { legacyMessage: '该田块没有作物' });
    }
    const def = getCropDefinition(plot.cropId);
    // 普通一年生作物也允许铲除（中途换种），但只是清空，没有惩罚。
    // 多年生果树铲掉后空地可重新种别的。
    plots[plotIndex] = createEmptyPlot(plotIndex);
    state.plotsPayload = plots;
    const saved = await this.playerRepo.save(state);
    await this.eventService.recordEvent({
      ownerId,
      kind: 'uproot',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId: plot.cropId,
      payload: { plotIndex, wasPerennial: !!def.isPerennial },
    });
    return this.toPlayerView(saved);
  }

  async buyDecoration(
    ownerId: string,
    decorationId: FarmDecorationId,
    quantity: number,
  ): Promise<FarmDecorationPurchaseResult> {
    if (!isFarmDecorationId(decorationId)) {
      throw new AppError('FARM_UNKNOWN_DECORATION', {
        params: { decorationId: String(decorationId) },
        legacyMessage: `未知装饰：${decorationId}`,
      });
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new AppError('FARM_QUANTITY_INVALID', {
        legacyMessage: '数量必须为正整数',
      });
    }
    const def = getDecorationDefinition(decorationId);
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.level < def.unlockLevel) {
      throw new AppError('FARM_DECORATION_LEVEL_TOO_LOW', {
        status: HttpStatus.FORBIDDEN,
        params: { unlockLevel: def.unlockLevel, name: def.nameZh },
        legacyMessage: `等级不足：需 ${def.unlockLevel} 级才能购买 ${def.nameZh}`,
      });
    }
    const totalCost = def.price * quantity;
    if (state.coins < totalCost) {
      throw new AppError('FARM_INSUFFICIENT_COINS', {
        params: { required: totalCost },
        legacyMessage: `金币不足：需 ${totalCost}`,
      });
    }
    state.coins -= totalCost;
    const inv = { ...(state.decorationInventoryPayload ?? {}) };
    inv[decorationId] = (inv[decorationId] ?? 0) + quantity;
    state.decorationInventoryPayload = inv;
    const saved = await this.playerRepo.save(state);
    await this.eventService.recordEvent({
      ownerId,
      kind: 'buy',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      payload: { decorationId, quantity, totalCost },
    });
    return {
      player: this.toPlayerView(saved),
      decorationId,
      quantity,
      coinsSpent: totalCost,
    };
  }

  async placeDecoration(
    ownerId: string,
    decorationId: FarmDecorationId,
    x: number,
    y: number,
  ): Promise<FarmDecorationPlaceResult> {
    if (!isFarmDecorationId(decorationId)) {
      throw new AppError('FARM_UNKNOWN_DECORATION', {
        params: { decorationId: String(decorationId) },
        legacyMessage: `未知装饰：${decorationId}`,
      });
    }
    const clampedX = clamp01Hundred(x);
    const clampedY = clamp01Hundred(y);
    const state = await this.getOrCreatePlayerState(ownerId);
    const inv = { ...(state.decorationInventoryPayload ?? {}) };
    if ((inv[decorationId] ?? 0) <= 0) {
      throw new AppError('FARM_DECORATION_OUT_OF_STOCK', {
        legacyMessage: '这个装饰你还没买',
      });
    }
    inv[decorationId] = (inv[decorationId] ?? 0) - 1;
    state.decorationInventoryPayload = inv;

    const placement: FarmDecorationPlacement = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type: decorationId,
      x: clampedX,
      y: clampedY,
    };
    const placed = [...(state.placedDecorationsPayload ?? []), placement];
    state.placedDecorationsPayload = placed;
    const saved = await this.playerRepo.save(state);
    await this.eventService.recordEvent({
      ownerId,
      kind: 'decorate',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      payload: { decorationId, x: clampedX, y: clampedY },
    });
    return { player: this.toPlayerView(saved), placement };
  }

  async removeDecoration(
    ownerId: string,
    placementId: string,
  ): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const placed = state.placedDecorationsPayload ?? [];
    const idx = placed.findIndex((p) => p.id === placementId);
    if (idx === -1) {
      throw new AppError('FARM_DECORATION_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '找不到该装饰',
      });
    }
    const removed = placed[idx]!;
    state.placedDecorationsPayload = placed.filter((_, i) => i !== idx);
    const inv = { ...(state.decorationInventoryPayload ?? {}) };
    inv[removed.type] = (inv[removed.type] ?? 0) + 1;
    state.decorationInventoryPayload = inv;
    const saved = await this.playerRepo.save(state);
    return this.toPlayerView(saved);
  }

  // 已放置装饰里是否包含 scarecrow（影响 NPC tick 的 bug 生成）。
  async hasScarecrow(ownerId: string): Promise<boolean> {
    const state = await this.playerRepo.findOneBy({ ownerId });
    if (!state) return false;
    return (state.placedDecorationsPayload ?? []).some((p) => p.type === 'scarecrow');
  }

  async giftCoinsToNeighbor(
    ownerId: string,
    characterId: string,
    amount: number,
  ): Promise<FarmGiftCoinsResult> {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
      throw new AppError('FARM_GIFT_AMOUNT_INVALID', {
        legacyMessage: '金额必须为正整数',
      });
    }
    if (amount > FARM_GIFT_DAILY_LIMIT_COINS) {
      throw new AppError('FARM_GIFT_LIMIT_EXCEEDED', {
        params: { limit: FARM_GIFT_DAILY_LIMIT_COINS },
        legacyMessage: `单次送礼不能超过 ${FARM_GIFT_DAILY_LIMIT_COINS} 金币`,
      });
    }
    // 系统角色（我自己 / 小盯 / 界闻）不能收礼 — 否则金币会被实质性"销毁"，
    // 玩家以为送给了邻居，实际是给一个没 farm state 的虚角色。
    if (FARM_EXCLUDED_CHARACTER_IDS.has(characterId)) {
      throw new AppError('FARM_CHARACTER_NOT_PARTICIPATING', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色不参与农场',
      });
    }
    const character = await this.charactersService.findById(characterId);
    if (!character) {
      throw new AppError('FARM_CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { characterId },
        legacyMessage: `角色不存在：${characterId}`,
      });
    }
    // 好感已经满 100 还允许送礼的话，玩家金币照扣、ledger 写一条 intimacyDelta=正数
    // 的 intimacy_change，但 character.intimacyLevel 被 Math.min(100, ...) 截掉没动 —
    // 接口对外撒谎、玩家白送一笔。直接拒掉，留给玩家自己判断要不要继续刷。
    if ((character.intimacyLevel ?? 0) >= 100) {
      throw new AppError('FARM_INTIMACY_MAXED', {
        status: HttpStatus.CONFLICT,
        params: { characterName: character.name },
        legacyMessage: `${character.name} 的好感度已满，再送也不会涨了`,
      });
    }
    const state = await this.getOrCreatePlayerState(ownerId);
    if (state.coins < amount) {
      throw new AppError('FARM_INSUFFICIENT_COINS', {
        params: { required: amount },
        legacyMessage: `金币不足：需 ${amount}`,
      });
    }
    state.coins -= amount;
    const npc = await this.npcRepo.findOneBy({ characterId });
    if (npc) {
      npc.coins += amount;
      await this.npcRepo.save(npc);
    }
    const requestedDelta = Math.max(
      1,
      Math.floor((amount / 100) * FARM_GIFT_INTIMACY_PER_100_COINS),
    );
    const oldIntimacy = character.intimacyLevel ?? 0;
    const newIntimacy = Math.max(0, Math.min(100, oldIntimacy + requestedDelta));
    const intimacyDelta = newIntimacy - oldIntimacy;
    if (newIntimacy !== oldIntimacy) {
      character.intimacyLevel = newIntimacy;
      await this.charactersService.upsert(character);
    }
    const saved = await this.playerRepo.save(state);
    await this.eventService.recordEvent({
      ownerId,
      kind: 'intimacy_change',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      targetType: 'character',
      targetId: characterId,
      targetName: character.name,
      intimacyDelta,
      payload: { giftKind: 'coins', amount },
    });
    await this.questService.recordAction(ownerId, 'gift');
    return {
      player: this.toPlayerView(saved),
      target: await this.buildNeighborSummary(character, npc),
      coinsGifted: amount,
      intimacyDelta,
    };
  }

  async giftItemToNeighbor(
    ownerId: string,
    characterId: string,
    itemKind: 'crop' | 'seed' | 'consumable',
    itemId: string,
    quantity: number,
  ): Promise<FarmGiftItemResult> {
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw new AppError('FARM_GIFT_AMOUNT_INVALID', {
        legacyMessage: '数量必须为正整数',
      });
    }
    if (FARM_EXCLUDED_CHARACTER_IDS.has(characterId)) {
      throw new AppError('FARM_CHARACTER_NOT_PARTICIPATING', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '该角色不参与农场',
      });
    }
    const character = await this.charactersService.findById(characterId);
    if (!character) {
      throw new AppError('FARM_CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { characterId },
        legacyMessage: `角色不存在：${characterId}`,
      });
    }
    if ((character.intimacyLevel ?? 0) >= 100) {
      throw new AppError('FARM_INTIMACY_MAXED', {
        status: HttpStatus.CONFLICT,
        params: { characterName: character.name },
        legacyMessage: `${character.name} 的好感度已满，再送也不会涨了`,
      });
    }
    const state = await this.getOrCreatePlayerState(ownerId);
    let displayName = itemId;
    if (itemKind === 'crop' || itemKind === 'seed') {
      if (!isFarmCropId(itemId)) {
        throw new AppError('FARM_UNKNOWN_CROP', {
          params: { cropId: itemId },
          legacyMessage: `未知作物：${itemId}`,
        });
      }
      displayName = getCropDefinition(itemId as FarmCropId).nameZh;
      if (itemKind === 'crop') {
        const wh = { ...(state.warehousePayload ?? {}) };
        if ((wh[itemId] ?? 0) < quantity) {
          throw new AppError('FARM_WAREHOUSE_INSUFFICIENT', {
            params: { cropName: displayName },
            legacyMessage: `仓库中 ${displayName} 不足`,
          });
        }
        wh[itemId] = (wh[itemId] ?? 0) - quantity;
        state.warehousePayload = wh;
      } else {
        const bag = { ...(state.seedBagPayload ?? {}) };
        if ((bag[itemId] ?? 0) < quantity) {
          throw new AppError('FARM_SEED_BAG_INSUFFICIENT', {
            params: { cropName: displayName },
            legacyMessage: `种子袋中 ${displayName} 不足`,
          });
        }
        bag[itemId] = (bag[itemId] ?? 0) - quantity;
        state.seedBagPayload = bag;
      }
    } else {
      if (!isFarmConsumableId(itemId)) {
        throw new AppError('FARM_UNKNOWN_CONSUMABLE', {
          params: { consumableId: itemId },
          legacyMessage: `未知道具：${itemId}`,
        });
      }
      displayName = getConsumableDefinition(itemId as FarmConsumableId).nameZh;
      const bag = { ...(state.consumablesPayload ?? {}) };
      if ((bag[itemId as FarmConsumableId] ?? 0) < quantity) {
        throw new AppError('FARM_CONSUMABLE_INSUFFICIENT', {
          params: { name: displayName },
          legacyMessage: `${displayName} 不足`,
        });
      }
      bag[itemId as FarmConsumableId] = (bag[itemId as FarmConsumableId] ?? 0) - quantity;
      state.consumablesPayload = bag;
    }

    const requestedDelta = Math.max(1, quantity * FARM_GIFT_INTIMACY_PER_ITEM);
    const oldIntimacy = character.intimacyLevel ?? 0;
    const newIntimacy = Math.max(0, Math.min(100, oldIntimacy + requestedDelta));
    const intimacyDelta = newIntimacy - oldIntimacy;
    if (newIntimacy !== oldIntimacy) {
      character.intimacyLevel = newIntimacy;
      await this.charactersService.upsert(character);
    }
    const saved = await this.playerRepo.save(state);
    const npc = await this.npcRepo.findOneBy({ characterId });
    await this.eventService.recordEvent({
      ownerId,
      kind: 'intimacy_change',
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      targetType: 'character',
      targetId: characterId,
      targetName: character.name,
      intimacyDelta,
      payload: { giftKind: itemKind, itemId, quantity },
    });
    await this.questService.recordAction(ownerId, 'gift');
    return {
      player: this.toPlayerView(saved),
      target: await this.buildNeighborSummary(character, npc),
      itemKind,
      itemId,
      quantity,
      intimacyDelta,
    };
  }

  // 私有：给 npc 数据 + character 实体拼一个 FarmNeighborSummary。
  // gift / steal 等场景都用得到，省去重复样板。
  private async buildNeighborSummary(
    character: { id: string; name: string; avatar?: string | null; intimacyLevel?: number; isOnline?: boolean; expertDomains?: string[]; relationship?: string | null },
    npc: FarmNpcStateEntity | null,
  ): Promise<FarmNeighborSummary> {
    return {
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar ?? null,
      intimacyLevel: character.intimacyLevel ?? 0,
      isOnline: character.isOnline ?? false,
      ripePlotCount: npc
        ? ensurePlotsArray(npc.plotsPayload, npc.plotCount).filter(
            (p) => p.cropId && p.maturedAt != null && Date.now() >= p.maturedAt,
          ).length
        : 0,
      totalPlotCount: npc?.plotCount ?? 0,
      level: npc?.level ?? 1,
      coins: npc?.coins ?? 0,
      lastActedAt:
        npc?.lastActedAt instanceof Date
          ? npc.lastActedAt.toISOString()
          : npc?.lastActedAt
            ? new Date(npc.lastActedAt).toISOString()
            : null,
      expertDomains: character.expertDomains ?? [],
      relationship: character.relationship ?? null,
    };
  }

  // 公用：NPC 偷玩家时调用，返回 true 表示被狗拦住，应在调用方撤销偷菜战果。
  // 单独抽出来让 npc-tick 不直接复制 dog 计算逻辑。
  async tryBlockNpcSteal(
    state: FarmPlayerStateEntity,
    nowMs: number,
  ): Promise<{ blocked: boolean; dogLevel: number; energy: number }> {
    const dog = state.dogPayload ?? createDefaultDog();
    if (dog.level <= 0) {
      return { blocked: false, dogLevel: 0, energy: 0 };
    }
    const energy = computeDogEnergy(dog, nowMs);
    const blockRate = computeDogBlockRate(dog, nowMs);
    const roll = Math.random();
    return {
      blocked: roll < blockRate,
      dogLevel: dog.level,
      energy,
    };
  }

  private async maintainSelfPlot(
    ownerId: string,
    plotIndex: number,
    action: 'water' | 'weed' | 'debug',
  ): Promise<FarmPlayerStateView> {
    const state = await this.getOrCreatePlayerState(ownerId);
    const plots = ensurePlotsArray(state.plotsPayload, state.plotCount).map((p) => ({ ...p }));
    const plot = plots[plotIndex];
    if (!plot) {
      throw new AppError('FARM_PLOT_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        legacyMessage: '田块不存在',
      });
    }
    if (!plot.cropId) {
      throw new AppError('FARM_PLOT_EMPTY', {
        legacyMessage: '该田块没有作物',
      });
    }

    if (action === 'water') {
      if (plot.watered) {
        throw new AppError('FARM_ALREADY_WATERED', {
          legacyMessage: '该田块今日已浇过水',
        });
      }
      plot.watered = true;
    } else if (action === 'weed') {
      if (plot.weeds <= 0) {
        throw new AppError('FARM_NO_WEEDS', {
          legacyMessage: '该田块没有杂草',
        });
      }
      plot.weeds = 0;
    } else if (action === 'debug') {
      if (plot.bugs <= 0) {
        throw new AppError('FARM_NO_BUGS', {
          legacyMessage: '该田块没有害虫',
        });
      }
      plot.bugs = 0;
    }

    plots[plotIndex] = plot;
    state.plotsPayload = plots;
    const saved = await this.playerRepo.save(state);

    await this.eventService.recordEvent({
      ownerId,
      kind: action,
      actorType: 'owner',
      actorId: FARM_PLAYER_ACTOR_ID,
      actorName: '我',
      cropId: plot.cropId ?? null,
      payload: { plotIndex },
    });
    if (action === 'water') {
      await this.questService.recordAction(ownerId, 'water');
    }

    return this.toPlayerView(saved);
  }
}

export function createEmptyPlot(index: number): FarmPlot {
  return {
    index,
    cropId: null,
    plantedAt: null,
    maturedAt: null,
    stage: 'empty',
    watered: false,
    weeds: 0,
    bugs: 0,
    stolenBy: [],
  };
}

export function createEmptyPlots(count: number): FarmPlot[] {
  return Array.from({ length: count }, (_, i) => createEmptyPlot(i));
}

export function ensurePlotsArray(
  payload: FarmPlot[] | null | undefined,
  expectedCount: number,
): FarmPlot[] {
  if (!Array.isArray(payload) || payload.length === 0) {
    return createEmptyPlots(expectedCount);
  }
  if (payload.length < expectedCount) {
    const extra = Array.from(
      { length: expectedCount - payload.length },
      (_, i) => createEmptyPlot(payload.length + i),
    );
    return [...payload, ...extra];
  }
  return payload;
}

export function refreshPlotStage(plot: FarmPlot, nowMs: number): FarmPlot {
  if (!plot.cropId || plot.plantedAt == null || plot.maturedAt == null) {
    return plot;
  }
  const def = FARM_CROP_CATALOG[plot.cropId];
  if (!def) return plot;
  const rottenAt = computeRottenAtMs(plot.cropId, plot.plantedAt);
  let stage = plot.stage;
  if (nowMs >= rottenAt) {
    stage = 'rotten';
  } else if (nowMs >= plot.maturedAt) {
    stage = 'ripe';
  } else {
    const fraction = (nowMs - plot.plantedAt) / (plot.maturedAt - plot.plantedAt);
    if (fraction < 0.25) stage = 'seed';
    else if (fraction < 0.5) stage = 'sprout';
    else stage = 'growing';
  }
  if (stage === plot.stage) return plot;
  return { ...plot, stage };
}

export function pruneStolenLog(
  log: FarmStolenLogEntry[],
): FarmStolenLogEntry[] {
  const cutoff = Date.now() - WEEKLY_STOLEN_LOG_KEEP_MS;
  const filtered = log.filter((entry) => entry.atMs >= cutoff);
  if (filtered.length === log.length) return log;
  return filtered;
}

function rollYield([lo, hi]: [number, number]): number {
  if (lo >= hi) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function clamp01Hundred(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}
// i18n-ignore-end
