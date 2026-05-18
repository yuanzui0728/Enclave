import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/app-error.exception';
import { FarmCheckinEntity } from './entities/farm-checkin.entity';
import { FarmPlayerStateEntity } from './entities/farm-player-state.entity';
import { todayLocalDate, yesterdayLocalDate } from './quest-catalog';
import {
  FARM_CHECKIN_REWARDS,
  FarmCheckinDayReward,
  FarmCheckinResult,
  FarmCheckinView,
} from './farm.types';
import { FarmStateService } from './farm-state.service';

@Injectable()
export class FarmCheckinService {
  constructor(
    @InjectRepository(FarmCheckinEntity)
    private readonly checkinRepo: Repository<FarmCheckinEntity>,
    @InjectRepository(FarmPlayerStateEntity)
    private readonly playerRepo: Repository<FarmPlayerStateEntity>,
    private readonly stateService: FarmStateService,
  ) {}

  async getView(ownerId: string): Promise<FarmCheckinView> {
    const state = await this.ensureCheckin(ownerId);
    const today = todayLocalDate();
    const canCheckinToday = state.lastCheckinDate !== today;
    const nextStreak = computeNextStreak(state.streak, state.lastCheckinDate, today);
    const todayReward = pickReward(nextStreak);
    return this.viewFrom(state, canCheckinToday, todayReward);
  }

  async checkin(ownerId: string): Promise<FarmCheckinResult> {
    const checkin = await this.ensureCheckin(ownerId);
    const today = todayLocalDate();
    if (checkin.lastCheckinDate === today) {
      throw new AppError('FARM_ALREADY_CHECKED_IN', {
        status: HttpStatus.CONFLICT,
        legacyMessage: '今天已经签过到啦',
      });
    }
    const nextStreak = computeNextStreak(
      checkin.streak,
      checkin.lastCheckinDate,
      today,
    );
    const reward = pickReward(nextStreak);

    // 应用奖励到 player
    const player = await this.stateService.getOrCreatePlayerState(ownerId);
    player.coins += reward.coins;
    if (reward.consumableId && reward.consumableCount) {
      const bag = { ...(player.consumablesPayload ?? {}) };
      bag[reward.consumableId] = (bag[reward.consumableId] ?? 0) + reward.consumableCount;
      player.consumablesPayload = bag;
    }
    if (reward.seedCropId && reward.seedCount) {
      const seedBag = { ...(player.seedBagPayload ?? {}) };
      const k = reward.seedCropId as keyof typeof seedBag;
      seedBag[k] = (seedBag[k] ?? 0) + reward.seedCount;
      player.seedBagPayload = seedBag;
    }
    await this.playerRepo.save(player);

    checkin.streak = nextStreak;
    checkin.lastCheckinDate = today;
    checkin.totalCheckins = (checkin.totalCheckins ?? 0) + 1;
    const saved = await this.checkinRepo.save(checkin);

    return {
      player: this.stateService.toPlayerView(player),
      checkin: this.viewFrom(saved, false, reward),
      reward,
    };
  }

  private async ensureCheckin(ownerId: string): Promise<FarmCheckinEntity> {
    let row = await this.checkinRepo.findOneBy({ ownerId });
    if (!row) {
      row = this.checkinRepo.create({
        ownerId,
        lastCheckinDate: null,
        streak: 0,
        totalCheckins: 0,
      });
      row = await this.checkinRepo.save(row);
    }
    return row;
  }

  private viewFrom(
    state: FarmCheckinEntity,
    canCheckinToday: boolean,
    todayReward: FarmCheckinDayReward,
  ): FarmCheckinView {
    return {
      ownerId: state.ownerId,
      lastCheckinDate: state.lastCheckinDate ?? null,
      streak: state.streak,
      totalCheckins: state.totalCheckins,
      canCheckinToday,
      todayReward,
      rewards: FARM_CHECKIN_REWARDS,
    };
  }
}

function computeNextStreak(
  prevStreak: number,
  lastDate: string | null | undefined,
  today: string,
): number {
  if (!lastDate) return 1;
  if (lastDate === yesterdayLocalDate(new Date(today))) {
    return Math.min(7, prevStreak + 1);
  }
  if (lastDate === today) {
    return prevStreak; // 同天再调度不应发生（前置校验拦截）；保持不动。
  }
  return 1; // 断了重头来
}

function pickReward(streak: number): FarmCheckinDayReward {
  const idx = Math.max(1, Math.min(7, streak)) - 1;
  return FARM_CHECKIN_REWARDS[idx]!;
}
