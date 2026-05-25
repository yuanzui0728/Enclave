// i18n-ignore-start: backend cron service; logs are operational, not user-facing.
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiGenerationJobService } from './ai-generation-job.service';

/**
 * sweeper：5 分钟一次，把 status='generating' 且 aiStartedAt 早于 (now - STALE_MS)
 * 的 job 标 failed。两个场景：
 *   1. LLM 真挂了 / 进程崩了 / 设备重启，setImmediate 的回调永远跑不完
 *   2. 极端 quota / rate limit 把 LLM 调用卡死
 *
 * 阈值用 5 分钟（远大于实测最长 LLM 单次 60s + 安全余量），避免误杀仍在跑的
 * 慢任务。前端轮询本身 100 次 × 3s = 5 分钟也到顶，与此对齐。
 *
 * 但周期 cron 对"进程重启"这一场景有盲区：被重启瞬间孤立的 job aiStartedAt 很新，
 * 会被 5 分钟 age 阈值放过；且若重启间隔 < 5 分钟，EVERY_5_MINUTES 计时器会被
 * 反复重置而永不触发。所以这里再加一道 onModuleInit 启动即清——见
 * failOrphanedOnBoot 注释。
 */
const STALE_MS = 5 * 60 * 1000;

@Injectable()
export class AiGenerationJobSweeperService implements OnModuleInit {
  private readonly logger = new Logger(AiGenerationJobSweeperService.name);

  constructor(private readonly jobService: AiGenerationJobService) {}

  /**
   * 启动即清：进程刚起来时，所有还停在 generating 的 job 必然是上一个进程
   * 被重启时孤立的（新进程不接管历史 job），立刻标 failed，让前端轮询拿到终态、
   * 不再无意义转圈。与周期 sweep 的 age 阈值互补——这里 age-independent。
   */
  async onModuleInit(): Promise<void> {
    try {
      const orphaned = await this.jobService.failOrphanedOnBoot(
        '生成因服务重启而中断，请重试',
      );
      if (orphaned > 0) {
        this.logger.log(
          `boot: marked ${orphaned} orphaned generating job(s) as failed`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `ai-generation-job boot sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    let killed = 0;
    try {
      const stale = await this.jobService.listStaleGenerating(STALE_MS);
      for (const row of stale) {
        await this.jobService.markFailed(row.id, '生成超时，请重试');
        killed += 1;
      }
    } catch (err) {
      this.logger.warn(
        `ai-generation-job sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (killed > 0) {
      this.logger.log(`ai-generation-job sweeper marked ${killed} stale job(s) as failed`);
    }
  }
}
// i18n-ignore-end
