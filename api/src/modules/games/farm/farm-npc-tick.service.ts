import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { sleepForWorldJitter } from '../../../common/cron-jitter.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterEntity } from '../../characters/character.entity';
import { WorldOwnerService } from '../../auth/world-owner.service';
import { FarmEventService } from './farm-event.service';
import { FarmNpcService } from './farm-npc.service';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  ensurePlotsArray,
  pruneStolenLog,
  refreshPlotStage,
} from './farm-state.service';
import { FarmNpcStateEntity } from './entities/farm-npc-state.entity';
import { FarmPlayerStateEntity } from './entities/farm-player-state.entity';
import {
  FARM_CROP_CATALOG,
  FARM_CROP_IDS,
  computeMaturedAtMs,
  computeRottenAtMs,
  getCropDefinition,
} from './crop-catalog';
import {
  FARM_NPC_TICK_CRON,
  FARM_PLAYER_ACTOR_ID,
  FarmCropId,
  FarmPlot,
  FarmStolenLogEntry,
  FarmTickSummary,
} from './farm.types';

@Injectable()
export class FarmNpcTickService {
  private readonly logger = new Logger(FarmNpcTickService.name);
  private running = false;

  constructor(
    @InjectRepository(FarmNpcStateEntity)
    private readonly npcRepo: Repository<FarmNpcStateEntity>,
    @InjectRepository(FarmPlayerStateEntity)
    private readonly playerRepo: Repository<FarmPlayerStateEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly npcService: FarmNpcService,
    private readonly eventService: FarmEventService,
  ) {}

  @Cron(FARM_NPC_TICK_CRON)
  async runScheduledTick(): Promise<void> {
    await sleepForWorldJitter(60_000);
    if (this.running) {
      this.logger.warn('上一次 farm tick 仍在执行，跳过本轮');
      return;
    }
    this.running = true;
    try {
      const summary = await this.runTick();
      this.logger.log(
        `farm tick: 扫描 ${summary.scannedCharacterCount} 个角色，触发 ${summary.actedCount} 次动作（种植 ${summary.plantCount} / 收获 ${summary.harvestCount} / 偷菜 ${summary.stealCount} / 派发 ${summary.incidentBroadcastCount}），用时 ${summary.durationMs}ms`,
      );
    } catch (error) {
      this.logger.error(
        'farm tick 执行失败',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  async runTick(): Promise<FarmTickSummary> {
    const startedAt = Date.now();
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const characters = await this.npcService.listEligibleCharacters(owner.id);
    await this.npcService.ensureNpcStateForCharacters(characters, owner.id);

    let actedCount = 0;
    let plantCount = 0;
    let harvestCount = 0;
    let stealCount = 0;
    let incidentBroadcastCount = 0;

    const characterById = new Map(characters.map((c) => [c.id, c]));

    for (const character of characters) {
      const npc = await this.npcRepo.findOneBy({ characterId: character.id });
      if (!npc) continue;
      const onlineLikelihood = computeOnlineLikelihood(character);
      if (Math.random() > onlineLikelihood) continue;

      let mutated = false;

      const harvested = this.harvestRipePlots(npc, character.id);
      if (harvested > 0) {
        harvestCount += harvested;
        mutated = true;
        await this.eventService.recordEvent({
          ownerId: owner.id,
          kind: 'harvest',
          actorType: 'character',
          actorId: character.id,
          actorName: character.name,
          payload: { count: harvested },
        });
      }

      const planted = this.maybePlantNewCrop(npc, character);
      if (planted) {
        plantCount += 1;
        mutated = true;
        await this.eventService.recordEvent({
          ownerId: owner.id,
          kind: 'plant',
          actorType: 'character',
          actorId: character.id,
          actorName: character.name,
          cropId: planted,
          payload: { plotIndex: findFirstPlotForCrop(npc, planted) },
        });
      }

      const maintained = this.maybeMaintainPlots(npc);
      if (maintained > 0) {
        mutated = true;
      }

      const stealChance = computeStealChance(character);
      if (Math.random() < stealChance) {
        const result = await this.attemptStealForCharacter(
          owner.id,
          character,
          npc,
          characterById,
        );
        if (result.stolen) {
          stealCount += 1;
          mutated = true;
          if (result.broadcasted) incidentBroadcastCount += 1;
        }
      }

      if (mutated) {
        actedCount += 1;
        npc.lastActedAt = new Date();
      }
      npc.lastTickAt = new Date();
      await this.npcRepo.save(npc);
    }

    await this.eventService.pruneOldEvents(owner.id, 30);

    return {
      scannedCharacterCount: characters.length,
      actedCount,
      plantCount,
      harvestCount,
      stealCount,
      incidentBroadcastCount,
      durationMs: Date.now() - startedAt,
    };
  }

  private harvestRipePlots(
    npc: FarmNpcStateEntity,
    characterId: string,
  ): number {
    const now = Date.now();
    const plots = ensurePlotsArray(npc.plotsPayload, npc.plotCount).map((p) =>
      refreshPlotStage(p, now),
    );
    const warehouse = { ...(npc.warehousePayload ?? {}) };
    let harvested = 0;
    for (let i = 0; i < plots.length; i += 1) {
      const plot = plots[i]!;
      if (
        !plot.cropId ||
        plot.maturedAt == null ||
        now < plot.maturedAt
      ) {
        continue;
      }
      const def = getCropDefinition(plot.cropId);
      const isRotten = now >= computeRottenAtMs(plot.cropId, plot.plantedAt!);
      const baseAmount = plot.yieldOverride ?? rollYield(def.yieldRange);
      const stolenAmount = (plot.stolenBy ?? []).filter((id) => id !== characterId).length;
      const remainingAmount = Math.max(1, baseAmount - stolenAmount);
      const amount = isRotten ? Math.max(1, Math.floor(remainingAmount / 2)) : remainingAmount;
      const coinsGained = amount * def.sellPrice;
      warehouse[plot.cropId] = (warehouse[plot.cropId] ?? 0) + amount;
      npc.coins += coinsGained;
      plots[i] = createEmptyNpcPlot(i);
      harvested += 1;
    }
    npc.plotsPayload = plots;
    npc.warehousePayload = warehouse;
    return harvested;
  }

  private maybePlantNewCrop(
    npc: FarmNpcStateEntity,
    character: CharacterEntity,
  ): FarmCropId | null {
    const plots = ensurePlotsArray(npc.plotsPayload, npc.plotCount);
    const emptyIndex = plots.findIndex((p) => !p.cropId);
    if (emptyIndex === -1) return null;

    const candidate = pickCropForCharacter(npc, character);
    if (!candidate) return null;
    const def = getCropDefinition(candidate);
    if (npc.coins < def.seedCost) return null;
    npc.coins -= def.seedCost;

    const now = Date.now();
    const newPlots = plots.map((p) => ({ ...p }));
    newPlots[emptyIndex] = {
      index: emptyIndex,
      cropId: candidate,
      plantedAt: now,
      maturedAt: computeMaturedAtMs(candidate, now),
      stage: 'seed',
      watered: false,
      weeds: 0,
      bugs: 0,
      stolenBy: [],
      plantedBy: character.id,
    };
    npc.plotsPayload = newPlots;
    return candidate;
  }

  private async attemptStealForCharacter(
    ownerId: string,
    thief: CharacterEntity,
    thiefNpc: FarmNpcStateEntity,
    characterById: Map<string, CharacterEntity>,
  ): Promise<{ stolen: boolean; broadcasted: boolean }> {
    const targetKind = Math.random() < 0.7 ? 'owner' : 'npc';
    const noResult = { stolen: false, broadcasted: false };

    if (targetKind === 'owner') {
      return this.stealFromOwner(ownerId, thief, thiefNpc);
    }

    const otherNpcs = await this.npcRepo
      .createQueryBuilder('npc')
      .where('npc.characterId != :id', { id: thief.id })
      .getMany();
    if (otherNpcs.length === 0) return noResult;
    const candidates = otherNpcs.filter((row) => characterById.has(row.characterId));
    if (candidates.length === 0) return noResult;
    const targetNpc = candidates[Math.floor(Math.random() * candidates.length)]!;
    const targetCharacter = characterById.get(targetNpc.characterId);
    if (!targetCharacter) return noResult;
    return this.stealFromNpcTarget(ownerId, thief, thiefNpc, targetNpc, targetCharacter);
  }

  private async stealFromOwner(
    ownerId: string,
    thief: CharacterEntity,
    thiefNpc: FarmNpcStateEntity,
  ): Promise<{ stolen: boolean; broadcasted: boolean }> {
    const noResult = { stolen: false, broadcasted: false };
    const player = await this.playerRepo.findOneBy({ ownerId });
    if (!player) return noResult;
    const plots = ensurePlotsArray(player.plotsPayload, player.plotCount).map((p) => ({ ...p }));
    const ripe = findStealablePlot(plots, thief.id);
    if (!ripe) return noResult;
    const def = getCropDefinition(ripe.cropId!);
    const amount = Math.max(1, Math.floor((ripe.yieldOverride ?? def.yieldRange[0]) / 2));
    const coinsGained = amount * Math.max(1, Math.floor(def.sellPrice / 2));

    plots[ripe.index] = {
      ...ripe,
      stolenBy: [...(ripe.stolenBy ?? []), thief.id],
    };
    player.plotsPayload = plots;

    const log: FarmStolenLogEntry[] = pruneStolenLog(player.weeklyStolenLogPayload ?? []);
    log.push({
      thiefCharacterId: thief.id,
      thiefName: thief.name,
      cropId: ripe.cropId!,
      amount,
      atMs: Date.now(),
    });
    player.weeklyStolenLogPayload = log;
    await this.playerRepo.save(player);

    const thiefWarehouse = { ...(thiefNpc.warehousePayload ?? {}) };
    thiefWarehouse[ripe.cropId!] = (thiefWarehouse[ripe.cropId!] ?? 0) + amount;
    thiefNpc.warehousePayload = thiefWarehouse;
    thiefNpc.coins += coinsGained;

    await this.eventService.recordEvent({
      ownerId,
      kind: 'steal',
      actorType: 'character',
      actorId: thief.id,
      actorName: thief.name,
      targetType: 'owner',
      targetId: FARM_PLAYER_ACTOR_ID,
      targetName: '我',
      cropId: ripe.cropId,
      intimacyDelta: -3,
      payload: { plotIndex: ripe.index, amount, coinsGained },
    });
    await this.eventService.applyIntimacyChange(
      ownerId,
      thief.id,
      thief.id,
      -3,
      'character',
      thief.name,
    );
    const broadcasted = await this.eventService.maybeBroadcastIncident({
      ownerId,
      thief,
      target: { kind: 'owner', id: FARM_PLAYER_ACTOR_ID, name: '世界主人' },
      cropId: ripe.cropId!,
      amount,
    });
    return { stolen: true, broadcasted };
  }

  private async stealFromNpcTarget(
    ownerId: string,
    thief: CharacterEntity,
    thiefNpc: FarmNpcStateEntity,
    targetNpc: FarmNpcStateEntity,
    targetCharacter: CharacterEntity,
  ): Promise<{ stolen: boolean; broadcasted: boolean }> {
    const noResult = { stolen: false, broadcasted: false };
    const plots = ensurePlotsArray(targetNpc.plotsPayload, targetNpc.plotCount).map((p) => ({ ...p }));
    const ripe = findStealablePlot(plots, thief.id);
    if (!ripe) return noResult;
    const def = getCropDefinition(ripe.cropId!);
    const amount = Math.max(1, Math.floor((ripe.yieldOverride ?? def.yieldRange[0]) / 2));
    const coinsGained = amount * Math.max(1, Math.floor(def.sellPrice / 2));

    plots[ripe.index] = {
      ...ripe,
      stolenBy: [...(ripe.stolenBy ?? []), thief.id],
    };
    targetNpc.plotsPayload = plots;
    await this.npcRepo.save(targetNpc);

    const thiefWarehouse = { ...(thiefNpc.warehousePayload ?? {}) };
    thiefWarehouse[ripe.cropId!] = (thiefWarehouse[ripe.cropId!] ?? 0) + amount;
    thiefNpc.warehousePayload = thiefWarehouse;
    thiefNpc.coins += coinsGained;

    await this.eventService.recordEvent({
      ownerId,
      kind: 'steal',
      actorType: 'character',
      actorId: thief.id,
      actorName: thief.name,
      targetType: 'character',
      targetId: targetCharacter.id,
      targetName: targetCharacter.name,
      cropId: ripe.cropId,
      payload: { plotIndex: ripe.index, amount, coinsGained },
    });
    const broadcasted = await this.eventService.maybeBroadcastIncident({
      ownerId,
      thief,
      target: {
        kind: 'character',
        id: targetCharacter.id,
        name: targetCharacter.name,
      },
      cropId: ripe.cropId!,
      amount,
    });
    return { stolen: true, broadcasted };
  }

  private maybeMaintainPlots(npc: FarmNpcStateEntity): number {
    const diligence = (npc.moodPayload?.diligence ?? 50) / 100;
    const plots = ensurePlotsArray(npc.plotsPayload, npc.plotCount).map((p) => ({ ...p }));
    let mutated = 0;
    for (let i = 0; i < plots.length; i += 1) {
      const plot = plots[i]!;
      if (!plot.cropId) continue;
      if (plot.weeds > 0 && Math.random() < diligence) {
        plot.weeds = 0;
        mutated += 1;
      }
      if (plot.bugs > 0 && Math.random() < diligence) {
        plot.bugs = 0;
        mutated += 1;
      }
      if (!plot.watered && Math.random() < diligence * 0.4) {
        plot.watered = true;
        mutated += 1;
      }
      // 偶发自然增加杂草/虫
      if (Math.random() < 0.05) plot.weeds = Math.min(3, plot.weeds + 1);
      if (Math.random() < 0.03) plot.bugs = Math.min(3, plot.bugs + 1);
    }
    npc.plotsPayload = plots;
    return mutated;
  }
}

function findStealablePlot(plots: FarmPlot[], thiefCharacterId: string): FarmPlot | null {
  const now = Date.now();
  const ripe = plots.filter(
    (p) =>
      p.cropId &&
      p.maturedAt != null &&
      now >= p.maturedAt &&
      now < p.maturedAt + 24 * 3600 * 1000 &&
      !(p.stolenBy ?? []).includes(thiefCharacterId),
  );
  if (ripe.length === 0) return null;
  return ripe[Math.floor(Math.random() * ripe.length)]!;
}

export function computeStealChance(character: CharacterEntity): number {
  const tags = (
    (character.profile as { personalityTags?: string[] } | null)?.personalityTags ?? []
  ).map((t) => String(t).toLowerCase());
  const tagSet = new Set(tags);
  let base = 0.05;
  if (tagSet.has('playful') || tagSet.has('mischievous')) base += 0.1;
  if ((character.expertDomains ?? []).includes('farming')) base += 0.05;
  if ((character.intimacyLevel ?? 0) >= 80) base -= 0.1;
  return Math.max(0.02, Math.min(0.3, base));
}

export function computeOnlineLikelihood(character: CharacterEntity): number {
  const freq = character.feedFrequency ?? 1;
  let base = 0.1;
  if (freq >= 5) base = 0.6;
  else if (freq >= 2) base = 0.3;

  if (!character.isOnline) base *= 0.4;

  const hour = new Date().getHours();
  if (hour >= 1 && hour < 6) base *= 0.2;

  return Math.max(0.02, Math.min(0.9, base));
}

function pickCropForCharacter(
  npc: FarmNpcStateEntity,
  character: CharacterEntity,
): FarmCropId | null {
  const expert = new Set((character.expertDomains ?? []).map((d) => String(d).toLowerCase()));
  const affordable = FARM_CROP_IDS.filter((id) => {
    const def = FARM_CROP_CATALOG[id];
    return def.unlockLevel <= npc.level && npc.coins >= def.seedCost;
  });
  if (affordable.length === 0) return null;
  const preferred = affordable.filter((id) =>
    FARM_CROP_CATALOG[id].preferredDomains.some((d) => expert.has(d)),
  );
  const pool = preferred.length > 0 ? preferred : affordable;
  pool.sort(
    (a, b) => FARM_CROP_CATALOG[b].sellPrice - FARM_CROP_CATALOG[a].sellPrice,
  );
  const topN = pool.slice(0, Math.max(1, Math.min(3, pool.length)));
  return topN[Math.floor(Math.random() * topN.length)]!;
}

function findFirstPlotForCrop(
  npc: FarmNpcStateEntity,
  cropId: FarmCropId,
): number {
  const plots = ensurePlotsArray(npc.plotsPayload, npc.plotCount);
  return plots.findIndex((p) => p.cropId === cropId);
}

function createEmptyNpcPlot(index: number): FarmPlot {
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

function rollYield([lo, hi]: [number, number]): number {
  if (lo >= hi) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
// i18n-ignore-end
