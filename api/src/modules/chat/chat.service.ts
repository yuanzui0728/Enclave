import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, MoreThan, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { ChatMessage } from '../ai/ai.types';
import { WorldOwnerService } from '../auth/world-owner.service';
import { CharactersService } from '../characters/characters.service';
import { NarrativeService } from '../narrative/narrative.service';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';
import { Conversation, Message } from './chat.types';

@Injectable()
export class ChatService {
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly narrativeService: NarrativeService,
    private readonly worldOwnerService: WorldOwnerService,
    @InjectRepository(ConversationEntity)
    private convRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private msgRepo: Repository<MessageEntity>,
  ) {}

  async getOrCreateConversation(
    characterId: string,
    conversationId?: string,
  ): Promise<Conversation> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const convId = conversationId ?? `direct_${characterId}`;

    let entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) {
      const char = await this.characters.findById(characterId);
      entity = this.convRepo.create({
        id: convId,
        userId: owner.id,
        type: 'direct',
        title: char?.name ?? characterId,
        participants: [characterId],
        isPinned: false,
        isHidden: false,
        lastActivityAt: new Date(),
      });
      entity = await this.convRepo.save(entity);
      this.conversationHistory.set(convId, []);
    } else if (entity.isHidden) {
      entity = await this.convRepo.save({
        ...entity,
        isHidden: false,
        hiddenAt: null,
      });
    }

    return this._entityToConversation(entity);
  }

  async getConversation(convId: string): Promise<Conversation | undefined> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    return entity ? this._entityToConversation(entity) : undefined;
  }

  async getConversations(): Promise<(Conversation & { lastMessage?: Message; unreadCount: number })[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const convs = await this.convRepo.find({
      where: { userId: owner.id, isHidden: false },
    });

    const result: (Conversation & { lastMessage?: Message; unreadCount: number })[] = [];
    for (const conv of convs) {
      const cutoff = this.getVisibleMessageCutoff(conv);
      const lastMsgEntity = await this.msgRepo.findOne({
        where: this.buildMessageWhere(conv.id, cutoff),
        order: { createdAt: 'DESC' },
      });
      const lastMessage = lastMsgEntity ? this._entityToMessage(lastMsgEntity) : undefined;

      const unreadCutoff = this.getUnreadCutoff(conv);
      const unreadCount = await this.msgRepo.count({
        where: this.buildMessageWhere(conv.id, unreadCutoff, {
          senderType: 'character',
        }),
      });

      result.push({ ...this._entityToConversation(conv), lastMessage, unreadCount });
    }

    result.sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return left.isPinned ? -1 : 1;
      }

      const pinnedDelta = this.getSortableTimestamp(right.pinnedAt) - this.getSortableTimestamp(left.pinnedAt);
      if (pinnedDelta !== 0) {
        return pinnedDelta;
      }

      return this.getSortableTimestamp(right.lastActivityAt) - this.getSortableTimestamp(left.lastActivityAt);
    });

    return result;
  }

  async markConversationRead(convId: string): Promise<void> {
    await this.convRepo.update({ id: convId }, { lastReadAt: new Date() });
  }

  async setConversationPinned(convId: string, pinned: boolean): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const updated = await this.convRepo.save({
      ...entity,
      isPinned: pinned,
      pinnedAt: pinned ? new Date() : null,
    });

    return this._entityToConversation(updated);
  }

  async hideConversation(convId: string): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const updated = await this.convRepo.save({
      ...entity,
      isHidden: true,
      hiddenAt: new Date(),
    });

    return this._entityToConversation(updated);
  }

  async clearConversationHistory(convId: string): Promise<Conversation> {
    const entity = await this.requireOwnedConversation(convId);
    const now = new Date();
    const updated = await this.convRepo.save({
      ...entity,
      lastClearedAt: now,
      lastReadAt: now,
    });

    this.conversationHistory.set(convId, []);
    return this._entityToConversation(updated);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const conversation = await this.convRepo.findOneBy({ id: conversationId });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const entities = await this.msgRepo.find({
      where: this.buildMessageWhere(conversationId, this.getVisibleMessageCutoff(conversation)),
      order: { createdAt: 'ASC' },
    });

    return entities.map((entity) => this._entityToMessage(entity));
  }

  async getCharacterActivity(charId: string): Promise<string | undefined> {
    const char = await this.characters.findById(charId);
    return char?.currentActivity;
  }

  async saveProactiveMessage(
    conversationId: string,
    characterId: string,
    characterName: string,
    text: string,
  ): Promise<Message> {
    const entity = await this.convRepo.findOneBy({ id: conversationId });
    if (!entity) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const messageEntity = this.msgRepo.create({
      id: `msg_${Date.now()}_proactive`,
      conversationId,
      senderType: 'character',
      senderId: characterId,
      senderName: characterName,
      type: 'proactive',
      text,
    });

    await this.msgRepo.save(messageEntity);
    await this.touchConversationActivity(entity, messageEntity.createdAt ?? new Date());

    const history = await this.ensureConversationHistory(entity);
    history.push({ role: 'assistant', content: text, characterId });
    this.conversationHistory.set(conversationId, history);

    return this._entityToMessage(messageEntity);
  }

  async saveSystemMessage(conversationId: string, text: string): Promise<Message> {
    const entity = await this.convRepo.findOneBy({ id: conversationId });
    if (!entity) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const messageEntity = this.msgRepo.create({
      id: `msg_${Date.now()}_sys`,
      conversationId,
      senderType: 'system',
      senderId: 'system',
      senderName: 'system',
      type: 'system',
      text,
    });

    await this.msgRepo.save(messageEntity);
    await this.touchConversationActivity(entity, messageEntity.createdAt ?? new Date());
    return this._entityToMessage(messageEntity);
  }

  async sendMessage(convId: string, text: string): Promise<Message[]> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const aiKeyOverride = (await this.worldOwnerService.getOwnerAiConfig()) ?? undefined;

    const userMsgEntity = this.msgRepo.create({
      id: `msg_${Date.now()}`,
      conversationId: convId,
      senderType: 'user',
      senderId: owner.id,
      senderName: owner.username?.trim() || 'You',
      type: 'text',
      text,
    });
    await this.msgRepo.save(userMsgEntity);
    await this.touchConversationActivity(entity, userMsgEntity.createdAt ?? new Date());

    const userMsg = this._entityToMessage(userMsgEntity);
    const history = await this.ensureConversationHistory(entity);
    history.push({ role: 'user', content: text });

    const results: Message[] = [userMsg];

    if (entity.type === 'direct') {
      const charId = entity.participants[0];
      const profile = await this.characters.getProfile(charId);
      if (!profile) {
        throw new Error(`Profile not found for ${charId}`);
      }

      const intent = await this.ai.classifyIntent(text, profile.name, profile.expertDomains);

      if (intent.needsGroupChat && intent.requiredDomains.length > 0) {
        const ownerConversations = await this.convRepo.find({ where: { userId: owner.id } });
        const ownerFriendIds = new Set(
          ownerConversations.flatMap((conversation) => conversation.participants).filter((id) => id !== charId),
        );

        const invitedChars = (await this.characters.findByDomains(intent.requiredDomains))
          .filter((character) => character.id !== charId && ownerFriendIds.has(character.id))
          .slice(0, 2);

        if (invitedChars.length > 0) {
          entity.type = 'group';
          entity.title = 'Temporary group chat';
          invitedChars.forEach((character) => {
            if (!entity.participants.includes(character.id)) {
              entity.participants.push(character.id);
            }
          });
          await this.convRepo.save(entity);

          const invitedNames = invitedChars.map((character) => character.name).join(', ');
          const coordPrompt = `Explain that you want to invite ${invitedNames} into this conversation to help with the user's question. Keep it under 30 words.`;
          const coordReply = await this.ai.generateReply({
            profile,
            conversationHistory: history,
            userMessage: coordPrompt,
            aiKeyOverride,
          });
          const coordEntity = this.msgRepo.create({
            id: `msg_${Date.now()}_coord`,
            conversationId: convId,
            senderType: 'character',
            senderId: charId,
            senderName: profile.name,
            type: 'text',
            text: coordReply.text,
          });
          await this.msgRepo.save(coordEntity);
          await this.touchConversationActivity(entity, coordEntity.createdAt ?? new Date());
          history.push({ role: 'assistant', content: coordReply.text, characterId: charId });
          results.push(this._entityToMessage(coordEntity));

          for (const invited of invitedChars) {
            const sysEntity = this.msgRepo.create({
              id: `msg_${Date.now()}_sys_${invited.id}`,
              conversationId: convId,
              senderType: 'system',
              senderId: 'system',
              senderName: 'system',
              type: 'system',
              text: `${profile.name} invited ${invited.name} into the conversation.`,
            });
            await this.msgRepo.save(sysEntity);
            await this.touchConversationActivity(entity, sysEntity.createdAt ?? new Date());
            results.push(this._entityToMessage(sysEntity));
          }

          for (const invited of invitedChars) {
            const invitedProfile = await this.characters.getProfile(invited.id);
            if (!invitedProfile) {
              continue;
            }

            const reply = await this.ai.generateReply({
              profile: invitedProfile,
              conversationHistory: history,
              userMessage: text,
              isGroupChat: true,
              aiKeyOverride,
            });
            const aiEntity = this.msgRepo.create({
              id: `msg_${Date.now()}_${invited.id}`,
              conversationId: convId,
              senderType: 'character',
              senderId: invited.id,
              senderName: invited.name,
              type: 'text',
              text: reply.text,
            });
            await this.msgRepo.save(aiEntity);
            await this.touchConversationActivity(entity, aiEntity.createdAt ?? new Date());
            history.push({ role: 'assistant', content: reply.text, characterId: invited.id });
            results.push(this._entityToMessage(aiEntity));
          }

          await this.syncNarrativeArc(entity);
          this.conversationHistory.set(convId, history);
          return results;
        }
      }

      const charEntity = await this.characters.findById(charId);
      const lastMsg = await this.msgRepo.findOne({
        where: {
          conversationId: convId,
          senderType: 'user',
        },
        order: { createdAt: 'DESC' },
      });
      const chatContext = {
        currentActivity: charEntity?.currentActivity,
        lastChatAt: lastMsg?.createdAt,
      };
      const reply = await this.ai.generateReply({
        profile,
        conversationHistory: history,
        userMessage: text,
        chatContext,
        aiKeyOverride,
      });
      const aiEntity = this.msgRepo.create({
        id: `msg_${Date.now()}_ai`,
        conversationId: convId,
        senderType: 'character',
        senderId: charId,
        senderName: profile.name,
        type: 'text',
        text: reply.text,
      });
      await this.msgRepo.save(aiEntity);
      await this.touchConversationActivity(entity, aiEntity.createdAt ?? new Date());
      history.push({ role: 'assistant', content: reply.text, characterId: charId });
      this.conversationHistory.set(convId, history);
      results.push(this._entityToMessage(aiEntity));
    } else {
      for (const charId of entity.participants) {
        const profile = await this.characters.getProfile(charId);
        if (!profile) {
          continue;
        }

        const reply = await this.ai.generateReply({
          profile,
          conversationHistory: history,
          userMessage: text,
          isGroupChat: true,
          aiKeyOverride,
        });
        const aiEntity = this.msgRepo.create({
          id: `msg_${Date.now()}_${charId}`,
          conversationId: convId,
          senderType: 'character',
          senderId: charId,
          senderName: profile.name,
          type: 'text',
          text: reply.text,
        });
        await this.msgRepo.save(aiEntity);
        await this.touchConversationActivity(entity, aiEntity.createdAt ?? new Date());
        history.push({ role: 'assistant', content: reply.text, characterId: charId });
        results.push(this._entityToMessage(aiEntity));
      }

      this.conversationHistory.set(convId, history);
    }

    if (history.length % 10 === 0 && history.length > 0) {
      const primaryCharId = entity.participants[0];
      const char = await this.characters.findById(primaryCharId);
      if (char) {
        const newMemory = await this.ai.compressMemory(history, char.profile);
        if (!char.profile.memory) {
          char.profile.memory = {
            coreMemory: char.profile.memorySummary ?? '',
            recentSummary: newMemory,
            forgettingCurve: 70,
          };
        } else {
          char.profile.memory.recentSummary = newMemory;
        }
        await this.characters.upsert(char);
      }
    }

    await this.syncNarrativeArc(entity);
    return results;
  }

  private async syncNarrativeArc(
    conversation: ConversationEntity,
  ): Promise<void> {
    const primaryCharacterId = conversation.participants[0];
    if (!primaryCharacterId) {
      return;
    }

    const messageCount = await this.msgRepo.count({
      where: this.buildMessageWhere(
        conversation.id,
        this.getVisibleMessageCutoff(conversation),
      ),
    });

    if (messageCount < 4) {
      return;
    }

    const primaryCharacter = await this.characters.findById(primaryCharacterId);
    await this.narrativeService.recordConversationTurn({
      characterId: primaryCharacterId,
      characterName: primaryCharacter?.name,
      messageCount,
    });
  }

  private async ensureConversationHistory(conversation: ConversationEntity): Promise<ChatMessage[]> {
    const existing = this.conversationHistory.get(conversation.id);
    if (existing) {
      return existing;
    }

    const allMsgs = await this.msgRepo.find({
      where: this.buildMessageWhere(
        conversation.id,
        this.getVisibleMessageCutoff(conversation),
      ),
      order: { createdAt: 'ASC' },
    });
    const rebuiltHistory = allMsgs.map((message) => ({
      role: message.senderType === 'user' ? 'user' : 'assistant',
      content: message.text,
      characterId: message.senderType === 'character' ? message.senderId : undefined,
    }) satisfies ChatMessage);

    this.conversationHistory.set(conversation.id, rebuiltHistory);
    return rebuiltHistory;
  }

  private async requireOwnedConversation(convId: string): Promise<ConversationEntity> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const entity = await this.convRepo.findOneBy({ id: convId, userId: owner.id });
    if (!entity) {
      throw new NotFoundException(`Conversation ${convId} not found`);
    }

    return entity;
  }

  private buildMessageWhere(
    conversationId: string,
    cutoff?: Date,
    extra: Partial<FindOptionsWhere<MessageEntity>> = {},
  ): FindOptionsWhere<MessageEntity> {
    return {
      conversationId,
      ...extra,
      ...(cutoff ? { createdAt: MoreThan(cutoff) } : {}),
    };
  }

  private getVisibleMessageCutoff(conversation: ConversationEntity): Date | undefined {
    return conversation.lastClearedAt ? new Date(conversation.lastClearedAt) : undefined;
  }

  private getUnreadCutoff(conversation: ConversationEntity): Date | undefined {
    const timestamps = [conversation.lastReadAt, conversation.lastClearedAt]
      .filter((value): value is Date => Boolean(value))
      .map((value) => new Date(value).getTime());

    if (timestamps.length === 0) {
      return undefined;
    }

    return new Date(Math.max(...timestamps));
  }

  private getSortableTimestamp(value?: Date): number {
    if (!value) {
      return 0;
    }

    return new Date(value).getTime();
  }

  private async touchConversationActivity(conversation: ConversationEntity, at: Date) {
    conversation.lastActivityAt = at;
    if (conversation.isHidden) {
      conversation.isHidden = false;
      conversation.hiddenAt = null;
    }
    await this.convRepo.save(conversation);
  }

  private _entityToConversation(entity: ConversationEntity): Conversation {
    return {
      id: entity.id,
      type: entity.type as 'direct' | 'group',
      title: entity.title,
      participants: entity.participants,
      messages: [],
      isPinned: entity.isPinned ?? false,
      pinnedAt: entity.pinnedAt ?? undefined,
      lastReadAt: entity.lastReadAt ?? undefined,
      lastClearedAt: entity.lastClearedAt ?? undefined,
      lastActivityAt: entity.lastActivityAt ?? entity.updatedAt ?? entity.createdAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private _entityToMessage(entity: MessageEntity): Message {
    return {
      id: entity.id,
      conversationId: entity.conversationId,
      senderType: entity.senderType as 'user' | 'character' | 'system',
      senderId: entity.senderId,
      senderName: entity.senderName,
      type: entity.type as 'text' | 'system' | 'proactive',
      text: entity.text,
      createdAt: entity.createdAt,
    };
  }
}
