// i18n-ignore-start: backend service, logs are operational (not user-facing UI).
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { CharactersService } from '../characters/characters.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { MinimaxClient } from '../minimax/minimax.client';
import { MinimaxAssetStorage } from '../minimax/minimax-asset.storage';
import { MinimaxQuotaService } from '../minimax/minimax-quota.service';
import {
  type XhsPromoCharacterContext,
  buildCopyMessages,
  buildImagePrompt,
  parseCopyOptions,
} from './xhs-promo.prompt';

export interface XhsPromoCopyResult {
  options: string[];
}

export interface XhsPromoImageResult {
  images: Array<{ url: string; fileName: string }>;
  quotaExhausted?: boolean;
}

@Injectable()
export class XhsPromoService {
  private readonly logger = new Logger(XhsPromoService.name);

  constructor(
    private readonly minimaxClient: MinimaxClient,
    private readonly minimaxQuota: MinimaxQuotaService,
    private readonly minimaxStorage: MinimaxAssetStorage,
    private readonly characters: CharactersService,
    private readonly worldOwner: WorldOwnerService,
  ) {}

  async generateCopy(input: {
    count?: number;
    angle?: string;
  }): Promise<XhsPromoCopyResult> {
    if (!this.minimaxClient.isConfigured()) {
      throw new AppError('XHS_PROMO_UNAVAILABLE', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '文案生成暂时不可用，请稍后再试。',
      });
    }

    const count = Math.min(Math.max(input.count ?? 3, 1), 3);
    const characters = await this.collectOwnerCharacterContext();
    const owner = await this.worldOwner.getOwnerOrThrow();

    const messages = buildCopyMessages({
      username: owner.username ?? '',
      characters,
      count,
      angle: input.angle?.trim() || undefined,
    });

    // 用 M2.7 配额桶记账（与朋友圈歌词文本同桶）；reserve 失败说明文本额度耗尽。
    const reserved = await this.minimaxQuota.tryReserve('MiniMax-M2.7');
    if (!reserved) {
      throw new AppError('XHS_PROMO_COPY_QUOTA', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '今日文案生成额度已用完，请稍后再试，或自己手写文案。',
      });
    }

    // 只有「调用本身失败（未产出）」才 release；调用成功即已计费 → 一律 commit，
    // 之后的解析失败也不能 release（否则 commit+release 双动作会让配额计数失真，
    // 见 minimax billed-empty 教训）。所以 commit/release 不放在同一个 try/catch。
    let content: string;
    try {
      content = (
        await this.minimaxClient.chatCompletion({
          model: 'MiniMax-M2.7',
          messages,
          temperature: 1.0,
          maxTokens: 2400,
        })
      ).content;
    } catch (err) {
      await this.minimaxQuota.release('MiniMax-M2.7');
      this.logger.warn(`xhs promo copy gen failed: ${(err as Error)?.message}`);
      throw new AppError('XHS_PROMO_COPY_FAILED', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '文案生成暂时不可用，请稍后再试。',
      });
    }
    await this.minimaxQuota.commit('MiniMax-M2.7');
    const options = parseCopyOptions(content, count);
    if (!options.length) {
      throw new AppError('XHS_PROMO_COPY_FAILED', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '文案生成失败，请重试。',
      });
    }
    return { options };
  }

  async generateImage(input: {
    promptHint?: string;
  }): Promise<XhsPromoImageResult> {
    if (!this.minimaxClient.isConfigured()) {
      return { images: [], quotaExhausted: true };
    }
    // 配图与朋友圈配图共用 image-01 单 key 当日总额，永远只出 1 张，不批量。
    const reserved = await this.minimaxQuota.tryReserve('image-01');
    if (!reserved) {
      return { images: [], quotaExhausted: true };
    }
    try {
      const image = await this.minimaxClient.generateImage({
        model: 'image-01',
        prompt: buildImagePrompt(input.promptHint),
        aspectRatio: '3:4',
      });
      const persisted = await this.minimaxStorage.persist({
        buffer: image.buffer,
        mimeType: image.mimeType,
        kind: 'image',
        suffix: '-xhs',
      });
      await this.minimaxQuota.commit('image-01');
      return {
        images: [{ url: persisted.publicUrl, fileName: persisted.fileName }],
      };
    } catch (err) {
      await this.minimaxQuota.release('image-01');
      this.logger.warn(`xhs promo image gen failed: ${(err as Error)?.message}`);
      throw new AppError('XHS_PROMO_IMAGE_FAILED', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '配图生成暂时不可用，可直接用文案发布。',
      });
    }
  }

  // 取该租户自己最多 3 个角色作为文案的真实素材（过滤空名）。
  private async collectOwnerCharacterContext(): Promise<
    XhsPromoCharacterContext[]
  > {
    try {
      const owner = await this.worldOwner.getOwnerOrThrow();
      const all = await this.characters.findAllVisibleToOwner(owner.id);
      return all
        .filter((c) => (c.name ?? '').trim().length > 0)
        .slice(0, 3)
        .map((c) => ({
          name: c.name,
          relationship: c.relationship ?? '',
          personality: c.personality ?? undefined,
        }));
    } catch (err) {
      this.logger.debug(
        `collect owner characters failed (fallback to generic): ${(err as Error)?.message}`,
      );
      return [];
    }
  }
}
// i18n-ignore-end
