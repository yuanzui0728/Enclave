// i18n-ignore-start: 后端服务，日志为运维文案，非前端可本地化 UI。
import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CloudWalletClient } from '../billing/cloud-wallet.client';
import { MinimaxClient } from '../minimax/minimax.client';
import { MinimaxAssetStorage } from '../minimax/minimax-asset.storage';
import { MinimaxQuotaService } from '../minimax/minimax-quota.service';
import { CyberAvatarService } from './cyber-avatar.service';
import { buildCyberAvatarPortraitPrompt } from './cyber-avatar-portrait.prompt';

// 生成「赛博分身专属 AI 立绘」：拿 owner 资料 + 分身性格内核拼 prompt → MiniMax image-01
// 出图（3:4 竖版）→ owner 隔离存盘（复用 moments 媒体存储 + serve）→ 写回 profile 列。
// owner 由请求级 TenantContext 决定（getOwnerOrThrow），天然按 ownerId 隔离。
// 计费：首张立绘免费（portraitImageUrl 为空时），重新生成走钱包 image.generate 按量扣费。
@Injectable()
export class CyberAvatarPortraitService {
  private readonly logger = new Logger(CyberAvatarPortraitService.name);

  constructor(
    private readonly cyberAvatar: CyberAvatarService,
    private readonly worldOwner: WorldOwnerService,
    private readonly minimaxClient: MinimaxClient,
    private readonly minimaxQuota: MinimaxQuotaService,
    private readonly minimaxStorage: MinimaxAssetStorage,
    private readonly wallet: CloudWalletClient,
  ) {}

  // 同步生成并落地一张立绘；成功后由控制器返回最新 self profile（含 portraitImageUrl）。
  async generate(): Promise<{ portraitImageUrl: string }> {
    if (!this.minimaxClient.isConfigured()) {
      throw new AppError('CYBER_AVATAR_PORTRAIT_UNAVAILABLE', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '分身立绘生成暂时不可用，请稍后再试。',
      });
    }

    const owner = await this.worldOwner.getOwnerOrThrow();
    const profile = await this.cyberAvatar.getProfile();
    const prompt = buildCyberAvatarPortraitPrompt({
      gender: owner.gender,
      age: owner.age,
      occupation: owner.occupation,
      region: owner.region,
      interests: owner.interests,
      identitySummary: profile.stableCore?.identitySummary ?? null,
    });

    // 与朋友圈/小红书配图共用 image-01 当日总额；reserve 失败＝今日出图额度耗尽。
    const reserved = await this.minimaxQuota.tryReserve('image-01');
    if (!reserved) {
      throw new AppError('CYBER_AVATAR_PORTRAIT_QUOTA', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '今日分身立绘生成额度已用完，请明天再来。',
      });
    }

    // 首张免费；已有立绘再生成属「特殊高消耗行为」，先扣钱包（成本×2），失败再退。
    // idempotencyKey 每次唯一：只用于把本次 charge↔refund 配对（生成失败补偿），无跨请求去重语义。
    const isFirst = !profile.portraitImageUrl;
    const idempotencyKey = `cyber-avatar-portrait:${randomUUID()}`;
    if (!isFirst) {
      try {
        await this.wallet.charge('image.generate', idempotencyKey);
      } catch (err) {
        await this.minimaxQuota.release('image-01');
        throw err;
      }
    }

    try {
      const image = await this.minimaxClient.generateImage({
        model: 'image-01',
        prompt,
        aspectRatio: '3:4',
      });
      const persisted = await this.minimaxStorage.persist({
        buffer: image.buffer,
        mimeType: image.mimeType,
        kind: 'image',
        suffix: '-cyber-avatar',
      });
      // 调用成功即已计费 → commit 配额；之后的落库失败也不能 release（避免计数失真）。
      await this.minimaxQuota.commit('image-01');
      await this.cyberAvatar.persistPortrait(
        owner.id,
        persisted.publicUrl,
        prompt,
      );
      return { portraitImageUrl: persisted.publicUrl };
    } catch (err) {
      await this.minimaxQuota.release('image-01');
      // 扣了款但没产出（仅重生成路径才扣过）→ 退回，避免为失败的生成收费。
      if (!isFirst) {
        await this.wallet.refund(idempotencyKey);
      }
      this.logger.warn(
        `cyber avatar portrait gen failed: ${(err as Error)?.message}`,
      );
      throw new AppError('CYBER_AVATAR_PORTRAIT_FAILED', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '分身立绘生成失败，请稍后再试。',
      });
    }
  }
}
// i18n-ignore-end
