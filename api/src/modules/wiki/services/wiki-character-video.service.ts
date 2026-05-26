// i18n-ignore-start: backend service, errors below are thrown with user-facing zh copy inline.
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { CharacterVideoView } from '../character-video.types';
import { CharacterVideoEntity } from '../entities/character-video.entity';
import { WikiPrivateCharacterService } from './wiki-private-character.service';
import { WikiCharacterVideoPublishSyncService } from './wiki-character-video-publish-sync.service';
import { MinimaxJobService } from '../../minimax/minimax-job.service';
import { MinimaxQuotaService } from '../../minimax/minimax-quota.service';
import type { MinimaxJobEntity } from '../../minimax/minimax-job.entity';
import type { MinimaxVideoModel } from '../../minimax/minimax.types';

const PROMPT_MAX = 600;
// 生成 ready 后超过该时长仍停留 generating，视为孤儿（进程重启等），由 sweeper 标 failed。
const STALE_MS = 20 * 60 * 1000;

@Injectable()
export class WikiCharacterVideoService implements OnModuleInit {
  private readonly logger = new Logger(WikiCharacterVideoService.name);

  constructor(
    @InjectRepository(CharacterVideoEntity)
    private readonly repo: Repository<CharacterVideoEntity>,
    private readonly privateChars: WikiPrivateCharacterService,
    private readonly minimaxJobs: MinimaxJobService,
    private readonly minimaxQuota: MinimaxQuotaService,
    private readonly publishSync: WikiCharacterVideoPublishSyncService,
  ) {}

  /** 启动即清：上个进程被重启而孤立的 generating 任务标 failed，前端轮询拿终态。 */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.repo.update(
        { status: 'generating' },
        { status: 'failed', errorMessage: '生成因服务重启而中断，请重试' },
      );
      const n = result.affected ?? 0;
      if (n > 0) {
        this.logger.log(`boot: marked ${n} orphaned character-video job(s) as failed`);
      }
    } catch (err) {
      this.logger.warn(
        `character-video boot sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - STALE_MS);
      const stale = await this.repo.find({
        where: { status: 'generating', createdAt: LessThan(cutoff) },
        take: 100,
      });
      for (const row of stale) {
        await this.repo.update(
          { id: row.id },
          { status: 'failed', errorMessage: '生成超时，请重试' },
        );
      }
      if (stale.length > 0) {
        this.logger.log(`character-video sweeper marked ${stale.length} stale job(s) failed`);
      }
    } catch (err) {
      this.logger.warn(
        `character-video sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // 顺带重推 pending 的发布（中心或网络此前不可达）。
    await this.retryPendingPublishes();
  }

  /**
   * 用一句自然语言为【自己的私有角色】生成一条视频。
   * 拥有权：getById 对非本人 / 不存在抛 403/404 —— 即满足「只有自己的私有角色可创造」。
   */
  async create(
    ownerWikiUserId: string,
    privateCharacterId: string,
    prompt: string,
  ): Promise<CharacterVideoView> {
    const trimmed = (prompt ?? '').trim();
    if (!trimmed) {
      throw new ServiceUnavailableException('请先描述你想要的视频画面。');
    }
    const character = await this.privateChars.getById(ownerWikiUserId, privateCharacterId);

    const model = await this.pickVideoModel();
    if (!model) {
      throw new ServiceUnavailableException('今日视频生成额度已用完，请明天再试。');
    }

    const refinedPrompt = composeCharacterVideoPrompt(
      character.name,
      character.relationship,
      trimmed.slice(0, PROMPT_MAX),
    );

    const job = await this.minimaxJobs.enqueueVideoJob({
      model,
      prompt: refinedPrompt,
      resolution: '768P',
      characterId: privateCharacterId,
      characterName: character.name,
      characterAvatar: character.avatar,
      targetType: 'wiki_character_video',
    });
    if (!job) {
      throw new ServiceUnavailableException('今日视频生成额度已用完，请明天再试。');
    }

    const entity = await this.repo.save(
      this.repo.create({
        ownerWikiUserId,
        privateCharacterId,
        characterName: character.name,
        characterAvatar: character.avatar ?? '',
        relationship: character.relationship ?? null,
        prompt: trimmed.slice(0, PROMPT_MAX),
        refinedPrompt,
        status: 'generating',
        minimaxJobId: job.id,
        publishState: 'not_published',
        isDeleted: false,
      }),
    );
    await this.minimaxJobs.attachTarget(job.id, entity.id);
    return this.toView(entity);
  }

  /** 前端轮询 / 详情：按 owner 校验，越权返回 NotFound（不泄露存在性）。 */
  async getViewForOwner(ownerWikiUserId: string, id: string): Promise<CharacterVideoView> {
    const row = await this.repo.findOne({ where: { id, ownerWikiUserId, isDeleted: false } });
    if (!row) throw new NotFoundException('视频不存在');
    return this.toView(row);
  }

  async listForOwner(ownerWikiUserId: string): Promise<CharacterVideoView[]> {
    const rows = await this.repo.find({
      where: { ownerWikiUserId, isDeleted: false },
      order: { updatedAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.toView(r));
  }

  async softDelete(ownerWikiUserId: string, id: string): Promise<{ ok: true }> {
    const row = await this.repo.findOne({ where: { id, ownerWikiUserId } });
    if (!row) throw new NotFoundException('视频不存在');
    row.isDeleted = true;
    await this.repo.save(row);
    // TODO(WS5): 通知 cloud-api 下架 + 各 world 隐藏对应帖子。
    return { ok: true };
  }

  // ——— MiniMax 回调入口（由 WikiCharacterVideoCallbacks 调） ———

  async markReadyFromJob(job: MinimaxJobEntity): Promise<void> {
    const id = job.targetId;
    if (!id) {
      this.logger.warn(`video job ${job.id} completed but has no targetId`);
      return;
    }
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      this.logger.warn(`video job ${job.id} targetId=${id} not found`);
      return;
    }
    row.status = 'ready';
    row.videoFileName = job.localFileName ?? null;
    row.localVideoUrl = job.localUrl ?? null;
    row.coverUrl = job.coverUrl ?? null;
    row.durationMs = job.localDurationMs ?? null;
    row.publishState = 'pending';
    row.errorMessage = null;
    await this.repo.save(row);
    await this.tryPublish(row);
  }

  async markFailedFromJob(job: MinimaxJobEntity): Promise<void> {
    const id = job.targetId;
    if (!id) return;
    await this.repo.update(
      { id },
      {
        status: 'failed',
        errorMessage: (job.errorMessage ?? '视频生成失败，请重试').slice(0, 500),
      },
    );
  }

  // ——— 私有 ———

  private async tryPublish(row: CharacterVideoEntity): Promise<void> {
    try {
      const result = await this.publishSync.publish(row);
      row.publishState = result.ok ? 'published' : 'pending';
      row.publishedCloudVideoId = result.cloudVideoId ?? row.publishedCloudVideoId ?? null;
      await this.repo.save(row);
    } catch (err) {
      this.logger.warn(
        `publish video ${row.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.repo.update({ id: row.id }, { publishState: 'pending' });
    }
  }

  private async retryPendingPublishes(): Promise<void> {
    try {
      const pending = await this.repo.find({
        where: { status: 'ready', publishState: 'pending', isDeleted: false },
        take: 20,
      });
      for (const row of pending) {
        await this.tryPublish(row);
      }
    } catch (err) {
      this.logger.warn(
        `retryPendingPublishes failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async pickVideoModel(): Promise<MinimaxVideoModel | null> {
    if ((await this.minimaxQuota.availableToday('MiniMax-Hailuo-2.3-Fast')) > 0) {
      return 'MiniMax-Hailuo-2.3-Fast';
    }
    if ((await this.minimaxQuota.availableToday('MiniMax-Hailuo-2.3')) > 0) {
      return 'MiniMax-Hailuo-2.3';
    }
    return null;
  }

  private toView(row: CharacterVideoEntity): CharacterVideoView {
    return {
      id: row.id,
      privateCharacterId: row.privateCharacterId,
      characterName: row.characterName,
      characterAvatar: row.characterAvatar,
      prompt: row.prompt,
      status: row.status,
      publishState: row.publishState,
      videoUrl: row.localVideoUrl ?? null,
      coverUrl: row.coverUrl ?? null,
      durationMs: row.durationMs ?? null,
      errorMessage: row.errorMessage ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** 视频号短片提示词（与 feed.composeChannelVideoPrompt 同款风格，9:16/6s）。 */
function composeCharacterVideoPrompt(
  characterName: string,
  relationship: string | null | undefined,
  text: string,
): string {
  const personaSnippet = relationship?.trim()
    ? `角色定位：${relationship.slice(0, 120)}。`
    : '';
  const trimmedText = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  return [
    `${characterName} 的视频号短片，9:16 竖屏，6 秒。`,
    personaSnippet,
    `画面主题：${trimmedText || '城市夜景慢镜头，空气中带着 AI 隐界的氛围'}。`,
    '风格：电影感、低饱和、柔和光线、轻微镜头运动。',
  ]
    .filter(Boolean)
    .join(' ');
}
// i18n-ignore-end
