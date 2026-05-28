import { Injectable, Logger } from '@nestjs/common';
import { WorldOwnerService } from '../auth/world-owner.service';
import { ChatService } from '../chat/chat.service';
import type { GiftAttachment } from '../chat/chat.types';
import { SocialService } from './social.service';

// 送 AI 好友礼物的 world 侧落地：cloud-api 扣库存+记礼物后经内部接口通知此处。
// 这里做「关系侧副作用」：把礼物气泡落进会话（推进 history，下一轮 AI 据此致谢）+ 加亲密度。
// 不在此触发即时 AI 回复，避免阻塞内部 HTTP / 干扰 live :4100 回复编排。
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

@Injectable()
export class GiftWorldService {
  private readonly logger = new Logger(GiftWorldService.name);

  constructor(
    private readonly chat: ChatService,
    private readonly social: SocialService,
    private readonly worldOwner: WorldOwnerService,
  ) {}

  async inboundFromUser(
    input: InboundFromUserInput,
  ): Promise<{ intimacyDelta: number; newIntimacyLevel: number | null }> {
    const owner = await this.worldOwner.getOwnerOrThrow();
    const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
    const delta = giftIntimacyDelta(quantity);
    const senderName = owner.username?.trim() || '你';

    // 1) 礼物气泡落进与该角色的单聊（saveUserAttachmentMessage 会把它推进 conversationHistory，
    //    下一轮角色回复时即可据此致谢——无需在此同步触发 AI 回复）。
    try {
      const conversation = await this.chat.getOrCreateConversation(
        input.characterId,
      );
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

    return { intimacyDelta: delta, newIntimacyLevel: null };
  }
}
