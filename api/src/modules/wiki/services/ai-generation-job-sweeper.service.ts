// i18n-ignore-start: backend cron service; logs are operational, not user-facing.
import { Injectable, Logger } from '@nestjs/common';
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
 */
const STALE_MS = 5 * 60 * 1000;

@Injectable()
export class AiGenerationJobSweeperService {
  private readonly logger = new Logger(AiGenerationJobSweeperService.name);

  constructor(private readonly jobService: AiGenerationJobService) {}

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
