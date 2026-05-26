// i18n-ignore-start: AI-generated character speech, not user-facing UI text.
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CharacterEntity } from '../characters/character.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { MessageEntity } from '../chat/message.entity';
import { ChatService } from '../chat/chat.service';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { TenantRepository } from '../tenancy/tenant-scoped.repository';

// 2026-05-21 起：新用户进来只让"我"（self mirror）主动发一条欢迎消息。
// 之前 13 个默认好友里 12 个会错峰用 LLM 生成欢迎，对零基础新用户来说信息过载。
// 其它系统角色（新闻编辑 / 提醒助手 等）即使在默认好友列表里也不再主动发欢迎，
// 等用户主动开口再回。"我" 的欢迎语固定，不走 LLM，避免冷启动模型抽风出
// "你好我是你的内在自我"这种自我介绍。
const SELF_INITIAL_DELAY_MS = 3_000;

const SELF_WELCOME_MESSAGE = '在的。想说什么直接说就好，我都在这。';

@Injectable()
export class InitialMessageService {
  private readonly logger = new Logger(InitialMessageService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    private readonly chatService: ChatService,
  ) {}

  scheduleIfNeeded(ownerId: string, character: CharacterEntity): void {
    if (!ownerId || !character?.id) return;
    // 只有"我"会主动发欢迎；其它系统/默认角色不再主动开口。
    if (character.id !== SELF_CHARACTER_ID) return;

    const key = `${ownerId}:${character.id}`;
    if (this.inFlight.has(key)) return;

    void this.checkAndSchedule(ownerId, character, key);
  }

  private async checkAndSchedule(
    ownerId: string,
    character: CharacterEntity,
    key: string,
  ): Promise<void> {
    try {
      const conversationId = `direct_${character.id}`;
      const existing = await this.conversationRepo.findOne({
        where: { id: conversationId, ownerId },
      });
      if (existing) {
        // scoped：conversationId 形如 direct_<charId> 跨租户共用，裸 count 会把别人会话的
        // 消息也算进来；按当前 owner 限定（LPP 透传）。
        const messageCount = await new TenantRepository(this.messageRepo).count({
          where: { conversationId },
        });
        if (messageCount > 0) return;
      }

      this.inFlight.add(key);

      setTimeout(() => {
        void this.fire(ownerId, character.id, key);
      }, SELF_INITIAL_DELAY_MS).unref?.();
    } catch (error) {
      this.inFlight.delete(key);
      this.logger.warn(
        `scheduleIfNeeded failed for ${ownerId} × ${character.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async fire(
    ownerId: string,
    characterId: string,
    key: string,
  ): Promise<void> {
    try {
      // scoped：setTimeout 回调里 ALS 租户帧仍在（AsyncLocalStorage 跨定时器传递），裸
      // findOneBy({id}) 会读到别的租户的同 id 角色 → afterLoad 读泄漏。按当前 owner 限定。
      const character = await new TenantRepository(this.characterRepo).findOneBy({
        id: characterId,
      });
      if (!character) return;

      const conversationId = `direct_${characterId}`;
      const existingCount = await new TenantRepository(this.messageRepo).count({
        where: { conversationId },
      });
      if (existingCount > 0) return;

      await this.chatService.getOrCreateConversation(characterId);

      const stillEmpty = await new TenantRepository(this.messageRepo).count({
        where: { conversationId },
      });
      if (stillEmpty > 0) return;

      const messageEntity = this.messageRepo.create({
        id: `msg_${Date.now()}_initial_${characterId}`,
        conversationId,
        senderType: 'character',
        senderId: characterId,
        senderName: character.name,
        type: 'text',
        text: SELF_WELCOME_MESSAGE,
      });
      await this.messageRepo.save(messageEntity);

      const conversation = await new TenantRepository(
        this.conversationRepo,
      ).findOneBy({ id: conversationId });
      if (conversation) {
        conversation.lastActivityAt = messageEntity.createdAt ?? new Date();
        await this.conversationRepo.save(conversation);
      }
    } catch (error) {
      this.logger.warn(
        `initial message fire failed for ${ownerId} × ${characterId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.inFlight.delete(key);
    }
  }
}
// i18n-ignore-end
