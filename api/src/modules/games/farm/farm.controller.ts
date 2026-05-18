import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { FarmCheckinService } from './farm-checkin.service';
import { FarmEventService } from './farm-event.service';
import { FarmLeaderboardService } from './farm-leaderboard.service';
import { FarmNpcService } from './farm-npc.service';
import { FarmQuestService } from './farm-quest.service';
import { FarmStateService } from './farm-state.service';
import {
  isFarmConsumableId,
  isFarmCropId,
  isFarmDecorationId,
} from './crop-catalog';
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  FarmCheckinResult,
  FarmCheckinView,
  FarmConsumableId,
  FarmConsumablePurchaseResult,
  FarmCropId,
  FarmDecorationId,
  FarmDecorationPlaceResult,
  FarmDecorationPurchaseResult,
  FarmDogPurchaseResult,
  FarmEventView,
  FarmGiftCoinsResult,
  FarmGiftItemResult,
  FarmHarvestResult,
  FarmLeaderboardType,
  FarmLeaderboardView,
  FarmNeighborDetail,
  FarmNeighborSummary,
  FarmPlayerStateView,
  FarmQuestClaimResult,
  FarmQuestsView,
  FarmStealResult,
} from './farm.types';

interface PlantBody {
  plotIndex: number;
  cropId: FarmCropId;
}

interface PlotActionBody {
  plotIndex: number;
  characterId?: string;
}

interface SeedTransactionBody {
  cropId: FarmCropId;
  quantity: number;
}

interface ConsumableTransactionBody {
  consumableId: FarmConsumableId;
  quantity: number;
}

interface DecorationTransactionBody {
  decorationId: FarmDecorationId;
  quantity: number;
}

interface DecorationPlaceBody {
  decorationId: FarmDecorationId;
  x: number;
  y: number;
}

@Controller('games/farm')
export class FarmController {
  constructor(
    private readonly stateService: FarmStateService,
    private readonly eventService: FarmEventService,
    private readonly npcService: FarmNpcService,
    private readonly leaderboardService: FarmLeaderboardService,
    private readonly checkinService: FarmCheckinService,
    private readonly questService: FarmQuestService,
  ) {}

  @Get('state')
  async getState(): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.stateService.getPlayerStateView(ownerId);
  }

  @Get('neighbors')
  async listNeighbors(
    @Query('limit') limit?: string,
  ): Promise<FarmNeighborSummary[]> {
    const ownerId = await this.stateService.resolveOwnerId();
    const limitN = limit ? Math.max(1, Math.min(200, Number(limit))) : undefined;
    return this.npcService.listNeighbors(ownerId, { limit: limitN });
  }

  @Get('neighbors/:characterId')
  async getNeighbor(
    @Param('characterId') characterId: string,
  ): Promise<FarmNeighborDetail> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.npcService.getNeighborDetail(ownerId, characterId);
  }

  @Post('plant')
  async plant(@Body() body: PlantBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    const cropId = parseCropId(body.cropId);
    return this.stateService.plant(ownerId, plotIndex, cropId);
  }

  @Post('water')
  async water(@Body() body: PlotActionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.waterPlot(ownerId, {
      kind: body.characterId ? 'npc' : 'self',
      plotIndex,
      characterId: body.characterId,
    });
  }

  @Post('weed')
  async weed(@Body() body: PlotActionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.weedPlot(ownerId, {
      kind: body.characterId ? 'npc' : 'self',
      plotIndex,
      characterId: body.characterId,
    });
  }

  @Post('debug')
  async debugBugs(@Body() body: PlotActionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.debugPlot(ownerId, {
      kind: body.characterId ? 'npc' : 'self',
      plotIndex,
      characterId: body.characterId,
    });
  }

  @Post('harvest')
  async harvest(@Body() body: { plotIndex: number }): Promise<FarmHarvestResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.harvest(ownerId, plotIndex);
  }

  @Post('steal')
  async steal(
    @Body() body: { characterId: string; plotIndex: number },
  ): Promise<FarmStealResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    if (typeof body.characterId !== 'string' || body.characterId.length === 0) {
      throw new AppError('FARM_CHARACTER_REQUIRED', {
        legacyMessage: 'characterId 必填',
      });
    }
    return this.stateService.stealFromNpc(ownerId, body.characterId, plotIndex);
  }

  @Post('buy-seed')
  async buySeed(@Body() body: SeedTransactionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const cropId = parseCropId(body.cropId);
    return this.stateService.buySeed(ownerId, cropId, Math.floor(body.quantity));
  }

  @Post('sell-crop')
  async sellCrop(@Body() body: SeedTransactionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const cropId = parseCropId(body.cropId);
    return this.stateService.sellCrop(ownerId, cropId, Math.floor(body.quantity));
  }

  @Post('buy-consumable')
  async buyConsumable(
    @Body() body: ConsumableTransactionBody,
  ): Promise<FarmConsumablePurchaseResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const consumableId = parseConsumableId(body.consumableId);
    return this.stateService.buyConsumable(
      ownerId,
      consumableId,
      Math.floor(body.quantity),
    );
  }

  @Post('apply-fertilizer')
  async applyFertilizer(@Body() body: PlotActionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.applyFertilizer(ownerId, plotIndex);
  }

  @Post('apply-pesticide')
  async applyPesticide(@Body() body: PlotActionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.applyPesticide(ownerId, plotIndex);
  }

  @Post('buy-dog')
  async buyDog(): Promise<FarmDogPurchaseResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.stateService.buyOrUpgradeDog(ownerId);
  }

  @Post('feed-dog')
  async feedDog(): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.stateService.feedDog(ownerId);
  }

  @Post('uproot')
  async uproot(@Body() body: PlotActionBody): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const plotIndex = parsePlotIndex(body.plotIndex);
    return this.stateService.uprootPlot(ownerId, plotIndex);
  }

  @Post('buy-decoration')
  async buyDecoration(
    @Body() body: DecorationTransactionBody,
  ): Promise<FarmDecorationPurchaseResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const decorationId = parseDecorationId(body.decorationId);
    return this.stateService.buyDecoration(
      ownerId,
      decorationId,
      Math.floor(body.quantity),
    );
  }

  @Post('place-decoration')
  async placeDecoration(
    @Body() body: DecorationPlaceBody,
  ): Promise<FarmDecorationPlaceResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const decorationId = parseDecorationId(body.decorationId);
    const x = Number(body.x);
    const y = Number(body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new AppError('FARM_DECORATION_INVALID_COORD', {
        legacyMessage: 'x/y 必须为数字',
      });
    }
    return this.stateService.placeDecoration(ownerId, decorationId, x, y);
  }

  @Post('remove-decoration')
  async removeDecoration(
    @Body() body: { placementId: string },
  ): Promise<FarmPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const placementId = String(body.placementId ?? '');
    if (placementId.length === 0) {
      throw new AppError('FARM_DECORATION_INVALID_ID', {
        legacyMessage: 'placementId 必填',
      });
    }
    return this.stateService.removeDecoration(ownerId, placementId);
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ): Promise<FarmLeaderboardView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const t = (type ?? 'level').toLowerCase();
    if (t !== 'level' && t !== 'harvest' && t !== 'coins') {
      throw new AppError('FARM_LEADERBOARD_UNKNOWN_TYPE', {
        params: { type: t },
        legacyMessage: `未知排行类型：${t}`,
      });
    }
    const limitN = limit ? Math.max(1, Math.min(100, Number(limit))) : 30;
    return this.leaderboardService.getLeaderboard(
      ownerId,
      t as FarmLeaderboardType,
      limitN,
    );
  }

  @Post('gift-coins')
  async giftCoins(
    @Body() body: { characterId: string; amount: number },
  ): Promise<FarmGiftCoinsResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const characterId = String(body.characterId ?? '');
    if (characterId.length === 0) {
      throw new AppError('FARM_CHARACTER_REQUIRED', {
        legacyMessage: 'characterId 必填',
      });
    }
    return this.stateService.giftCoinsToNeighbor(
      ownerId,
      characterId,
      Math.floor(Number(body.amount)),
    );
  }

  @Get('checkin')
  async getCheckin(): Promise<FarmCheckinView> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.checkinService.getView(ownerId);
  }

  @Post('checkin')
  async doCheckin(): Promise<FarmCheckinResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.checkinService.checkin(ownerId);
  }

  @Get('quests')
  async getQuests(): Promise<FarmQuestsView> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.questService.getView(ownerId);
  }

  @Post('quests/claim')
  async claimQuest(
    @Body() body: { questId: string },
  ): Promise<FarmQuestClaimResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.questService.claim(ownerId, String(body.questId ?? ''));
  }

  @Post('gift-item')
  async giftItem(
    @Body()
    body: {
      characterId: string;
      itemKind: 'crop' | 'seed' | 'consumable';
      itemId: string;
      quantity: number;
    },
  ): Promise<FarmGiftItemResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const characterId = String(body.characterId ?? '');
    if (characterId.length === 0) {
      throw new AppError('FARM_CHARACTER_REQUIRED', {
        legacyMessage: 'characterId 必填',
      });
    }
    if (
      body.itemKind !== 'crop' &&
      body.itemKind !== 'seed' &&
      body.itemKind !== 'consumable'
    ) {
      throw new AppError('FARM_GIFT_KIND_INVALID', {
        legacyMessage: 'itemKind 必须为 crop / seed / consumable',
      });
    }
    return this.stateService.giftItemToNeighbor(
      ownerId,
      characterId,
      body.itemKind,
      String(body.itemId ?? ''),
      Math.floor(Number(body.quantity)),
    );
  }

  @Get('events')
  async listEvents(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ): Promise<FarmEventView[]> {
    const ownerId = await this.stateService.resolveOwnerId();
    const sinceDate = since ? new Date(since) : undefined;
    const limitN = limit ? Math.max(1, Math.min(200, Number(limit))) : 50;
    const rows = await this.eventService.listEvents(ownerId, {
      since: sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : undefined,
      limit: limitN,
    });
    return rows.map((row) => this.eventService.toEventView(row));
  }
}

function parsePlotIndex(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new AppError('FARM_INVALID_PLOT_INDEX', {
      legacyMessage: 'plotIndex 必须为非负整数',
    });
  }
  return n;
}

function parseCropId(raw: unknown): FarmCropId {
  if (typeof raw !== 'string' || !isFarmCropId(raw)) {
    throw new AppError('FARM_UNKNOWN_CROP', {
      params: { cropId: String(raw) },
      legacyMessage: `未知作物：${String(raw)}`,
    });
  }
  return raw;
}

function parseConsumableId(raw: unknown): FarmConsumableId {
  if (typeof raw !== 'string' || !isFarmConsumableId(raw)) {
    throw new AppError('FARM_UNKNOWN_CONSUMABLE', {
      params: { consumableId: String(raw) },
      legacyMessage: `未知道具：${String(raw)}`,
    });
  }
  return raw;
}

function parseDecorationId(raw: unknown): FarmDecorationId {
  if (typeof raw !== 'string' || !isFarmDecorationId(raw)) {
    throw new AppError('FARM_UNKNOWN_DECORATION', {
      params: { decorationId: String(raw) },
      legacyMessage: `未知装饰：${String(raw)}`,
    });
  }
  return raw;
}
// i18n-ignore-end
