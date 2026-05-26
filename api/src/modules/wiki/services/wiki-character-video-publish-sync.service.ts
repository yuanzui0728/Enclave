// i18n-ignore-start: backend service, logs/errors are operational (not user-facing).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveReadableMomentMediaPath } from '../../moments/moment-media.storage';
import type { CharacterVideoEntity } from '../entities/character-video.entity';

export interface CharacterVideoPublishResult {
  ok: boolean;
  cloudVideoId?: string;
}

/**
 * wiki 进程把一条 ready 的私有角色视频推到 cloud-api 中心存储（multipart：
 * 视频/封面文件 + 元数据），cloud-api 落盘后扇出到所有导入了该角色的 world 视频号。
 * 复用 WikiGamePublishSyncService 同款：CLOUD_API_BASE_URL + X-Service-Token + 重试。
 * 失败不抛（调用方据 ok 置 publishState=pending 留待重试），不阻断生成完成。
 */
@Injectable()
export class WikiCharacterVideoPublishSyncService {
  private readonly logger = new Logger(WikiCharacterVideoPublishSyncService.name);

  constructor(private readonly config: ConfigService) {}

  async publish(video: CharacterVideoEntity): Promise<CharacterVideoPublishResult> {
    const baseUrl = this.config.get<string>('CLOUD_API_BASE_URL')?.trim();
    const token = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    if (!baseUrl || !token) {
      this.logger.warn(
        'CLOUD_API_BASE_URL / CLOUD_SERVICE_TOKEN 未配置，跳过私有角色视频上推',
      );
      return { ok: false };
    }
    if (!video.videoFileName) {
      this.logger.warn(`视频 ${video.id} 缺 videoFileName，无法上推`);
      return { ok: false };
    }

    let videoBuffer: Buffer;
    try {
      videoBuffer = await readFile(resolveReadableMomentMediaPath(video.videoFileName));
    } catch (err) {
      this.logger.warn(
        `读取视频文件失败 ${video.videoFileName}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { ok: false };
    }

    let coverBuffer: Buffer | null = null;
    const coverFileName = extractFileNameFromUrl(video.coverUrl);
    if (coverFileName) {
      try {
        coverBuffer = await readFile(resolveReadableMomentMediaPath(coverFileName));
      } catch {
        coverBuffer = null; // 封面缺失可降级，不阻断
      }
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/cloud/internal/character-videos/publish`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const form = new FormData();
        form.append('sourceCharacterVideoId', video.id);
        form.append('sourceCharacterId', video.privateCharacterId);
        form.append('characterName', video.characterName ?? '');
        form.append('characterAvatar', video.characterAvatar ?? '');
        form.append('text', video.prompt ?? '');
        form.append('ownerWikiUserId', video.ownerWikiUserId);
        if (video.durationMs != null) {
          form.append('durationMs', String(video.durationMs));
        }
        form.append(
          'video',
          new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' }),
          path.basename(video.videoFileName),
        );
        if (coverBuffer && coverFileName) {
          form.append(
            'cover',
            new Blob([new Uint8Array(coverBuffer)], { type: 'image/jpeg' }),
            path.basename(coverFileName),
          );
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'X-Service-Token': token },
          body: form,
        });
        if (res.ok) {
          const body = (await res.json().catch(() => null)) as {
            cloudVideoId?: string;
          } | null;
          return { ok: true, cloudVideoId: body?.cloudVideoId };
        }
        this.logger.warn(
          `私有角色视频上推 HTTP ${res.status}（attempt ${attempt}）video=${video.id}`,
        );
      } catch (err) {
        this.logger.warn(
          `私有角色视频上推失败（attempt ${attempt}）: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }
    return { ok: false };
  }
}

function extractFileNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.split('?')[0];
  const seg = trimmed.split('/').pop();
  return seg && seg.length > 0 ? seg : null;
}
// i18n-ignore-end
