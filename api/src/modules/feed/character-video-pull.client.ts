// i18n-ignore-start: backend service, logs are operational (not user-facing UI).
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSharedWorldMode } from '../tenancy/tenant-context';
import { FeedService } from './feed.service';

type PendingVideo = {
  cloudVideoId: string;
  sourceCharacterId: string;
  text?: string;
  title?: string | null;
  mediaUrl?: string;
  coverUrl?: string | null;
  durationMs?: number | null;
};

/**
 * LPP world 启动/唤醒时反向拉取兜底：调 cloud-api pending-for-owner 把该 owner 已导入
 * 角色、扇出时因 world 冷而漏投的视频补建到本地视频号，然后 ack 让 cloud 止住冗余 DOWN。
 * 仅 LPP（CLOUD_OWNER_PHONE 单 owner）启用；shared world 一个进程多 owner，onModuleInit
 * 无法 per-owner-wake 拉取，由 cloud-api 的 10min sweep 兜底（worlds 起来即 DOWN 投递）。
 * 失败静默，不阻断启动。
 */
@Injectable()
export class CharacterVideoPullClient implements OnModuleInit {
  private readonly logger = new Logger(CharacterVideoPullClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly feed: FeedService,
  ) {}

  onModuleInit(): void {
    // 启动后台跑，不阻塞 bootstrap。
    setTimeout(() => void this.backfillOnce().catch(() => {}), 8_000);
  }

  private async backfillOnce(): Promise<void> {
    if (isSharedWorldMode()) return; // shared 由 cloud sweep 兜底
    const phone = this.config.get<string>('CLOUD_OWNER_PHONE')?.trim();
    const baseUrl = this.config.get<string>('CLOUD_API_BASE_URL')?.trim();
    const token = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    if (!phone || !baseUrl || !token) return;

    let videos: PendingVideo[] = [];
    try {
      const url = new URL(
        `/cloud/internal/character-videos/pending-for-owner?phone=${encodeURIComponent(phone)}`,
        baseUrl,
      ).toString();
      const res = await fetch(url, { headers: { 'X-Service-Token': token } });
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as {
        videos?: PendingVideo[];
      } | null;
      videos = Array.isArray(body?.videos) ? body!.videos : [];
    } catch (err) {
      this.logger.warn(
        `pending-for-owner fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (videos.length === 0) return;

    const delivered: string[] = [];
    for (const v of videos) {
      if (!v.cloudVideoId || !v.sourceCharacterId || !v.mediaUrl) continue;
      try {
        const r = await this.feed.injectCharacterVideoPost({
          cloudVideoId: v.cloudVideoId,
          sourceCharacterId: v.sourceCharacterId,
          text: v.text ?? '',
          title: v.title ?? null,
          mediaUrl: v.mediaUrl,
          coverUrl: v.coverUrl ?? null,
          durationMs: v.durationMs ?? null,
        });
        if (r.injected) delivered.push(v.cloudVideoId);
      } catch {
        /* 单条失败不影响其它 */
      }
    }
    if (delivered.length > 0) {
      this.logger.log(`backfilled ${delivered.length} character video(s) on boot`);
      await this.ackDelivered(baseUrl, token, phone, delivered);
    }
  }

  private async ackDelivered(
    baseUrl: string,
    token: string,
    phone: string,
    cloudVideoIds: string[],
  ): Promise<void> {
    try {
      const url = new URL(
        '/cloud/internal/character-videos/ack-delivered',
        baseUrl,
      ).toString();
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Token': token },
        body: JSON.stringify({ phone, cloudVideoIds }),
      });
    } catch {
      /* ack 失败无妨：cloud sweep 仍会 DOWN 投递，injectCharacterVideoPost 幂等 */
    }
  }
}
// i18n-ignore-end
