// i18n-ignore-start: provider adapter — internal wiring only.
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MinimaxJobService } from '../../minimax/minimax-job.service';
import type { MinimaxJobCallback } from '../../minimax/minimax-job.callbacks';
import type { MinimaxJobEntity } from '../../minimax/minimax-job.entity';
import { WikiCharacterVideoService } from './wiki-character-video.service';

/**
 * 把 MiniMax 'wiki_character_video' job 的完成/失败回调路由到
 * WikiCharacterVideoService。仅在 wiki 进程注册（视频生成只发生在 wiki）。
 */
@Injectable()
export class WikiCharacterVideoCallbacks
  implements MinimaxJobCallback, OnModuleInit
{
  constructor(
    private readonly jobs: MinimaxJobService,
    private readonly service: WikiCharacterVideoService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerCallback('wiki_character_video', this);
  }

  async onCompleted(job: MinimaxJobEntity): Promise<void> {
    if (job.kind !== 'video') return;
    await this.service.markReadyFromJob(job);
  }

  async onFailed(job: MinimaxJobEntity): Promise<void> {
    await this.service.markFailedFromJob(job);
  }
}
// i18n-ignore-end
