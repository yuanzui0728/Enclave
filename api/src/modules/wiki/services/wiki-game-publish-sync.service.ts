// i18n-ignore-start: backend service, logs/errors are operational (not user-facing).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { WikiGameArtifact } from '../wiki-game.types';

export interface GamePublishUpstreamPayload {
  gameId: string;
  name: string;
  slogan: string;
  description: string;
  category: string;
  tone: string;
  tags: string[];
  authorWikiUserId: string;
  authorDisplayName: string;
  sourceWikiGameId: string;
  clonedFromGameId?: string | null;
}

/**
 * 把 wiki 已发布游戏上推到 cloud-api 全局板块（App 读取面），复用 cyber-avatar
 * matchmaking-sync 同款：CLOUD_API_BASE_URL + X-Service-Token + 重试。
 * 失败不抛（调用方据返回值置 syncState=pending 留待重试），不阻断用户发布。
 */
@Injectable()
export class WikiGamePublishSyncService {
  private readonly logger = new Logger(WikiGamePublishSyncService.name);

  constructor(private readonly config: ConfigService) {}

  static sha256(s: string): string {
    return createHash('sha256').update(s, 'utf8').digest('hex');
  }

  async push(
    meta: GamePublishUpstreamPayload,
    artifact: WikiGameArtifact,
  ): Promise<boolean> {
    const baseUrl = this.config.get<string>('CLOUD_API_BASE_URL')?.trim();
    const token = this.config.get<string>('CLOUD_SERVICE_TOKEN')?.trim();
    if (!baseUrl || !token) {
      this.logger.warn(
        'CLOUD_API_BASE_URL / CLOUD_SERVICE_TOKEN 未配置，跳过游戏板块上推',
      );
      return false;
    }
    const body = {
      ...meta,
      publisherKind: 'wiki_user',
      productionKind: 'ai_generated',
      runtimeMode: 'embedded_web',
      reviewStatus: 'approved',
      visibilityScope: 'published',
      artifact: {
        html: artifact.html,
        htmlSha256: WikiGamePublishSyncService.sha256(artifact.html),
        htmlByteSize: Buffer.byteLength(artifact.html, 'utf8'),
        spec: artifact.spec,
        generatorModel: artifact.meta.generatedModel ?? null,
      },
    };
    const url = `${baseUrl.replace(/\/+$/, '')}/cloud/internal/games/publish`;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Token': token,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) return true;
        this.logger.warn(
          `游戏板块上推 HTTP ${res.status}（attempt ${attempt}）gameId=${meta.gameId}`,
        );
      } catch (err) {
        this.logger.warn(
          `游戏板块上推失败（attempt ${attempt}）: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }
    return false;
  }
}
// i18n-ignore-end
