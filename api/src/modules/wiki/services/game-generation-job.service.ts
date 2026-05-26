// i18n-ignore-start: backend service, errors are domain codes (no user-facing zh strings).
import {
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { WikiGameJobView } from '../wiki-game.types';
import { GameGenerationJobEntity } from '../entities/game-generation-job.entity';

export type GameJobScope = 'game_create' | 'game_edit';

/** create 存 { prompt, title }，edit 存 { instruction }。 */
export interface GameJobInput {
  prompt?: string;
  title?: string;
  instruction?: string;
}

const STALE_MS = 8 * 60 * 1000; // 游戏生成是 2 段 LLM，给比角色（5min）更宽的阈值。

/**
 * 游戏 AI 生成任务的持久化 + 状态机，与角色 job 同款设计但独立。
 * boot 即清 + 周期 sweeper 折叠进本 service（implements OnModuleInit + @Cron），
 * 不另起 sweeper 文件。
 */
@Injectable()
export class GameGenerationJobService implements OnModuleInit {
  private readonly logger = new Logger(GameGenerationJobService.name);

  constructor(
    @InjectRepository(GameGenerationJobEntity)
    private readonly repo: Repository<GameGenerationJobEntity>,
  ) {}

  /**
   * 启动即清：进程刚起时仍停在 generating 的 job 必然是上个进程被重启孤立的
   * （新进程不接管历史 job），立刻标 failed，让前端轮询拿终态、不空转。
   */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.repo.update(
        { status: 'generating' },
        { status: 'failed', errorMessage: '生成因服务重启而中断，请重试' },
      );
      const n = result.affected ?? 0;
      if (n > 0) {
        this.logger.log(`boot: marked ${n} orphaned game-generation job(s) as failed`);
      }
    } catch (err) {
      this.logger.warn(
        `game-generation-job boot sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    let killed = 0;
    try {
      const cutoff = new Date(Date.now() - STALE_MS);
      const stale = await this.repo.find({
        where: { status: 'generating', startedAt: LessThan(cutoff) },
        take: 100,
      });
      for (const row of stale) {
        await this.markFailed(row.id, '生成超时，请重试');
        killed += 1;
      }
    } catch (err) {
      this.logger.warn(
        `game-generation-job sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (killed > 0) {
      this.logger.log(`game-generation-job sweeper marked ${killed} stale job(s) as failed`);
    }
  }

  async enqueue(input: {
    ownerUserId: string;
    scope: GameJobScope;
    gameId: string;
    payload: GameJobInput;
  }): Promise<GameGenerationJobEntity> {
    const row = this.repo.create({
      ownerUserId: input.ownerUserId,
      scope: input.scope,
      gameId: input.gameId,
      inputSnapshot: JSON.stringify(input.payload ?? {}),
      status: 'generating',
      resultRevisionId: null,
      resultVersion: null,
      errorMessage: null,
      startedAt: new Date(),
    });
    return this.repo.save(row);
  }

  async getByIdInternal(id: string): Promise<GameGenerationJobEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** 前端轮询：按 owner 校验，越权返回 NotFound（不泄露存在性）。 */
  async getViewForOwner(ownerUserId: string, id: string): Promise<WikiGameJobView> {
    const row = await this.repo.findOne({ where: { id, ownerUserId } });
    if (!row) throw new NotFoundException('生成任务不存在');
    return this.toView(row);
  }

  async markReady(
    id: string,
    resultRevisionId: string,
    resultVersion: number,
  ): Promise<void> {
    await this.repo.update(
      { id },
      { status: 'ready', resultRevisionId, resultVersion, errorMessage: null },
    );
  }

  async markFailed(id: string, message: string): Promise<void> {
    const trimmed = message.length > 2000 ? message.slice(0, 2000) : message;
    await this.repo.update({ id }, { status: 'failed', errorMessage: trimmed });
  }

  private toView(row: GameGenerationJobEntity): WikiGameJobView {
    return {
      id: row.id,
      status: row.status,
      gameId: row.gameId,
      revisionId: row.resultRevisionId,
      version: row.resultVersion,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
// i18n-ignore-end
