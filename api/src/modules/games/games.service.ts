import { Injectable } from '@nestjs/common';
import {
  GAME_CENTER_HOME_SEED,
  cloneGameCenterHomeResponse,
} from './game-center.data';

@Injectable()
export class GamesService {
  getGameCenterHome() {
    return cloneGameCenterHomeResponse();
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
}
