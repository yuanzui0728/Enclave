import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharactersService } from '../../characters/characters.service';
import { CharacterEntity } from '../../characters/character.entity';
import { TenantRepository } from '../../tenancy/tenant-scoped.repository';
import { FarmEventService } from './farm-event.service';
import { FarmNpcStateEntity } from './entities/farm-npc-state.entity';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  ensurePlotsArray,
  refreshPlotStage,
} from './farm-state.service';
import {
  FARM_DEFAULT_NPC_COINS,
  FARM_DEFAULT_NPC_PLOT_COUNT,
  FARM_EXCLUDED_CHARACTER_IDS,
  FARM_FARMING_DOMAIN_NPC_PLOT_COUNT,
  FarmCharacterMood,
  FarmNeighborDetail,
  FarmNeighborSummary,
  FarmPlot,
} from './farm.types';

@Injectable()
export class FarmNpcService {
  constructor(
    @InjectRepository(FarmNpcStateEntity)
    private readonly npcRepo: Repository<FarmNpcStateEntity>,
    private readonly charactersService: CharactersService,
    private readonly eventService: FarmEventService,
  ) {}

  async listEligibleCharacters(ownerId: string): Promise<CharacterEntity[]> {
    const characters = await this.charactersService.findAllVisibleToOwner(ownerId);
    return characters.filter((c) => !FARM_EXCLUDED_CHARACTER_IDS.has(c.id));
  }

  async ensureNpcStateForCharacters(
    characters: CharacterEntity[],
    ownerId: string,
  ): Promise<FarmNpcStateEntity[]> {
    if (characters.length === 0) return [];
    const ids = characters.map((c) => c.id);
    const existing = await this.npcRepo
      .createQueryBuilder('npc')
      .where('npc.characterId IN (:...ids)', { ids })
      .andWhere('npc.ownerId = :ownerId', { ownerId })
      .getMany();
    const existingMap = new Map(existing.map((row) => [row.characterId, row]));
    const created: FarmNpcStateEntity[] = [];
    for (const character of characters) {
      if (existingMap.has(character.id)) continue;
      const isFarmer = (character.expertDomains ?? []).includes('farming');
      const entity = this.npcRepo.create({
        characterId: character.id,
        ownerId,
        coins: FARM_DEFAULT_NPC_COINS,
        level: 1,
        plotCount: isFarmer
          ? FARM_FARMING_DOMAIN_NPC_PLOT_COUNT
          : FARM_DEFAULT_NPC_PLOT_COUNT,
        plotsPayload: createEmptyNpcPlots(
          isFarmer
            ? FARM_FARMING_DOMAIN_NPC_PLOT_COUNT
            : FARM_DEFAULT_NPC_PLOT_COUNT,
        ),
        warehousePayload: {},
        moodPayload: deriveInitialMood(character),
        lastActedAt: null,
        lastTickAt: null,
      });
      created.push(entity);
    }
    if (created.length > 0) {
      await this.npcRepo.save(created);
    }
    return [...existing, ...created];
  }

  async getNpcStateForCharacter(
    characterId: string,
  ): Promise<FarmNpcStateEntity | null> {
    // 无 ownerId 入参：走 mode-aware scoped（请求/游戏帧内按 ALS owner 限定；LPP 透传）。
    return new TenantRepository(this.npcRepo).findOneBy({ characterId });
  }

  async getOrCreateNpcState(
    character: CharacterEntity,
    ownerId: string,
  ): Promise<FarmNpcStateEntity> {
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
  ): Promise<FarmNeighborSummary[]> {
    const eligible = await this.listEligibleCharacters(ownerId);
    const npcStates = await this.ensureNpcStateForCharacters(eligible, ownerId);
    const charById = new Map(eligible.map((c) => [c.id, c]));
    const now = Date.now();
    const summaries: FarmNeighborSummary[] = [];
    for (const npc of npcStates) {
      const character = charById.get(npc.characterId);
      if (!character) continue;
      summaries.push(buildNeighborSummary(character, npc, now));
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
  ): Promise<FarmNeighborDetail> {
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
    const npc = await this.getOrCreateNpcState(character, ownerId);
    const now = Date.now();
    const summary = buildNeighborSummary(character, npc, now);
    const plots = ensurePlotsArray(npc.plotsPayload, npc.plotCount).map((p) =>
      refreshPlotStage(p, now),
    );
    const recentEventRows = await this.eventService.listEventsForActor(
      ownerId,
      characterId,
      5,
    );
    return {
      ...summary,
      plots,
      recentEvents: recentEventRows.map((row) => this.eventService.toEventView(row)),
      serverNowMs: now,
    };
  }
}

function buildNeighborSummary(
  character: CharacterEntity,
  npc: FarmNpcStateEntity,
  nowMs: number,
): FarmNeighborSummary {
  const plots = ensurePlotsArray(npc.plotsPayload, npc.plotCount);
  const ripeCount = plots.reduce((acc, plot) => {
    if (
      plot.cropId &&
      plot.maturedAt != null &&
      nowMs >= plot.maturedAt
    ) {
      return acc + 1;
    }
    return acc;
  }, 0);
  return {
    characterId: character.id,
    characterName: character.name,
    characterAvatar: character.avatar ?? null,
    intimacyLevel: character.intimacyLevel ?? 0,
    isOnline: character.isOnline ?? false,
    ripePlotCount: ripeCount,
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
}

function deriveInitialMood(character: CharacterEntity): FarmCharacterMood {
  const tags = (character.profile as { personalityTags?: string[] } | null)?.personalityTags ?? [];
  const tagSet = new Set(tags.map((t) => String(t).toLowerCase()));
  let energy = 60;
  let diligence = 50;
  let pickpocketBias = 0.05;

  if (tagSet.has('energetic') || tagSet.has('lively')) energy += 20;
  if (tagSet.has('lazy') || tagSet.has('sleepy')) energy -= 20;
  if (tagSet.has('disciplined') || tagSet.has('meticulous')) diligence += 20;
  if (tagSet.has('careless') || tagSet.has('messy')) diligence -= 15;
  if (tagSet.has('mischievous') || tagSet.has('playful')) pickpocketBias += 0.1;
  if (tagSet.has('honest') || tagSet.has('trustworthy')) pickpocketBias -= 0.04;
  if ((character.expertDomains ?? []).includes('farming')) {
    diligence += 10;
    pickpocketBias += 0.05;
  }
  if ((character.expertDomains ?? []).includes('medicine')) {
    diligence += 5;
  }

  return {
    energy: clamp(energy, 0, 100),
    diligence: clamp(diligence, 0, 100),
    pickpocketBias: clamp(pickpocketBias, 0, 0.5),
  };
}

function createEmptyNpcPlots(count: number): FarmPlot[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    cropId: null,
    plantedAt: null,
    maturedAt: null,
    stage: 'empty' as const,
    watered: false,
    weeds: 0,
    bugs: 0,
    stolenBy: [],
  }));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
// i18n-ignore-end
