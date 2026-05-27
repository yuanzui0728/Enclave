import { forwardRef, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/app-error.exception';
import { TenantRepository } from '../../tenancy/tenant-scoped.repository';
import { FarmPlayerStateEntity } from './entities/farm-player-state.entity';
import { FarmQuestProgressEntity } from './entities/farm-quest-progress.entity';
import {
  FARM_QUEST_CATALOG,
  FARM_QUEST_IDS,
  FARM_QUEST_TRIGGERS,
  getQuestDefinition,
  isFarmQuestId,
  todayLocalDate,
} from './quest-catalog';
import { computeLevelFromExperience } from './crop-catalog';
import {
  FarmQuestClaimResult,
  FarmQuestId,
  FarmQuestProgress,
  FarmQuestsView,
} from './farm.types';
import { FarmStateService } from './farm-state.service';

@Injectable()
export class FarmQuestService {
  constructor(
    @InjectRepository(FarmQuestProgressEntity)
    private readonly questRepo: Repository<FarmQuestProgressEntity>,
    @InjectRepository(FarmPlayerStateEntity)
    private readonly playerRepo: Repository<FarmPlayerStateEntity>,
    // 对侧的 FarmStateService 已经 forwardRef 注入 FarmQuestService，
    // 这边不加 forwardRef → Nest 起 child 时全 world DI 直接挂掉。
    @Inject(forwardRef(() => FarmStateService))
    private readonly stateService: FarmStateService,
  ) {}

  async getView(ownerId: string): Promise<FarmQuestsView> {
    const rows = await this.ensureAll(ownerId);
    const today = todayLocalDate();
    // daily 任务的过日处理：之前 bumpProgress 才检查 dailyResetDate 不等于 today
    // 就归零；玩家第二天没做任何动作直接打开任务面板，UI 看到的还是昨天的 progress=3
    // claimed=true 的状态 — 以为今天日常已领完。这里在 getView 就清掉过期的日期。
    // 同时复用同一次循环搞 achievement_level_* sync。
    const player = await this.stateService.getOrCreatePlayerState(ownerId);
    const updates: Promise<unknown>[] = [];
    for (const row of rows) {
      const def = getQuestDefinition(row.questId);
      if (def.kind === 'daily' && row.dailyResetDate !== today) {
        row.progress = 0;
        row.claimed = false;
        row.dailyResetDate = today;
        updates.push(this.questRepo.save(row));
        continue;
      }
      // syncLevelAchievements 只在 harvest 触发 level-up 时跑；如果玩家在 Phase4
      // 上线时已经 >5 级，achievement_level_5 永远停在 0/5 — 等他下次升级才会同步。
      // 兜底在 getView 检查；没差异就什么都不写。
      if (
        player.level > 0 &&
        (row.questId === 'achievement_level_5' || row.questId === 'achievement_level_10')
      ) {
        const target = Math.min(def.goal, player.level);
        if ((row.progress ?? 0) < target) {
          row.progress = target;
          updates.push(this.questRepo.save(row));
        }
      }
    }
    if (updates.length > 0) await Promise.all(updates);
    return {
      ownerId,
      generatedAt: new Date().toISOString(),
      quests: rows.map((r) => this.toProgress(r)),
    };
  }

  // 由 farm-state.service 在动作发生时调用：plant / harvest / steal / gift / water 等。
  async recordAction(
    ownerId: string,
    action: keyof typeof FARM_QUEST_TRIGGERS,
    delta = 1,
  ): Promise<void> {
    const ids = FARM_QUEST_TRIGGERS[action] ?? [];
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.bumpProgress(ownerId, id, delta);
    }
  }

  // achievement_level_* 不能简单 +1，要 setProgress = currentLevel。
  async syncLevelAchievements(ownerId: string, level: number): Promise<void> {
    await this.setProgress(ownerId, 'achievement_level_5', level);
    await this.setProgress(ownerId, 'achievement_level_10', level);
  }

  async claim(
    ownerId: string,
    questId: string,
  ): Promise<FarmQuestClaimResult> {
    if (!isFarmQuestId(questId)) {
      throw new AppError('FARM_QUEST_UNKNOWN', {
        params: { questId },
        legacyMessage: `未知任务：${questId}`,
      });
    }
    const def = getQuestDefinition(questId);
    let row = await new TenantRepository(this.questRepo).findOneBy({ ownerId, questId });
    if (!row) {
      row = await this.bumpProgress(ownerId, questId, 0);
    }
    if (def.kind === 'daily' && row.dailyResetDate !== todayLocalDate()) {
      throw new AppError('FARM_QUEST_NOT_TODAY', {
        legacyMessage: '该日常任务今日还未触发',
        status: HttpStatus.CONFLICT,
      });
    }
    if (row.progress < def.goal) {
      throw new AppError('FARM_QUEST_NOT_DONE', {
        params: { goal: def.goal, current: row.progress },
        legacyMessage: `任务还没完成：${row.progress}/${def.goal}`,
        status: HttpStatus.CONFLICT,
      });
    }
    if (row.claimed) {
      throw new AppError('FARM_QUEST_ALREADY_CLAIMED', {
        legacyMessage: '该任务奖励已领过',
        status: HttpStatus.CONFLICT,
      });
    }
    const player = await this.stateService.getOrCreatePlayerState(ownerId);
    player.coins += def.rewardCoins;
    player.experience += def.rewardExperience;
    const newLevel = computeLevelFromExperience(player.experience);
    if (newLevel > player.level) {
      player.level = newLevel;
    }
    await this.playerRepo.save(player);

    row.claimed = true;
    await this.questRepo.save(row);

    return {
      player: this.stateService.toPlayerView(player),
      quest: this.toProgress(row),
    };
  }

  private async ensureAll(ownerId: string): Promise<FarmQuestProgressEntity[]> {
    const existing = await new TenantRepository(this.questRepo).findBy({ ownerId });
    const haveIds = new Set(existing.map((r) => r.questId));
    const today = todayLocalDate();
    // 第一次访问 /quests 要 seed N=任务总数 行，之前是 N 次串行 await save
    // = N 次独立 transaction。改成单次 save([...]) 走一次 batch insert。
    const toCreate: FarmQuestProgressEntity[] = [];
    for (const id of FARM_QUEST_IDS) {
      if (haveIds.has(id)) continue;
      const def = FARM_QUEST_CATALOG[id];
      toCreate.push(
        this.questRepo.create({
          ownerId,
          questId: id,
          progress: 0,
          claimed: false,
          dailyResetDate: def.kind === 'daily' ? today : null,
        }),
      );
    }
    if (toCreate.length === 0) return existing;
    const created = await this.questRepo.save(toCreate);
    return [...existing, ...created];
  }

  // 自动 reset：daily 任务 dailyResetDate != today 时，progress 与 claimed 归零。
  private async bumpProgress(
    ownerId: string,
    questId: FarmQuestId,
    delta: number,
  ): Promise<FarmQuestProgressEntity> {
    const def = getQuestDefinition(questId);
    let row = await new TenantRepository(this.questRepo).findOneBy({ ownerId, questId });
    const today = todayLocalDate();
    if (!row) {
      row = this.questRepo.create({
        ownerId,
        questId,
        progress: 0,
        claimed: false,
        dailyResetDate: def.kind === 'daily' ? today : null,
      });
    }
    if (def.kind === 'daily' && row.dailyResetDate !== today) {
      row.progress = 0;
      row.claimed = false;
      row.dailyResetDate = today;
    }
    if (delta > 0) {
      row.progress = Math.min(def.goal, (row.progress ?? 0) + delta);
    }
    return this.questRepo.save(row);
  }

  private async setProgress(
    ownerId: string,
    questId: FarmQuestId,
    value: number,
  ): Promise<FarmQuestProgressEntity> {
    const def = getQuestDefinition(questId);
    let row = await new TenantRepository(this.questRepo).findOneBy({ ownerId, questId });
    if (!row) {
      row = this.questRepo.create({
        ownerId,
        questId,
        progress: 0,
        claimed: false,
        dailyResetDate: def.kind === 'daily' ? todayLocalDate() : null,
      });
    }
    row.progress = Math.min(def.goal, Math.max(row.progress ?? 0, value));
    return this.questRepo.save(row);
  }

  private toProgress(row: FarmQuestProgressEntity): FarmQuestProgress {
    const def = getQuestDefinition(row.questId);
    return {
      id: row.questId,
      progress: row.progress ?? 0,
      goal: def.goal,
      kind: def.kind,
      nameZh: def.nameZh,
      descriptionZh: def.descriptionZh,
      rewardCoins: def.rewardCoins,
      rewardExperience: def.rewardExperience,
      claimed: row.claimed,
      dailyResetDate: row.dailyResetDate ?? null,
    };
  }
}
