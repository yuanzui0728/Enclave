import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import {
  createDefaultGameCenterOwnerState,
  GAME_CENTER_HOME_SEED,
  cloneGameCenterHomeSeed,
} from './game-center.data';
import { GameOwnerStateEntity } from './game-owner-state.entity';

const MAX_RECENT_GAMES = 6;
const MAX_PINNED_GAMES = 8;
const GAME_IDS = new Set(GAME_CENTER_HOME_SEED.games.map((game) => game.id));

type SerializedGameCenterOwnerState = ReturnType<
  typeof createDefaultGameCenterOwnerState
>;

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(GameOwnerStateEntity)
    private readonly ownerStateRepo: Repository<GameOwnerStateEntity>,
    private readonly worldOwnerService: WorldOwnerService,
  ) {}

  async getGameCenterHome() {
    return {
      ...cloneGameCenterHomeSeed(),
      ownerState: await this.getOwnerState(),
      generatedAt: new Date().toISOString(),
    };
  }

  async getOwnerState() {
    const entity = await this.ensureOwnerState();
    return this.serializeOwnerState(entity);
  }

  async launchGame(gameId: string) {
    this.assertKnownGame(gameId);
    const entity = await this.ensureOwnerState();
    const current = this.serializeOwnerState(entity);
    const openedAt = new Date().toISOString();

    return this.persistOwnerState(entity, {
      ...current,
      activeGameId: gameId,
      recentGameIds: [gameId, ...current.recentGameIds.filter((id) => id !== gameId)].slice(
        0,
        MAX_RECENT_GAMES,
      ),
      launchCountById: {
        ...current.launchCountById,
        [gameId]: (current.launchCountById[gameId] ?? 0) + 1,
      },
      lastOpenedAtById: {
        ...current.lastOpenedAtById,
        [gameId]: openedAt,
      },
      updatedAt: openedAt,
    });
  }

  async setPinnedState(gameId: string, pinned: boolean) {
    this.assertKnownGame(gameId);
    const entity = await this.ensureOwnerState();
    const current = this.serializeOwnerState(entity);

    const pinnedGameIds = pinned
      ? [gameId, ...current.pinnedGameIds.filter((id) => id !== gameId)].slice(
          0,
          MAX_PINNED_GAMES,
        )
      : current.pinnedGameIds.filter((id) => id !== gameId);

    return this.persistOwnerState(entity, {
      ...current,
      pinnedGameIds,
      updatedAt: new Date().toISOString(),
    });
  }

  async dismissActiveGame() {
    const entity = await this.ensureOwnerState();
    const current = this.serializeOwnerState(entity);

    return this.persistOwnerState(entity, {
      ...current,
      activeGameId: null,
      updatedAt: new Date().toISOString(),
    });
  }

  getAdminCatalog() {
    return GAME_CENTER_HOME_SEED.games.map((game) => ({
      id: game.id,
      name: game.name,
      category: game.category,
      badge: game.badge,
      publisherKind: game.publisherKind,
      productionKind: game.productionKind,
      runtimeMode: game.runtimeMode,
      reviewStatus: game.reviewStatus,
      visibilityScope: game.visibilityScope,
      studio: game.studio,
      sourceCharacterId: game.sourceCharacterId ?? null,
      sourceCharacterName: game.sourceCharacterName ?? null,
      aiHighlights: [...game.aiHighlights],
      tags: [...game.tags],
      updateNote: game.updateNote,
      playersLabel: game.playersLabel,
      friendsLabel: game.friendsLabel,
    }));
  }

  private assertKnownGame(gameId: string) {
    if (!GAME_IDS.has(gameId)) {
      throw new NotFoundException('游戏不存在');
    }
  }

  private async ensureOwnerState() {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const existing = await this.ownerStateRepo.findOne({
      where: { ownerId: owner.id },
    });

    if (existing) {
      return existing;
    }

    const defaultState = createDefaultGameCenterOwnerState();
    const created = this.ownerStateRepo.create({
      ownerId: owner.id,
      activeGameId: defaultState.activeGameId ?? null,
      recentGameIdsPayload: defaultState.recentGameIds,
      pinnedGameIdsPayload: defaultState.pinnedGameIds,
      launchCountByIdPayload: defaultState.launchCountById,
      lastOpenedAtByIdPayload: defaultState.lastOpenedAtById,
    });

    return this.ownerStateRepo.save(created);
  }

  private sanitizeGameIds(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) {
      return [...fallback];
    }

    return value.filter((item): item is string => typeof item === 'string' && GAME_IDS.has(item));
  }

  private sanitizeLaunchCounts(
    value: unknown,
    fallback: Record<string, number>,
  ) {
    if (!value || typeof value !== 'object') {
      return { ...fallback };
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[0] === 'string' &&
          GAME_IDS.has(entry[0]) &&
          typeof entry[1] === 'number' &&
          Number.isFinite(entry[1]),
      ),
    );
  }

  private sanitizeTimestamps(
    value: unknown,
    fallback: Record<string, string>,
  ) {
    if (!value || typeof value !== 'object') {
      return { ...fallback };
    }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' &&
          GAME_IDS.has(entry[0]) &&
          typeof entry[1] === 'string',
      ),
    );
  }

  private serializeOwnerState(
    entity: GameOwnerStateEntity,
  ): SerializedGameCenterOwnerState {
    const fallback = createDefaultGameCenterOwnerState();

    return {
      activeGameId:
        entity.activeGameId && GAME_IDS.has(entity.activeGameId)
          ? entity.activeGameId
          : null,
      recentGameIds: this.sanitizeGameIds(
        entity.recentGameIdsPayload,
        fallback.recentGameIds,
      ).slice(0, MAX_RECENT_GAMES),
      pinnedGameIds: this.sanitizeGameIds(
        entity.pinnedGameIdsPayload,
        fallback.pinnedGameIds,
      ).slice(0, MAX_PINNED_GAMES),
      launchCountById: this.sanitizeLaunchCounts(
        entity.launchCountByIdPayload,
        fallback.launchCountById,
      ),
      lastOpenedAtById: this.sanitizeTimestamps(
        entity.lastOpenedAtByIdPayload,
        fallback.lastOpenedAtById,
      ),
      updatedAt: entity.updatedAt?.toISOString() ?? fallback.updatedAt,
    };
  }

  private async persistOwnerState(
    entity: GameOwnerStateEntity,
    state: SerializedGameCenterOwnerState,
  ) {
    entity.activeGameId =
      state.activeGameId && GAME_IDS.has(state.activeGameId)
        ? state.activeGameId
        : null;
    entity.recentGameIdsPayload = state.recentGameIds.slice(0, MAX_RECENT_GAMES);
    entity.pinnedGameIdsPayload = state.pinnedGameIds.slice(0, MAX_PINNED_GAMES);
    entity.launchCountByIdPayload = state.launchCountById;
    entity.lastOpenedAtByIdPayload = state.lastOpenedAtById;

    const saved = await this.ownerStateRepo.save(entity);
    return this.serializeOwnerState(saved);
  }
}
