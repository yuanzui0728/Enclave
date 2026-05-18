// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppError } from '../../../common/app-error.exception';
import { ParkingWarEventService } from './parking-war-event.service';
import { ParkingWarLeaderboardService } from './parking-war-leaderboard.service';
import { ParkingWarNeighborService } from './parking-war-neighbor.service';
import { ParkingWarStateService } from './parking-war-state.service';
import type {
  ParkingWarCarTier,
  ParkingWarCollectResult,
  ParkingWarDailyBonusResult,
  ParkingWarEventView,
  ParkingWarLeaderboardRow,
  ParkingWarLotSurface,
  ParkingWarNeighborDetail,
  ParkingWarNeighborSummary,
  ParkingWarPlayerStateView,
  ParkingWarRarity,
  ParkingWarRecallResult,
  ParkingWarTicketResult,
  ParkingWarTowResult,
} from './parking-war.types';

const CAR_TIERS = new Set<ParkingWarCarTier>([
  'starter',
  'family',
  'business',
  'performance',
  'luxury',
  'super',
]);
const RARITIES = new Set<ParkingWarRarity>([
  'common',
  'rare',
  'epic',
  'legend',
]);
const SURFACES = new Set<ParkingWarLotSurface>([
  'concrete',
  'grass',
  'asphalt',
  'vip',
]);

interface ParkBody {
  carId: string;
  slotIndex: number;
  // characterId 在 Stage 3 启用，传值表示停到 NPC/角色车场；Stage 2 仅支持停自己家
  characterId?: string;
}

@Controller('games/parking-war')
export class ParkingWarController {
  constructor(
    private readonly stateService: ParkingWarStateService,
    private readonly eventService: ParkingWarEventService,
    private readonly neighborService: ParkingWarNeighborService,
    private readonly leaderboardService: ParkingWarLeaderboardService,
  ) {}

  @Get('leaderboard')
  async leaderboard(
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
  ): Promise<ParkingWarLeaderboardRow[]> {
    const ownerId = await this.stateService.resolveOwnerId();
    const scopeN: 'global' | 'friends' =
      scope === 'global' ? 'global' : 'friends';
    const limitN = limit ? Math.max(1, Math.min(200, Number(limit))) : 50;
    return this.leaderboardService.getRichBoard(ownerId, scopeN, limitN);
  }

  @Post('daily-bonus')
  async dailyBonus(): Promise<ParkingWarDailyBonusResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.stateService.claimDailyBonus(ownerId);
  }

  @Post('daily-task/claim')
  async claimDailyTask(
    @Body() body: { taskId: string },
  ): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const taskId = parseNonEmptyString(body.taskId, 'taskId');
    return this.stateService.claimDailyTask(ownerId, taskId);
  }

  @Get('neighbors')
  async listNeighbors(
    @Query('limit') limit?: string,
  ): Promise<ParkingWarNeighborSummary[]> {
    const ownerId = await this.stateService.resolveOwnerId();
    const limitN = limit
      ? Math.max(1, Math.min(200, Number(limit)))
      : undefined;
    return this.neighborService.listNeighbors(ownerId, { limit: limitN });
  }

  @Get('neighbors/:characterId')
  async getNeighbor(
    @Param('characterId') characterId: string,
  ): Promise<ParkingWarNeighborDetail> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.neighborService.getNeighborDetail(
      ownerId,
      parseNonEmptyString(characterId, 'characterId'),
    );
  }

  @Get('state')
  async getState(): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.stateService.getPlayerStateView(ownerId);
  }

  @Get('events')
  async listEvents(
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ): Promise<ParkingWarEventView[]> {
    const ownerId = await this.stateService.resolveOwnerId();
    const sinceDate = since ? new Date(since) : undefined;
    const limitN = limit ? Math.max(1, Math.min(200, Number(limit))) : 50;
    const rows = await this.eventService.listEvents(ownerId, {
      since:
        sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : undefined,
      limit: limitN,
    });
    return rows.map((row) => this.eventService.toEventView(row));
  }

  @Post('park')
  async park(@Body() body: ParkBody): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const carId = parseNonEmptyString(body.carId, 'carId');
    const slotIndex = parseSlotIndex(body.slotIndex);
    if (body.characterId) {
      const characterId = parseNonEmptyString(body.characterId, 'characterId');
      return this.stateService.parkOwnedCarAtNeighbor(
        ownerId,
        carId,
        characterId,
        slotIndex,
      );
    }
    return this.stateService.parkOwnedCarAtHome(ownerId, carId, slotIndex);
  }

  @Post('recall')
  async recall(
    @Body() body: { occupancyId: string },
  ): Promise<ParkingWarRecallResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const occupancyId = parseNonEmptyString(body.occupancyId, 'occupancyId');
    return this.stateService.recallOccupancy(ownerId, occupancyId);
  }

  @Post('ticket')
  async ticket(
    @Body() body: { occupancyId: string },
  ): Promise<ParkingWarTicketResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const occupancyId = parseNonEmptyString(body.occupancyId, 'occupancyId');
    return this.stateService.ticketOccupancy(ownerId, occupancyId);
  }

  @Post('tow')
  async tow(
    @Body() body: { occupancyId: string },
  ): Promise<ParkingWarTowResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const occupancyId = parseNonEmptyString(body.occupancyId, 'occupancyId');
    return this.stateService.towOccupancy(ownerId, occupancyId);
  }

  @Post('collect')
  async collect(
    @Body() body: { slotIndex?: number },
  ): Promise<ParkingWarCollectResult> {
    const ownerId = await this.stateService.resolveOwnerId();
    const slotIndex =
      body.slotIndex != null ? parseSlotIndex(body.slotIndex) : undefined;
    return this.stateService.collectFromSlot(ownerId, slotIndex);
  }

  @Post('buy-car')
  async buyCar(
    @Body() body: { tier: ParkingWarCarTier; rarity: ParkingWarRarity },
  ): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const tier = parseCarTier(body.tier);
    const rarity = parseRarity(body.rarity);
    return this.stateService.buyCar(ownerId, tier, rarity);
  }

  @Post('upgrade-car')
  async upgradeCar(
    @Body() body: { carId: string },
  ): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const carId = parseNonEmptyString(body.carId, 'carId');
    return this.stateService.upgradeCar(ownerId, carId);
  }

  @Post('paint-car')
  async paintCar(
    @Body() body: { carId: string; paintIndex: number },
  ): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const carId = parseNonEmptyString(body.carId, 'carId');
    if (!Number.isInteger(body.paintIndex)) {
      throw new AppError('PARKING_WAR_INVALID_PAINT_INDEX', {
        legacyMessage: 'paintIndex 必须为整数',
      });
    }
    return this.stateService.paintCar(ownerId, carId, body.paintIndex);
  }

  @Post('repair-car')
  async repairCar(
    @Body() body: { carId: string },
  ): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    const carId = parseNonEmptyString(body.carId, 'carId');
    return this.stateService.repairCar(ownerId, carId);
  }

  @Post('upgrade-lot')
  async upgradeLot(
    @Body()
    body: {
      target: 'size' | 'surface';
      value: number | ParkingWarLotSurface;
    },
  ): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    if (body.target === 'size') {
      const size = Number(body.value);
      if (!Number.isInteger(size)) {
        throw new AppError('PARKING_WAR_INVALID_LOT_SIZE', {
          legacyMessage: '车场容量必须为整数',
        });
      }
      return this.stateService.upgradeLotSize(ownerId, size);
    }
    if (body.target === 'surface') {
      if (
        typeof body.value !== 'string' ||
        !SURFACES.has(body.value as ParkingWarLotSurface)
      ) {
        throw new AppError('PARKING_WAR_INVALID_SURFACE', {
          legacyMessage: '地砖类型不识别',
        });
      }
      return this.stateService.upgradeLotSurface(
        ownerId,
        body.value as ParkingWarLotSurface,
      );
    }
    throw new AppError('PARKING_WAR_INVALID_UPGRADE_TARGET', {
      legacyMessage: 'upgrade-lot 仅支持 target=size | surface',
    });
  }

  @Post('upgrade-garage')
  async upgradeGarage(): Promise<ParkingWarPlayerStateView> {
    const ownerId = await this.stateService.resolveOwnerId();
    return this.stateService.upgradeGarage(ownerId);
  }
}

function parseSlotIndex(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new AppError('PARKING_WAR_INVALID_SLOT_INDEX', {
      legacyMessage: 'slotIndex 必须为非负整数',
    });
  }
  return n;
}

function parseNonEmptyString(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new AppError('PARKING_WAR_FIELD_REQUIRED', {
      params: { field },
      legacyMessage: `${field} 必填`,
    });
  }
  return raw.trim();
}

function parseCarTier(raw: unknown): ParkingWarCarTier {
  if (typeof raw !== 'string' || !CAR_TIERS.has(raw as ParkingWarCarTier)) {
    throw new AppError('PARKING_WAR_UNKNOWN_TIER', {
      params: { tier: String(raw) },
      legacyMessage: `未知车辆档位：${String(raw)}`,
    });
  }
  return raw as ParkingWarCarTier;
}

function parseRarity(raw: unknown): ParkingWarRarity {
  if (typeof raw !== 'string' || !RARITIES.has(raw as ParkingWarRarity)) {
    throw new AppError('PARKING_WAR_UNKNOWN_RARITY', {
      params: { rarity: String(raw) },
      legacyMessage: `未知稀有度：${String(raw)}`,
    });
  }
  return raw as ParkingWarRarity;
}
// i18n-ignore-end
