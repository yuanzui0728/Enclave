import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';
import { ChatMessage } from '../ai/ai.types';
import { Conversation, Message } from './chat.types';
import { ConversationEntity } from './conversation.entity';
import { MessageEntity } from './message.entity';
import { NarrativeService } from '../narrative/narrative.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  // In-memory AI context (not persisted — reconstructed on demand)
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
    private readonly narrativeService: NarrativeService,
    @InjectRepository(ConversationEntity)
    private convRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private msgRepo: Repository<MessageEntity>,
  ) {}

  async getOrCreateConversation(userId: string, characterId: string, conversationId?: string): Promise<Conversation> {
    const convId = conversationId ?? `${userId}_${characterId}`;

    let entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) {
      const char = await this.characters.findById(characterId);
      entity = this.convRepo.create({
        id: convId,
        userId,
        type: 'direct',
        title: char?.name ?? characterId,
        participants: [characterId],
      });
      await this.convRepo.save(entity);
      this.conversationHistory.set(convId, []);
    }

    return this._entityToConversation(entity);
  }

  async getConversation(convId: string): Promise<Conversation | undefined> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    return entity ? this._entityToConversation(entity) : undefined;
  }

  async getConversationsByUser(userId: string): Promise<(Conversation & { lastMessage?: Message; unreadCount: number })[]> {
    const convs = await this.convRepo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
    const result: (Conversation & { lastMessage?: Message; unreadCount: number })[] = [];
    for (const conv of convs) {
      const lastMsgEntity = await this.msgRepo.findOne({
        where: { conversationId: conv.id },
        order: { createdAt: 'DESC' },
      });
      const lastMessage = lastMsgEntity ? this._entityToMessage(lastMsgEntity) : undefined;

      // Count unread: AI messages after lastReadAt
      let unreadCount = 0;
      if (conv.lastReadAt) {
        unreadCount = await this.msgRepo.count({
          where: {
            conversationId: conv.id,
            senderType: 'character',
            createdAt: require('typeorm').MoreThan(conv.lastReadAt),
          },
        });
      } else {
        unreadCount = await this.msgRepo.count({
          where: { conversationId: conv.id, senderType: 'character' },
        });
      }

      result.push({ ...this._entityToConversation(conv), lastMessage, unreadCount });
    }
    return result;
  }

  async markConversationRead(convId: string): Promise<void> {
    await this.convRepo.update({ id: convId }, { lastReadAt: new Date() });
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    const entities = await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return entities.map(this._entityToMessage);
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
    await this.convRepo.update({ id: conversationId }, { updatedAt: new Date() });
    return this._entityToMessage(messageEntity);
  }

  async sendMessage(convId: string, userId: string, text: string): Promise<Message[]> {
    const entity = await this.convRepo.findOneBy({ id: convId });
    if (!entity) throw new Error(`Conversation ${convId} not found`);

    // Save user message to DB
    const userMsgEntity = this.msgRepo.create({
      id: `msg_${Date.now()}`,
      conversationId: convId,
      senderType: 'user',
      senderId: userId,
      senderName: '我',
      type: 'text',
      text,
    });
    await this.msgRepo.save(userMsgEntity);
    entity.updatedAt = new Date();
    await this.convRepo.save(entity);

    const userMsg = this._entityToMessage(userMsgEntity);

    // Rebuild AI history from DB if not in memory
    if (!this.conversationHistory.has(convId)) {
      const allMsgs = await this.msgRepo.find({ where: { conversationId: convId }, order: { createdAt: 'ASC' } });
      this.conversationHistory.set(convId, allMsgs.map((m) => ({
        role: m.senderType === 'user' ? 'user' : 'assistant',
        content: m.text,
        characterId: m.senderType === 'character' ? m.senderId : undefined,
      })));
    }

    const history = this.conversationHistory.get(convId)!;
    history.push({ role: 'user', content: text });

    const results: Message[] = [userMsg];

    if (entity.type === 'direct') {
      const charId = entity.participants[0];
      const profile = await this.characters.getProfile(charId);
      if (!profile) throw new Error(`Profile not found for ${charId}`);

      const intent = await this.ai.classifyIntent(text, profile.name, profile.expertDomains);

      if (intent.needsGroupChat && intent.requiredDomains.length > 0) {
        // 只在用户好友圈（已有会话的角色）内查找
        const userConversations = await this.convRepo.find({ where: { userId } });
        const userFriendIds = new Set(
          userConversations.flatMap((c) => c.participants).filter((id) => id !== charId),
        );

        const invitedChars = (await this.characters.findByDomains(intent.requiredDomains))
          .filter((c) => c.id !== charId && userFriendIds.has(c.id))
          .slice(0, 2);

        if (invitedChars.length > 0) {
          entity.type = 'group';
          entity.title = '临时咨询群';
          invitedChars.forEach((c) => {
            if (!entity.participants.includes(c.id)) entity.participants.push(c.id);
          });
          await this.convRepo.save(entity);

          const coordPrompt = `你是${profile.name}，你觉得用户的问题"${text}"超出了你的专长，需要${invitedChars.map((c) => c.name).join('和')}的帮助。用一句自然的话说你要拉群，不超过30字。`;
          const coordReply = await this.ai.generateReply({ profile, conversationHistory: history, userMessage: coordPrompt });
          const coordEntity = this.msgRepo.create({ id: `msg_${Date.now()}_coord`, conversationId: convId, senderType: 'character', senderId: charId, senderName: profile.name, type: 'text', text: coordReply.text });
          await this.msgRepo.save(coordEntity);
          results.push(this._entityToMessage(coordEntity));

          for (const invited of invitedChars) {
            const sysEntity = this.msgRepo.create({ id: `msg_${Date.now()}_sys_${invited.id}`, conversationId: convId, senderType: 'character', senderId: 'system', senderName: 'system', type: 'system', text: `${profile.name} 邀请 ${invited.name} 加入了群聊` });
            await this.msgRepo.save(sysEntity);
            results.push(this._entityToMessage(sysEntity));
          }

          for (const invited of invitedChars) {
            const invitedProfile = await this.characters.getProfile(invited.id);
            if (!invitedProfile) continue;
            const reply = await this.ai.generateReply({ profile: invitedProfile, conversationHistory: history, userMessage: text, isGroupChat: true });
            const aiEntity = this.msgRepo.create({ id: `msg_${Date.now()}_${invited.id}`, conversationId: convId, senderType: 'character', senderId: invited.id, senderName: invited.name, type: 'text', text: reply.text });
            await this.msgRepo.save(aiEntity);
            history.push({ role: 'assistant', content: reply.text, characterId: invited.id });
            results.push(this._entityToMessage(aiEntity));
          }

          await this.syncNarrativeArc(entity, userId);
          this.conversationHistory.set(convId, history);
          return results;
        }
      }

      const charEntity = await this.characters.findById(charId);
      const lastMsg = await this.msgRepo.findOne({ where: { conversationId: convId, senderType: 'user' }, order: { createdAt: 'DESC' } });
      const chatContext = {
        currentActivity: charEntity?.currentActivity,
        lastChatAt: lastMsg?.createdAt,
      };
      const reply = await this.ai.generateReply({ profile, conversationHistory: history, userMessage: text, chatContext });
      const aiEntity = this.msgRepo.create({ id: `msg_${Date.now()}_ai`, conversationId: convId, senderType: 'character', senderId: charId, senderName: profile.name, type: 'text', text: reply.text });
      await this.msgRepo.save(aiEntity);
      history.push({ role: 'assistant', content: reply.text });
      this.conversationHistory.set(convId, history);
      results.push(this._entityToMessage(aiEntity));

    } else {
      for (const charId of entity.participants) {
        const profile = await this.characters.getProfile(charId);
        if (!profile) continue;
        const reply = await this.ai.generateReply({ profile, conversationHistory: history, userMessage: text, isGroupChat: true });
        const aiEntity = this.msgRepo.create({ id: `msg_${Date.now()}_${charId}`, conversationId: convId, senderType: 'character', senderId: charId, senderName: profile.name, type: 'text', text: reply.text });
        await this.msgRepo.save(aiEntity);
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
        // 只更新 recentSummary，不覆盖 coreMemory
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

    await this.syncNarrativeArc(entity, userId);
    return results;
  }

  private async syncNarrativeArc(
    conversation: ConversationEntity,
    userId: string,
  ): Promise<void> {
    const primaryCharacterId = conversation.participants[0];
    if (!primaryCharacterId) {
      return;
    }

    const messageCount = await this.msgRepo.count({
      where: { conversationId: conversation.id },
    });

    if (messageCount < 4) {
      return;
    }

    const primaryCharacter = await this.characters.findById(primaryCharacterId);
    await this.narrativeService.recordConversationTurn({
      userId,
      characterId: primaryCharacterId,
      characterName: primaryCharacter?.name,
      messageCount,
    });
  }

  private _entityToConversation(e: ConversationEntity): Conversation {
    return {
      id: e.id,
      userId: e.userId,
      type: e.type as 'direct' | 'group',
      title: e.title,
      participants: e.participants,
      messages: [],
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  private _entityToMessage(e: MessageEntity): Message {
    return {
      id: e.id,
      conversationId: e.conversationId,
      senderType: e.senderType as 'user' | 'character' | 'system',
      senderId: e.senderId,
      senderName: e.senderName,
      type: e.type as 'text' | 'system' | 'proactive',
      text: e.text,
      createdAt: e.createdAt,
    };
  }
}
