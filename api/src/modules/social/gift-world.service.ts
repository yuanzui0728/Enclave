import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { ChatService } from '../chat/chat.service';
import type { GiftAttachment } from '../chat/chat.types';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';
import { CloudGiftClient } from './cloud-gift.client';
import { FriendshipEntity } from './friendship.entity';
import { SocialService } from './social.service';

// 送 AI 好友礼物的 world 侧落地（cloud-api 扣库存+记礼物后经内部接口通知此处）：
// 关系侧副作用 = 把礼物气泡落进会话（推进 history，下一轮 AI 据此致谢）+ 加亲密度。
// 不在此触发即时 AI 回复，避免阻塞内部 HTTP / 干扰 live :4100 回复编排。
// 反向（AI 好友→用户「惊喜回礼」）：亲密度首次越过里程碑时，AI 送用户一件平价虚拟礼物。
type InboundFromUserInput = {
  giftRecordId: string;
  characterId: string;
  goodsCode: string;
  goodsName: string;
  quantity: number;
  message?: string;
};

// 礼物亲密度增量：每件 +2，单次封顶 +10（与 farm 礼物增量同量级）。
function giftIntimacyDelta(quantity: number): number {
  return Math.min(10, Math.max(2, 2 * Math.max(1, quantity)));
}

// 亲密度首次越过此线 → AI 惊喜回礼一次。
const RECIPROCATE_INTIMACY_MILESTONE = 50;
// AI 回礼固定送这件平价虚拟礼物（seed 商品）；不存在时 cloud-api 拒绝、回礼静默跳过。
const RECIPROCATE_GOODS_CODE = 'gift_coffee';

@Injectable()
export class GiftWorldService {
  private readonly logger = new Logger(GiftWorldService.name);

  constructor(
    private readonly chat: ChatService,
    private readonly social: SocialService,
    private readonly worldOwner: WorldOwnerService,
    private readonly cloudGift: CloudGiftClient,
    @InjectRepository(FriendshipEntity)
    private readonly friendshipRepo: Repository<FriendshipEntity>,
  ) {}

  async inboundFromUser(
    input: InboundFromUserInput,
  ): Promise<{ intimacyDelta: number; newIntimacyLevel: number | null }> {
    const owner = await this.worldOwner.getOwnerOrThrow();
    const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
    const delta = giftIntimacyDelta(quantity);
    const senderName = owner.username?.trim() || '你';
    let characterName = input.characterId;

    // 1) 礼物气泡落进与该角色的单聊（saveUserAttachmentMessage 推进 conversationHistory，
    //    下一轮角色回复即可据此致谢——无需在此同步触发 AI 回复）。
    try {
      const conversation = await this.chat.getOrCreateConversation(
        input.characterId,
      );
      characterName = conversation.title || characterName;
      const attachment: GiftAttachment = {
        kind: 'gift',
        giftRecordId: input.giftRecordId,
        direction: 'outgoing',
        goodsCode: input.goodsCode,
        goodsName: input.goodsName,
        iconUrl: null,
        quantity,
        message: input.message ?? '',
        senderName,
      };
      await this.chat.saveUserAttachmentMessage(
        conversation.id,
        owner.id,
        senderName,
        attachment,
        `送出礼物：${input.goodsName}${quantity > 1 ? ` ×${quantity}` : ''}`,
      );
    } catch (err) {
      // 落气泡失败不阻断亲密度增量（礼物真值已在 cloud-api 落库）。
      this.logger.warn(
        `礼物气泡落库失败 character=${input.characterId}: ${(err as Error).message}`,
      );
    }

    // 2) 加亲密度（updateIntimacy 自带 owner 解析 + 租户隔离）。
    await this.social.updateIntimacy(input.characterId, delta);

    // 3) 读新亲密度；首次越过里程碑 → AI 惊喜回礼（best-effort，不阻断）。
    let newLevel: number | null = null;
    try {
      const friendship = await new TenantRepository(
        this.friendshipRepo,
      ).findOneBy({ ownerId: owner.id, characterId: input.characterId });
      newLevel = friendship?.intimacyLevel ?? null;
    } catch {
      newLevel = null;
    }
    if (
      newLevel !== null &&
      newLevel >= RECIPROCATE_INTIMACY_MILESTONE &&
      newLevel - delta < RECIPROCATE_INTIMACY_MILESTONE
    ) {
      void this.issueGiftFromCharacter({
        characterId: input.characterId,
        characterName,
        goodsCode: RECIPROCATE_GOODS_CODE,
        quantity: 1,
        message: '谢谢你一直的陪伴，这个送给你～',
      }).catch(() => undefined);
    }

    return { intimacyDelta: delta, newIntimacyLevel: newLevel };
  }

  // AI 好友送用户礼物：cloud-api 授予库存+记 character_to_user → 落一条 incoming 主动礼物气泡。
  // best-effort：cloud-api 失败则不落气泡（库存/礼物未授予，保持一致）。
  async issueGiftFromCharacter(input: {
    characterId: string;
    characterName: string;
    goodsCode: string;
    quantity: number;
    message?: string;
  }): Promise<void> {
    const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
    const granted = await this.cloudGift.issueToUser({
      characterId: input.characterId,
      characterName: input.characterName,
      goodsCode: input.goodsCode,
      quantity,
      message: input.message,
      idempotencyKey: `gift_out:${randomUUID()}`,
    });
    if (!granted) return;

    try {
      const conversation = await this.chat.getOrCreateConversation(
        input.characterId,
      );
      const attachment: GiftAttachment = {
        kind: 'gift',
        giftRecordId: granted.id,
        direction: 'incoming',
        goodsCode: granted.goodsCode,
        goodsName: granted.name,
        iconUrl: granted.iconUrl,
        quantity: granted.quantity,
        message: input.message ?? '',
        senderName: input.characterName,
      };
      await this.chat.saveProactiveAttachmentMessage(
        conversation.id,
        input.characterId,
        input.characterName,
        attachment,
        `送你一份礼物：${granted.name}`,
      );
    } catch (err) {
      this.logger.warn(
        `AI 回礼气泡落库失败 character=${input.characterId}: ${(err as Error).message}`,
      );
    }
  }
}
