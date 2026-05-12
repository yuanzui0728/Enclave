// i18n-ignore-start: provider adapter — log strings only.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MomentsService } from './moments.service';
import { MinimaxJobService } from '../minimax/minimax-job.service';
import type { MinimaxJobCallback } from '../minimax/minimax-job.callbacks';
import type { MinimaxJobEntity } from '../minimax/minimax-job.entity';
import type {
  MomentAudioAsset,
  MomentImageAsset,
  MomentVideoAsset,
} from './moment-media.types';
import { FeedService } from '../feed/feed.service';

@Injectable()
export class MomentsMinimaxCallbacks
  implements OnModuleInit, MinimaxJobCallback
{
  private readonly logger = new Logger(MomentsMinimaxCallbacks.name);

  constructor(
    private readonly moments: MomentsService,
    private readonly feed: FeedService,
    private readonly jobs: MinimaxJobService,
  ) {}

  onModuleInit() {
    this.jobs.registerCallback('moment_post', this);
    // BGM 子任务复用同一回调，在 onCompleted 头部按 targetType 分流
    this.jobs.registerCallback('moment_post_video_bgm', this);
  }

  async onCompleted(job: MinimaxJobEntity): Promise<void> {
    if (!job.targetId || !job.localUrl) {
      this.logger.warn(`moment_post completed without targetId/localUrl: ${job.id}`);
      return;
    }

    // 视频 BGM 子任务：把生成的 BGM 音频混入对应 moment_post 的视频文件。
    // 失败 → 静默保留静音视频，不影响主流程。
    if (job.targetType === 'moment_post_video_bgm') {
      if (job.kind !== 'music' || !job.localFileName) {
        this.logger.warn(
          `bgm job ${job.id} unexpected shape (kind=${job.kind}, file=${job.localFileName})`,
        );
        return;
      }
      const ok = await this.moments
        .applyBgmToVideoMomentPost(job.targetId, job.localFileName)
        .catch((err) => {
          this.logger.warn(
            `bgm mix failed job=${job.id} post=${job.targetId}: ${(err as Error)?.message}`,
          );
          return false;
        });
      this.logger.log(
        `video bgm ${ok ? 'applied' : 'skipped'} for post ${job.targetId} (job ${job.id})`,
      );
      return;
    }

    if (job.kind === 'music') {
      const seedText = extractMusicSeedText(job.inputPayload);
      // 封面（朋友圈 audio_card posterUrl 必备，1:1）+ 视频号配图（9:16 多张）并发。
      const [cover, pictorials] = await Promise.all([
        this.moments.tryRenderMinimaxMusicCover(job, seedText).catch((err) => {
          this.logger.warn(
            `cover render exception job=${job.id}: ${(err as Error)?.message}`,
          );
          return null;
        }),
        this.moments
          .tryRenderMinimaxMusicPictorials(job, seedText, 3)
          .catch((err) => {
            this.logger.warn(
              `pictorials render exception job=${job.id}: ${(err as Error)?.message}`,
            );
            return [];
          }),
      ]);
      const audio: MomentAudioAsset = {
        id: job.localFileName ?? job.id,
        kind: 'audio',
        url: job.localUrl,
        posterUrl: cover?.url,
        mimeType: job.localMimeType ?? 'audio/mpeg',
        fileName: job.localFileName ?? `${job.id}.mp3`,
        size: job.localSize ?? 0,
        durationMs: job.localDurationMs ?? undefined,
        title: `${job.characterName}·音乐`,
      };
      await this.moments.applyMinimaxMusicToPost(job.targetId, audio);
      // 双发：视频号也落一条音乐贴（用户决策：两边都发），附带多张 9:16 配图做抖音风图文视频。
      const images: MomentImageAsset[] = [];
      if (cover) {
        images.push({
          id: cover.fileName,
          kind: 'image',
          url: cover.url,
          mimeType: cover.mimeType,
          fileName: cover.fileName,
          size: cover.size,
        });
      }
      for (const p of pictorials) {
        images.push({
          id: p.fileName,
          kind: 'image',
          url: p.url,
          mimeType: p.mimeType,
          fileName: p.fileName,
          size: p.size,
        });
      }
      try {
        await this.feed.createChannelAudioPost({
          authorId: job.characterId,
          authorName: job.characterName,
          authorAvatar: job.characterAvatar ?? '',
          audioUrl: job.localUrl,
          posterUrl: cover?.url ?? null,
          durationMs: job.localDurationMs ?? null,
          text: audio.title ?? '',
          title: audio.title,
          images,
        });
      } catch (err) {
        this.logger.warn(
          `channel dual-publish failed for music job ${job.id}: ${(err as Error)?.message}`,
        );
      }
      return;
    }

    if (job.kind === 'video') {
      const video: MomentVideoAsset = {
        id: job.localFileName ?? job.id,
        kind: 'video',
        url: job.localUrl,
        posterUrl: job.coverUrl ?? undefined,
        mimeType: job.localMimeType ?? 'video/mp4',
        fileName: job.localFileName ?? `${job.id}.mp4`,
        size: job.localSize ?? 0,
        durationMs: job.localDurationMs ?? undefined,
      };
      await this.moments.applyMinimaxVideoToPost(job.targetId, video);

      // 视频号双发（先发静音版本，BGM 完成后会再次 upsert 更新 mediaPayload）
      await this.syncVideoMomentToChannels(job, video).catch((err) => {
        this.logger.warn(
          `channel dual-publish (silent) failed for video job ${job.id}: ${(err as Error)?.message}`,
        );
      });

      // 视频先静音落地，再异步追加 BGM job；BGM 完成后回调里 ffmpeg 混入。
      // 配额不足或生成失败都不影响视频本身已发布。
      try {
        const bgmPrompt = await this.moments.resolveVideoBgmPrompt(
          job.characterId,
          job.characterName,
        );
        // 直接传 targetId，避免与 enqueue 触发的 setTimeout(processMusicJobs)
        // 抢跑导致 BGM 任务在 attachTarget 之前就进入处理流程
        const bgmJob = await this.jobs.enqueueMusicJob({
          model: 'music-2.6',
          prompt: bgmPrompt,
          characterId: job.characterId,
          characterName: job.characterName,
          characterAvatar: job.characterAvatar ?? null,
          targetType: 'moment_post_video_bgm',
          targetId: job.targetId,
        });
        if (bgmJob) {
          this.logger.log(
            `video bgm job ${bgmJob.id} queued for post ${job.targetId}`,
          );
        } else {
          this.logger.log(
            `video bgm skipped (no music quota) for post ${job.targetId}`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `video bgm enqueue failed for post ${job.targetId}: ${(err as Error)?.message}`,
        );
      }
    }
  }

  // 把 moment_post 的视频同步到视频号，幂等（按 momentPostId 查找已存在的 channel post）。
  // 既给「BGM 完成前的静音双发」用，也给「BGM 完成后的 mediaPayload 刷新」用。
  private async syncVideoMomentToChannels(
    videoJob: MinimaxJobEntity,
    video: MomentVideoAsset,
  ): Promise<void> {
    if (!videoJob.targetId) return;
    await this.feed.upsertChannelVideoPostFromMoment({
      momentPostId: videoJob.targetId,
      authorId: videoJob.characterId,
      authorName: videoJob.characterName,
      authorAvatar: videoJob.characterAvatar ?? '',
      videoUrl: video.url,
      posterUrl: video.posterUrl ?? null,
      durationMs: video.durationMs ?? null,
      mimeType: video.mimeType,
      fileName: video.fileName,
      size: video.size,
      text: `${videoJob.characterName} 拍了一段画面`,
    });
  }

  async onFailed(job: MinimaxJobEntity): Promise<void> {
    if (!job.targetId) return;
    // BGM 子任务失败不要删主帖（视频本身已发布）
    if (job.targetType === 'moment_post_video_bgm') {
      this.logger.warn(
        `video bgm job ${job.id} failed for post ${job.targetId}; keeping silent video`,
      );
      return;
    }
    await this.moments.deleteMinimaxPlaceholderPost(job.targetId);
    this.logger.warn(
      `moment placeholder ${job.targetId} deleted after job ${job.id} failed`,
    );
  }
}

// 从 minimax music job 的 inputPayload 抽取 prompt / lyrics 作为生图 seedText。
// 解析失败或缺字段都退回空串——上游 prompt 模板对空串有兜底。
function extractMusicSeedText(inputPayload: string | null | undefined): string {
  if (!inputPayload) return '';
  try {
    const parsed = JSON.parse(inputPayload) as {
      prompt?: string;
      lyrics?: string;
    };
    const parts: string[] = [];
    if (parsed.prompt) parts.push(parsed.prompt);
    if (parsed.lyrics) parts.push(parsed.lyrics);
    return parts.join(' ').slice(0, 400);
  } catch {
    return '';
  }
}

// i18n-ignore-end
