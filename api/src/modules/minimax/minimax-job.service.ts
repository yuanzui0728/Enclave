// i18n-ignore-start: provider adapter — log strings only.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LessThan, Repository } from 'typeorm';
// mp3-duration 没带 .d.ts；签名: (buffer | filename, cbrEstimate?, cb?) -> Promise<seconds>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mp3Duration: (input: Buffer | string) => Promise<number> = require('mp3-duration');
import { resolveReadableMomentMediaPath } from '../moments/moment-media.storage';
import { MinimaxJobEntity } from './minimax-job.entity';
import {
  type MinimaxJobInputPayload,
  type MinimaxJobKind,
  type MinimaxJobStatus,
  type MinimaxJobTargetType,
  type MinimaxVideoJobInputPayload,
  type MinimaxMusicJobInputPayload,
} from './minimax-job.types';
import { MinimaxClient, MinimaxClientError } from './minimax.client';
import { MinimaxAssetStorage } from './minimax-asset.storage';
import { MinimaxQuotaService, shanghaiDateOf, todayInShanghai } from './minimax-quota.service';
import type { MinimaxJobCallback } from './minimax-job.callbacks';
import type { MinimaxVideoModel, MinimaxMusicModel } from './minimax.types';

const VIDEO_POLL_INTERVAL_MS = 30_000;
const VIDEO_MAX_ATTEMPTS = 25; // ~12 minutes at 30s per
const MUSIC_POLL_INTERVAL_MS = 30_000;
const MUSIC_MAX_ATTEMPTS = 10; // ~5 minutes at 30s per
const STALE_VIDEO_AFTER_MS = 15 * 60 * 1000;
// 异步音乐轮询期间 lastAttemptAt 每 30s 刷新，所以 stale 阈值
// 主要用于"提交后进程崩溃"等异常情况，按视频对齐到 5 分钟。
const STALE_MUSIC_AFTER_MS = 5 * 60 * 1000;
// 重排上界：防止 submitted 卡住 → 重排 → 又卡住的死循环。
// attemptCount 不仅记轮询次数，也记重排次数。
const STALE_REQUEUE_MAX_ATTEMPTS: Record<MinimaxJobKind, number> = {
  video: VIDEO_MAX_ATTEMPTS * 2, // 50
  music: MUSIC_MAX_ATTEMPTS * 2, // 20
};

interface EnqueueVideoArgs {
  model: MinimaxVideoModel;
  prompt: string;
  firstFrameImageUrl?: string;
  resolution?: '768P' | '1080P';
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  targetType: MinimaxJobTargetType;
}

interface EnqueueMusicArgs {
  model: MinimaxMusicModel;
  prompt?: string;
  lyrics?: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  targetType: MinimaxJobTargetType;
  // 可选：直接挂上目标 id，避免 enqueue → setTimeout(processMusicJobs) 与
  // 调用方随后 attachTarget 之间的竞态。子任务（如 BGM）建议直接传入。
  targetId?: string | null;
}

@Injectable()
export class MinimaxJobService {
  private readonly logger = new Logger(MinimaxJobService.name);
  private readonly callbacks = new Map<MinimaxJobTargetType, MinimaxJobCallback>();
  private processingVideo = false;
  private processingMusic = false;

  constructor(
    @InjectRepository(MinimaxJobEntity)
    private readonly repo: Repository<MinimaxJobEntity>,
    private readonly client: MinimaxClient,
    private readonly storage: MinimaxAssetStorage,
    private readonly quota: MinimaxQuotaService,
  ) {}

  registerCallback(targetType: MinimaxJobTargetType, cb: MinimaxJobCallback) {
    this.callbacks.set(targetType, cb);
    this.logger.log(`registered callback for ${targetType}`);
  }

  async enqueueVideoJob(args: EnqueueVideoArgs): Promise<MinimaxJobEntity | null> {
    if (!this.client.isConfigured()) {
      this.logger.warn('enqueueVideoJob skipped: MINIMAX_API_KEY missing');
      return null;
    }
    const reserved = await this.quota.tryReserve(args.model);
    if (!reserved) {
      this.logger.warn(`enqueueVideoJob skipped: ${args.model} quota exhausted`);
      return null;
    }
    const payload: MinimaxVideoJobInputPayload = {
      kind: 'video',
      prompt: args.prompt,
      firstFrameImageUrl: args.firstFrameImageUrl,
      resolution: args.resolution,
    };
    const job = this.repo.create({
      kind: 'video',
      status: 'pending',
      inputPayload: JSON.stringify(payload),
      model: args.model,
      targetType: args.targetType,
      targetId: null,
      characterId: args.characterId,
      characterName: args.characterName,
      characterAvatar: args.characterAvatar ?? null,
      executeAfter: new Date(),
      attemptCount: 0,
    });
    const saved = await this.repo.save(job);
    setTimeout(() => void this.processVideoJobs(), 0);
    return saved;
  }

  async enqueueMusicJob(args: EnqueueMusicArgs): Promise<MinimaxJobEntity | null> {
    if (!this.client.isConfigured()) {
      this.logger.warn('enqueueMusicJob skipped: MINIMAX_API_KEY missing');
      return null;
    }
    // fallback 链：music-2.6 用尽时降级到 music-2.5（4/日）多顶 4 个名额。
    // 上游统一传 'music-2.6'，质量优先；2.5 仅作余额耗尽兜底。
    const fallbackChain: MinimaxMusicModel[] =
      args.model === 'music-2.6' ? ['music-2.6', 'music-2.5'] : [args.model];
    let actualModel: MinimaxMusicModel | null = null;
    for (const m of fallbackChain) {
      if (await this.quota.tryReserve(m)) {
        actualModel = m;
        break;
      }
    }
    if (!actualModel) {
      this.logger.warn(
        `enqueueMusicJob skipped: all music quota exhausted (${fallbackChain.join('/')})`,
      );
      return null;
    }
    if (actualModel !== args.model) {
      this.logger.log(
        `enqueueMusicJob fell back ${args.model} → ${actualModel}`,
      );
    }
    const payload: MinimaxMusicJobInputPayload = {
      kind: 'music',
      prompt: args.prompt,
      lyrics: args.lyrics,
    };
    const job = this.repo.create({
      kind: 'music',
      status: 'pending',
      inputPayload: JSON.stringify(payload),
      model: actualModel,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      characterId: args.characterId,
      characterName: args.characterName,
      characterAvatar: args.characterAvatar ?? null,
      executeAfter: new Date(),
      attemptCount: 0,
    });
    const saved = await this.repo.save(job);
    setTimeout(() => void this.processMusicJobs(), 0);
    return saved;
  }

  async attachTarget(jobId: string, targetId: string): Promise<void> {
    await this.repo.update(jobId, { targetId });
  }

  // 调用方：enqueue 成功但后续 createPost / attachTarget 抛错时，必须调这个
  // 把已 reserve 的配额释放并删掉 orphan job。否则配额白扣、cron 还会去执行
  // 一个没有目标可挂的 job。
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.repo.findOne({ where: { id: jobId } });
    if (!job) return;
    // 只有 completed 时配额才被 commit；pending/submitted/downloading 状态下
    // 配额仍是 reserved，必须 release 否则今日额度白扣。
    if (job.status !== 'completed' && job.status !== 'failed') {
      await this.quota.release(job.model);
    }
    await this.repo.delete(jobId);
    this.logger.warn(`cancelled minimax job ${jobId} status=${job.status} (orphan rollback)`);
  }

  async getJob(jobId: string): Promise<MinimaxJobEntity | null> {
    return this.repo.findOne({ where: { id: jobId } });
  }

  @Cron('*/30 * * * * *')
  async processVideoJobsCron(): Promise<void> {
    await this.processVideoJobs();
  }

  @Cron('*/5 * * * * *')
  async processMusicJobsCron(): Promise<void> {
    await this.processMusicJobs();
  }

  async processVideoJobs(): Promise<void> {
    if (this.processingVideo) return;
    this.processingVideo = true;
    try {
      await this.requeueStaleJobs('video', STALE_VIDEO_AFTER_MS);
      const now = new Date();
      const jobs = await this.repo.find({
        where: [
          { kind: 'video', status: 'pending', executeAfter: LessThan(now) },
          { kind: 'video', status: 'submitted', executeAfter: LessThan(now) },
          { kind: 'video', status: 'downloading', executeAfter: LessThan(now) },
        ],
        order: { executeAfter: 'ASC' },
        take: 6,
      });
      for (const job of jobs) {
        try {
          await this.advanceVideoJob(job);
        } catch (error) {
          this.logger.error(
            `video job ${job.id} unexpected error: ${(error as Error)?.message}`,
          );
        }
      }
    } finally {
      this.processingVideo = false;
    }
  }

  async processMusicJobs(): Promise<void> {
    if (this.processingMusic) return;
    this.processingMusic = true;
    try {
      await this.requeueStaleJobs('music', STALE_MUSIC_AFTER_MS);
      const now = new Date();
      const jobs = await this.repo.find({
        where: [
          { kind: 'music', status: 'pending', executeAfter: LessThan(now) },
          { kind: 'music', status: 'submitted', executeAfter: LessThan(now) },
          { kind: 'music', status: 'downloading', executeAfter: LessThan(now) },
        ],
        order: { executeAfter: 'ASC' },
        take: 8,
      });
      for (const job of jobs) {
        try {
          await this.advanceMusicJob(job);
        } catch (error) {
          this.logger.error(
            `music job ${job.id} unexpected error: ${(error as Error)?.message}`,
          );
        }
      }
    } finally {
      this.processingMusic = false;
    }
  }

  private async advanceVideoJob(job: MinimaxJobEntity): Promise<void> {
    const payload = JSON.parse(job.inputPayload) as MinimaxJobInputPayload;
    if (payload.kind !== 'video') {
      await this.markFailed(job, 'BAD_PAYLOAD', 'expected video payload');
      return;
    }

    if (job.status === 'pending') {
      // Pre-flight：今天该 model 已被 minimax 服务端确认耗尽（前一个 job 撞过 2056），
      // 直接 markFailed 不再提交。明天 0:00 (Shanghai) usageDate 翻新自然恢复。
      // 否则同一队列里堆积的 pending job 会逐个撞一次 2056、白白吃 callCount + quotaLimitedCount。
      if (await this.quota.isExhaustedToday(job.model)) {
        await this.markFailed(
          job,
          'MINIMAX_QUOTA_EXHAUSTED',
          `${job.model} daily quota exhausted; deferred until next Shanghai day`,
        );
        return;
      }
      try {
        let firstFrameImageUrl: string | undefined =
          payload.firstFrameImageUrl ?? undefined;
        let coverFileName = job.coverFileName ?? undefined;
        let coverPublicUrl = job.coverUrl ?? undefined;
        const needsFirstFrame =
          job.model === 'MiniMax-Hailuo-2.3-Fast' && !firstFrameImageUrl;
        if (needsFirstFrame) {
          // 重试场景：之前已经生成过封面就直接复用磁盘文件，
          // 不再重复消耗 image-01 配额。
          if (coverFileName) {
            const reused = await this.tryReadCoverAsDataUrl(coverFileName);
            if (reused) {
              firstFrameImageUrl = reused;
              this.logger.log(
                `video job ${job.id} reusing existing cover ${coverFileName} (no image-01 spend)`,
              );
            }
          }
          if (!firstFrameImageUrl) {
            const reservedCover = await this.quota.tryReserve('image-01');
            if (!reservedCover) {
              await this.markFailed(
                job,
                'COVER_QUOTA',
                'Fast model needs first_frame_image but image-01 quota exhausted',
              );
              return;
            }
            try {
              const img = await this.client.generateImage({
                model: 'image-01',
                prompt: `Cinematic 9:16 portrait still — ${payload.prompt.slice(0, 200)}`,
                aspectRatio: '9:16',
              });
              const persisted = await this.storage.persist({
                buffer: img.buffer,
                mimeType: img.mimeType,
                kind: 'image',
                suffix: '-firstframe',
              });
              // MiniMax accepts a data URL for first_frame_image; the persisted
              // public URL points at the local API which they can't fetch.
              firstFrameImageUrl = `data:${img.mimeType};base64,${img.buffer.toString('base64')}`;
              coverFileName = persisted.fileName;
              coverPublicUrl = persisted.publicUrl;
              await this.quota.commit('image-01');
              await this.repo.update(job.id, {
                coverUrl: persisted.publicUrl,
                coverFileName: persisted.fileName,
              });
            } catch (err) {
              await this.quota.release('image-01');
              if (
                err instanceof MinimaxClientError &&
                err.code === 'MINIMAX_QUOTA_EXHAUSTED'
              ) {
                // 同 handleClientError 里的逻辑：image-01 服务端确认今日耗尽，
                // 标本地不再 reserve，下次直接走 maybeDemoteFastToHd / 跳过。
                await this.quota.markExhaustedToday('image-01');
              }
              this.logger.warn(
                `cover gen failed for job ${job.id}: ${(err as Error)?.message}`,
              );
              await this.maybeDemoteFastToHd(job);
              return;
            }
          }
        }

        const submit = await this.client.submitVideo({
          model: job.model as MinimaxVideoModel,
          prompt: payload.prompt,
          firstFrameImageUrl,
          resolution: payload.resolution ?? '768P',
        });
        await this.repo.update(job.id, {
          status: 'submitted',
          taskId: submit.taskId,
          attemptCount: job.attemptCount + 1,
          lastAttemptAt: new Date(),
          executeAfter: new Date(Date.now() + VIDEO_POLL_INTERVAL_MS),
          coverFileName,
          coverUrl: coverPublicUrl,
        });
        this.logger.log(
          `video job ${job.id} submitted: model=${job.model} task=${submit.taskId}`,
        );
      } catch (error) {
        await this.handleClientError(job, error, 'submit video');
      }
      return;
    }

    if (job.status === 'submitted') {
      if (!job.taskId) {
        await this.markFailed(job, 'NO_TASK_ID', 'submitted job missing taskId');
        return;
      }
      if (job.attemptCount >= VIDEO_MAX_ATTEMPTS) {
        await this.markFailed(
          job,
          'POLL_EXHAUSTED',
          `polled ${job.attemptCount} times without success`,
        );
        return;
      }
      try {
        const q = await this.client.queryVideo(job.taskId);
        if (q.status === 'Success' && q.fileId) {
          await this.repo.update(job.id, {
            status: 'downloading',
            fileId: q.fileId,
            attemptCount: job.attemptCount + 1,
            lastAttemptAt: new Date(),
            executeAfter: new Date(),
          });
          this.logger.log(
            `video job ${job.id} succeeded on minimax: file=${q.fileId}`,
          );
          // Cascade: try downloading immediately in this tick.
          const refreshed = await this.repo.findOneByOrFail({ id: job.id });
          await this.advanceVideoJob(refreshed);
        } else if (q.status === 'Fail') {
          await this.markFailed(
            job,
            'PROVIDER_FAIL',
            q.failReason ?? 'video task reported Fail',
          );
        } else {
          await this.repo.update(job.id, {
            attemptCount: job.attemptCount + 1,
            lastAttemptAt: new Date(),
            executeAfter: new Date(Date.now() + VIDEO_POLL_INTERVAL_MS),
          });
          this.logger.debug(
            `video job ${job.id} status=${q.status} attempt=${job.attemptCount + 1}`,
          );
        }
      } catch (error) {
        await this.handleClientError(job, error, 'query video');
      }
      return;
    }

    if (job.status === 'downloading') {
      if (!job.fileId) {
        await this.markFailed(job, 'NO_FILE_ID', 'downloading without fileId');
        return;
      }
      try {
        const file = await this.client.retrieveFile(job.fileId);
        const dl = await this.client.downloadBinary(file.downloadUrl);
        const persisted = await this.storage.persist({
          buffer: dl.buffer,
          mimeType: dl.mimeType,
          kind: 'video',
        });
        await this.repo.update(job.id, {
          status: 'completed',
          remoteDownloadUrl: file.downloadUrl,
          localFileName: persisted.fileName,
          localUrl: persisted.publicUrl,
          localMimeType: persisted.mimeType,
          localSize: persisted.size,
          completedAt: new Date(),
          lastAttemptAt: new Date(),
        });
        await this.quota.commit(job.model);
        this.logger.log(
          `video job ${job.id} downloaded -> ${persisted.fileName} (${persisted.size}B)`,
        );
        const finalJob = await this.repo.findOneByOrFail({ id: job.id });
        await this.fireOnCompleted(finalJob);
      } catch (error) {
        await this.handleClientError(job, error, 'download video');
      }
    }
  }

  private async advanceMusicJob(job: MinimaxJobEntity): Promise<void> {
    const payload = JSON.parse(job.inputPayload) as MinimaxJobInputPayload;
    if (payload.kind !== 'music') {
      await this.markFailed(job, 'BAD_PAYLOAD', 'expected music payload');
      return;
    }

    if (job.status === 'pending') {
      // 同 video：今日已耗尽就直接失败，避免队列里残留 pending 接力撞 2056。
      if (await this.quota.isExhaustedToday(job.model)) {
        await this.markFailed(
          job,
          'MINIMAX_QUOTA_EXHAUSTED',
          `${job.model} daily quota exhausted; deferred until next Shanghai day`,
        );
        return;
      }
      try {
        const result = await this.client.generateMusic({
          model: job.model as MinimaxMusicModel,
          prompt: payload.prompt,
          lyrics: payload.lyrics,
        });
        if (result.kind === 'inline') {
          await this.completeMusicJob(job, {
            buffer: result.buffer,
            mimeType: result.mimeType,
            durationMs: result.durationMs ?? null,
          });
        } else {
          // 异步任务路径：保存 taskId，转 submitted，等下次轮询
          await this.repo.update(job.id, {
            status: 'submitted',
            taskId: result.taskId,
            attemptCount: job.attemptCount + 1,
            lastAttemptAt: new Date(),
            executeAfter: new Date(Date.now() + MUSIC_POLL_INTERVAL_MS),
          });
          this.logger.log(
            `music job ${job.id} submitted async: model=${job.model} task=${result.taskId}`,
          );
        }
      } catch (error) {
        await this.handleClientError(job, error, 'submit music');
      }
      return;
    }

    if (job.status === 'submitted') {
      if (!job.taskId) {
        await this.markFailed(job, 'NO_TASK_ID', 'submitted music missing taskId');
        return;
      }
      if (job.attemptCount >= MUSIC_MAX_ATTEMPTS) {
        await this.markFailed(
          job,
          'POLL_EXHAUSTED',
          `music polled ${job.attemptCount} times without success`,
        );
        return;
      }
      try {
        const q = await this.client.queryMusic(job.taskId);
        if (q.status === 'Success' && q.audioHex) {
          // 内联返回：直接完成
          const buffer = Buffer.from(q.audioHex, 'hex');
          if (!buffer.length) {
            await this.markFailed(
              job,
              'MUSIC_QUERY_EMPTY_AUDIO',
              'query returned empty audio buffer',
            );
            return;
          }
          await this.completeMusicJob(job, {
            buffer,
            mimeType: 'audio/mpeg',
            durationMs: q.durationMs ?? null,
          });
        } else if (q.status === 'Success' && q.fileId) {
          // file 模式：通过 retrieveFile + downloadBinary 拉回
          const file = await this.client.retrieveFile(q.fileId);
          const dl = await this.client.downloadBinary(file.downloadUrl);
          await this.completeMusicJob(job, {
            buffer: dl.buffer,
            mimeType: dl.mimeType || 'audio/mpeg',
            durationMs: q.durationMs ?? null,
            remoteDownloadUrl: file.downloadUrl,
          });
        } else if (q.status === 'Success') {
          // Success 但既无 audioHex 也无 fileId — 服务端语义破损，
          // 继续轮询不会变出数据，直接失败。
          await this.markFailed(
            job,
            'MUSIC_QUERY_NO_PAYLOAD',
            'music task Success but no audioHex/fileId',
          );
        } else if (q.status === 'Fail') {
          await this.markFailed(
            job,
            'PROVIDER_FAIL',
            q.failReason ?? 'music task reported Fail',
          );
        } else {
          await this.repo.update(job.id, {
            attemptCount: job.attemptCount + 1,
            lastAttemptAt: new Date(),
            executeAfter: new Date(Date.now() + MUSIC_POLL_INTERVAL_MS),
          });
          this.logger.debug(
            `music job ${job.id} status=${q.status} attempt=${job.attemptCount + 1}`,
          );
        }
      } catch (error) {
        await this.handleClientError(job, error, 'query music');
      }
    }
  }

  private async completeMusicJob(
    job: MinimaxJobEntity,
    data: {
      buffer: Buffer;
      mimeType: string;
      durationMs: number | null;
      remoteDownloadUrl?: string;
    },
  ): Promise<void> {
    const persisted = await this.storage.persist({
      buffer: data.buffer,
      mimeType: data.mimeType,
      kind: 'music',
    });
    // MiniMax query 实测从来不返回 duration 字段，client 端 audio-card 的 0:00
    // 完全靠浏览器 loadedmetadata 兜底。这里读 MP3 帧头估时长，让 mediaPayload 落库
    // 时就有 durationMs，UI 首屏就不会闪 0:00。失败仅记日志，不阻塞 job 完成。
    let durationMs = data.durationMs;
    if (durationMs == null) {
      try {
        const seconds = await mp3Duration(data.buffer);
        if (Number.isFinite(seconds) && seconds > 0) {
          durationMs = Math.round(seconds * 1000);
        }
      } catch (err) {
        this.logger.warn(
          `mp3-duration extraction failed for job ${job.id}: ${(err as Error)?.message}`,
        );
      }
    }
    await this.repo.update(job.id, {
      status: 'completed',
      remoteDownloadUrl: data.remoteDownloadUrl ?? null,
      localFileName: persisted.fileName,
      localUrl: persisted.publicUrl,
      localMimeType: persisted.mimeType,
      localSize: persisted.size,
      localDurationMs: durationMs,
      completedAt: new Date(),
      attemptCount: job.attemptCount + 1,
      lastAttemptAt: new Date(),
    });
    await this.quota.commit(job.model);
    this.logger.log(
      `music job ${job.id} completed -> ${persisted.fileName} (${persisted.size}B)`,
    );
    const finalJob = await this.repo.findOneByOrFail({ id: job.id });
    await this.fireOnCompleted(finalJob);
  }

  private async tryReadCoverAsDataUrl(
    fileName: string,
  ): Promise<string | null> {
    try {
      const fullPath = resolveReadableMomentMediaPath(fileName);
      const buf = await readFile(fullPath);
      const ext = path.extname(fileName).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch (err) {
      this.logger.warn(
        `cover file ${fileName} unreadable: ${(err as Error)?.message}`,
      );
      return null;
    }
  }

  private async maybeDemoteFastToHd(job: MinimaxJobEntity): Promise<void> {
    if (job.model !== 'MiniMax-Hailuo-2.3-Fast') {
      await this.markFailed(job, 'COVER_FAIL', 'cover gen failed (non-Fast job)');
      return;
    }
    const hdAvailable = await this.quota.availableToday('MiniMax-Hailuo-2.3');
    if (hdAvailable <= 0) {
      await this.markFailed(
        job,
        'COVER_FAIL_NO_HD_FALLBACK',
        'cover gen failed and no HD quota for fallback',
      );
      return;
    }
    const reserved = await this.quota.tryReserve('MiniMax-Hailuo-2.3');
    if (!reserved) {
      await this.markFailed(
        job,
        'COVER_FAIL_HD_RESERVE',
        'cover gen failed and HD reserve race lost',
      );
      return;
    }
    await this.quota.release('MiniMax-Hailuo-2.3-Fast');
    await this.repo.update(job.id, {
      model: 'MiniMax-Hailuo-2.3',
      executeAfter: new Date(),
      attemptCount: job.attemptCount + 1,
      lastAttemptAt: new Date(),
    });
    this.logger.log(`job ${job.id} demoted Fast → HD (cover gen failed)`);
  }

  private async requeueStaleJobs(
    kind: MinimaxJobKind,
    staleMs: number,
  ): Promise<void> {
    const cutoff = new Date(Date.now() - staleMs);
    const stale = await this.repo.find({
      where: {
        kind,
        status: 'submitted',
        lastAttemptAt: LessThan(cutoff),
      },
      take: 5,
    });
    const maxAttempts = STALE_REQUEUE_MAX_ATTEMPTS[kind];
    const shanghaiToday = todayInShanghai();
    for (const job of stale) {
      // 跨日防御：昨天的 submitted 卡住的 job 不要在新一天 0:01 立刻翻 pending
      // 重新打 provider — 一打就是新一天的配额，可能在几秒内把新预算烧光。
      // 直接 markFailed 释放 reserved，留待用户/上游决策是否重发。
      const lastDay = shanghaiDateOf(
        job.lastAttemptAt ?? job.executeAfter ?? job.createdAt ?? new Date(),
      );
      if (lastDay !== shanghaiToday) {
        await this.markFailed(
          job,
          'CROSS_DAY_ABANDONED',
          `submitted ${kind} job spans Shanghai day boundary (last=${lastDay}, today=${shanghaiToday}); abandoned to protect new-day budget`,
        );
        continue;
      }
      const nextAttempt = job.attemptCount + 1;
      if (nextAttempt >= maxAttempts) {
        await this.markFailed(
          job,
          'STALE_REQUEUE_EXHAUSTED',
          `requeued ${nextAttempt} times without progress (max=${maxAttempts})`,
        );
        continue;
      }
      this.logger.warn(
        `requeue stale ${kind} job ${job.id} attempt=${nextAttempt}/${maxAttempts}`,
      );
      await this.repo.update(job.id, {
        status: 'pending',
        executeAfter: new Date(),
        attemptCount: nextAttempt,
        lastAttemptAt: new Date(),
      });
    }
  }

  private async handleClientError(
    job: MinimaxJobEntity,
    error: unknown,
    context: string,
  ): Promise<void> {
    const e = error as MinimaxClientError | Error;
    const code =
      e instanceof MinimaxClientError ? e.code : 'UNKNOWN';
    const retriable =
      e instanceof MinimaxClientError ? e.retriable : true;
    const message = e?.message ?? 'unknown error';
    // 真实 minimax 服务端确认本 model 今日额度已耗尽 → 标记，后续
    // tryReserve 直接返回 false，避免今天剩余 cron tick 继续打无效请求。
    if (e instanceof MinimaxClientError && code === 'MINIMAX_QUOTA_EXHAUSTED') {
      await this.quota.markExhaustedToday(job.model);
    }
    if (!retriable) {
      await this.markFailed(job, code, `${context}: ${message}`);
      return;
    }
    const nextAttempt = job.attemptCount + 1;
    const backoffMs = Math.min(
      VIDEO_POLL_INTERVAL_MS,
      5_000 * Math.pow(2, Math.min(nextAttempt, 5)),
    );
    await this.repo.update(job.id, {
      attemptCount: nextAttempt,
      lastAttemptAt: new Date(),
      executeAfter: new Date(Date.now() + backoffMs),
      errorCode: code,
      errorMessage: message.slice(0, 500),
    });
    this.logger.warn(
      `${context} retry job=${job.id} in ${backoffMs}ms code=${code} msg=${message}`,
    );
  }

  private async markFailed(
    job: MinimaxJobEntity,
    code: string,
    message: string,
  ): Promise<void> {
    await this.repo.update(job.id, {
      status: 'failed',
      errorCode: code,
      errorMessage: message.slice(0, 500),
      completedAt: new Date(),
      lastAttemptAt: new Date(),
    });
    await this.quota.release(job.model);
    // 失败 job 的本地中间产物（视频 mp4 / 音乐 mp3 / 封面图）回收；
    // 不影响成功 job 的文件（它们被 post 引用着）。
    await this.storage.unlinkIfExists(job.localFileName);
    await this.storage.unlinkIfExists(job.coverFileName);
    this.logger.warn(`job ${job.id} failed code=${code} msg=${message}`);
    const refreshed = await this.repo.findOne({ where: { id: job.id } });
    if (refreshed) await this.fireOnFailed(refreshed);
  }

  private async fireOnCompleted(job: MinimaxJobEntity): Promise<void> {
    const cb = this.callbacks.get(job.targetType);
    if (!cb) {
      this.logger.warn(
        `no callback for ${job.targetType} (job ${job.id})`,
      );
      return;
    }
    try {
      await cb.onCompleted(job);
    } catch (error) {
      this.logger.error(
        `onCompleted callback threw for job ${job.id}: ${(error as Error)?.message}`,
      );
    }
  }

  private async fireOnFailed(job: MinimaxJobEntity): Promise<void> {
    const cb = this.callbacks.get(job.targetType);
    if (!cb) return;
    try {
      await cb.onFailed(job);
    } catch (error) {
      this.logger.error(
        `onFailed callback threw for job ${job.id}: ${(error as Error)?.message}`,
      );
    }
  }
}

// i18n-ignore-end
